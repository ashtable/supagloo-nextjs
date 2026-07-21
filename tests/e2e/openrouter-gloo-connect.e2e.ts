import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";
import {
  completeGithubConnectViaCallback,
  completeOpenRouterConnectViaCallback,
  interceptOpenRouter,
  E2E_OPENROUTER_LAST4,
} from "./connect-helpers";

/**
 * Task 25 — the REAL OpenRouter (PKCE) + Gloo (verify-then-store) connect flows,
 * end to end against the real stack (browser → BFF routes → supagloo-nodejs-api →
 * Postgres + openrouter-stub :4802 + gloo-stub :4803) via the `?seed=` seam.
 *
 * OpenRouter's browser leg (authorize page + token exchange) is route-intercepted
 * (`interceptOpenRouter`) because the stub can't render OpenRouter's hosted HTML —
 * the intercepted token exchange returns a deterministic key whose last-4 (`cafe`)
 * the profile must render masked as `sk-or-••••••cafe`. GitHub reuses Task 24's
 * `completeGithubConnectViaCallback`; OpenRouter uses `completeOpenRouterConnectViaCallback`
 * (a throwaway page → the client callback page that completes the exchange + key POST).
 *
 * Gloo needs no interception — the gloo-stub is reached server-side by the API's
 * live client-credentials verify; the reserved `gloo-invalid` clientId makes that
 * verify fail (401 → API 400), proving the failure surfaces as a REAL form error.
 *
 * Requires the real stack: Postgres (compose), the stubs, the API on :4000 with
 * OPENROUTER_BASE_URL/GLOO_BASE_URL → the stubs + SUPAGLOO_ENABLE_TEST_SEED=1, and
 * `next dev` on :3000. See scratch/task-25-openrouter-gloo-connect-ui.md §5.
 */

const BASE_URL = "http://localhost:3000";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SEED_FRESH_URL = `${BASE_URL}/?seed=authed-fresh&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

// Valid Gloo creds: the gloo-stub accepts ANY Basic pair except `gloo-invalid`.
const GLOO_VALID_ID = "gloo-e2e-client";
const GLOO_VALID_SECRET = "gloo-e2e-secret";

let stagehand: Stagehand;
let page: StagehandPage;
let h: E2EHelpers;

function countTestId(id: string) {
  return page.locator(`[data-testid="${id}"]`).count();
}
function clickTestId(id: string) {
  return page.locator(`[data-testid="${id}"]`).click();
}
function testidText(id: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${sel}"]`);
    return (el?.textContent ?? "").trim();
  }, id);
}
function dataAttr(id: string, attr: string) {
  return page.evaluate(
    ({ i, a }) =>
      document.querySelector<HTMLElement>(`[data-testid="${i}"]`)?.getAttribute(a) ?? null,
    { i: id, a: attr },
  );
}
/** Set a React-controlled input's value the way React sees it (native setter +
 *  input event), then fire change — Playwright-free so it works on the understudy. */
function typeInto(id: string, value: string) {
  return page.evaluate(
    ({ i, v }) => {
      const el = document.querySelector<HTMLInputElement>(`[data-testid="${i}"]`);
      if (!el) throw new Error(`no input [data-testid="${i}"]`);
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { i: id, v: value },
  );
}
async function waitForTestId(id: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(id)) > 0) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`[data-testid="${id}"] never appeared within ${timeoutMs}ms`);
}
async function waitForStepLabel(expected: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await testidText("wizard-step-label");
    if (last === expected) return;
    await page.waitForTimeout(150);
  }
  throw new Error(
    `wizard-step-label never became ${JSON.stringify(expected)} (last: ${JSON.stringify(last)})`,
  );
}
async function waitForStatus(id: string, expected: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last: string | null = null;
  while (Date.now() < deadline) {
    last = await dataAttr(id, "data-status");
    if (last === expected) return;
    await page.waitForTimeout(150);
  }
  throw new Error(
    `[data-testid="${id}"] data-status="${last}" never became "${expected}" within ${timeoutMs}ms`,
  );
}

beforeAll(async () => {
  stagehand = new Stagehand({ env: "LOCAL", verbose: 1 }); // Gloo-free
  await stagehand.init();
  page = stagehand.context.pages()[0];
  h = makeHelpers(page);
  await interceptOpenRouter(stagehand.context); // fake OpenRouter's browser leg
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  await page.goto(SEED_FRESH_URL, { waitUntil: "load" });
  await waitForTestId("setup-wizard");
}, 120_000);

afterAll(async () => {
  await stagehand?.close();
});

describe("OpenRouter + Gloo connect (real) — wizard + profile", () => {
  test("E-C1: OpenRouter PKCE connect resolves via the poll and auto-advances to Gloo", async () => {
    // Welcome → GitHub gate (reuse Task 24's real callback) → OpenRouter step.
    await clickTestId("wizard-get-started");
    await waitForStepLabel("STEP 2 OF 4 · CONNECT GITHUB");
    await clickTestId("connect-authorize");
    await completeGithubConnectViaCallback(stagehand.context);
    await waitForStepLabel("STEP 3 OF 4 · OPENROUTER");

    // Kick off the real PKCE connect: pending + window.open(authorize) + stash the
    // verifier + the main-tab poll. Then simulate OpenRouter's redirect-back.
    await clickTestId("connect-openrouter-submit");
    await completeOpenRouterConnectViaCallback(stagehand.context);

    // The poll observes the stored connection → connected → auto-advance to Gloo.
    await waitForStepLabel("STEP 4 OF 4 · GLOO AI");
  });

  test("E-C2: a LIVE Gloo verify failure surfaces as a real form error, not local validation", async () => {
    // `gloo-invalid` is the stub's reserved bad-credential fixture → 401 → API 400.
    await typeInto("gloo-client-id", "gloo-invalid");
    await typeInto("gloo-secret", "whatever-secret");
    await clickTestId("gloo-save");

    // The error is the API's real verify rejection (round-tripped), and the wizard
    // did NOT advance — Gloo is still not connected.
    await waitForTestId("gloo-error");
    const err = await testidText("gloo-error");
    expect(err.length).toBeGreaterThan(0);
    expect(await testidText("wizard-step-label")).toBe("STEP 4 OF 4 · GLOO AI");
  });

  test("E-C3: valid Gloo creds save & verify → connected → Done → workspace", async () => {
    await typeInto("gloo-client-id", GLOO_VALID_ID);
    await typeInto("gloo-secret", GLOO_VALID_SECRET);
    await clickTestId("gloo-save");

    await h.waitForText("YOU'RE ALL SET.");
    const recap = await h.bodyText();
    expect(recap).toContain("✓ GitHub connected · @acme");
    expect(recap).toContain("✓ OpenRouter connected");
    expect(recap).toContain("✓ Gloo AI connected");

    await clickTestId("wizard-finish");
    await h.waitForGone("setup-wizard");
    await h.waitForText("WELCOME BACK, GRACE.");
  });

  test("E-C4: /profile reflects the REAL stored state (masked key, live credits, clientId)", async () => {
    // Client-side nav (router.push) keeps the resolved server session — no redirect
    // race (contrast Task 24's deferred deep-link).
    await clickTestId("workspace-profile-pill");
    await waitForTestId("menu-account-settings");
    await clickTestId("menu-account-settings");
    await waitForTestId("profile-page");

    await waitForStatus("connection-card-openrouter", "connected");
    await waitForStatus("connection-card-gloo", "connected");

    const text = await h.bodyText();
    // OpenRouter: the REAL masked key from the intercepted exchange (last4 `cafe`)…
    expect(text).toContain(`sk-or-••••••${E2E_OPENROUTER_LAST4}`);
    // …and LIVE credits (stub: 100 total − 12.5 used = 87.5 remaining).
    expect(text).toContain("$87.50 credit remaining");
    // Gloo: the REAL stored clientId (never the mock).
    expect(text).toContain(GLOO_VALID_ID);
    // GitHub: the stub's real login.
    expect(text).toContain("@acme");
  });

  test("E-C5: disconnect clears both providers server-side", async () => {
    await clickTestId("disconnect-openrouter");
    await waitForStatus("connection-card-openrouter", "not-linked");
    await clickTestId("disconnect-gloo");
    await waitForStatus("connection-card-gloo", "not-linked");

    // The real DELETEs fired — a fresh merged read shows both cleared.
    const merged = await page.evaluate(async () => {
      const res = await fetch("/api/connections", { cache: "no-store" });
      return res.json();
    });
    expect(merged.openrouter).toBeNull();
    expect(merged.gloo).toBeNull();

    // …and the not-linked cards offer their reconnect affordances again.
    expect(await countTestId("card-connect-openrouter")).toBeGreaterThan(0);
    expect(await countTestId("gloo-save")).toBeGreaterThan(0);
  });
});
