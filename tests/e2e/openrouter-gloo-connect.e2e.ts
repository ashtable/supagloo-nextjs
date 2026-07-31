import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";
import {
  completeGithubConnectViaCallback,
  completeOpenRouterConnectViaCallback,
  interceptOpenRouter,
  openRouterKeyLast4,
} from "./connect-helpers";
import { resolveGithubLogin, resolveInstallationId } from "./github-e2e";

/**
 * Task 25 — the REAL OpenRouter (PKCE) + Gloo (verify-then-store) connect flows,
 * end to end against the real stack (browser → BFF routes → the containerised
 * supagloo-nodejs-api → Postgres) via the `?seed=` seam.
 *
 * ── PROVIDER POSTURE (kept current — this header used to be badly stale) ─────
 * There are NO provider stubs left anywhere in the harness. Task 34-E8 deleted the
 * openrouter/gloo/youversion stubs (this file's original header cited an
 * openrouter-stub on :4802 and a gloo-stub on :4803 long after both had gone), and
 * task 62 deleted the last two — the github-stub and the local git-server — so all
 * four providers are now exercised against their real hosts. "Provider stub" is out
 * of the vocabulary; the delta is REMOVING test-side base-URL overrides, not adding
 * configuration.
 *
 * Consequences for this spec, per hop:
 *   • OpenRouter's BROWSER leg (the hosted authorize page + the cross-origin token
 *     exchange) is still intercepted in-page by `interceptOpenRouter` — that is the
 *     sanctioned interactive-hop shim, not a stub: an OAuth consent screen needs a
 *     human, and the exchange is a cross-origin browser call. What the intercepted
 *     exchange hands back is the REAL `OPENROUTER_E2E_TEST_API_KEY` (root `.env`, via
 *     `tests/e2e/load-root-env.ts`) — the shim removes the consent click and nothing
 *     else — so the profile's masked `sk-or-••••••<last4>` is asserted against that
 *     key's own last-4 and the credit line against a LIVE balance.
 *   • Gloo's verify is a SERVER-side client-credentials call from the API to the
 *     real Gloo host. `gloo-invalid` is no longer a stub-reserved fixture: it is
 *     simply a credential real Gloo rejects, which is exactly what E-C2 needs
 *     (401 → API 400 → a real form error rather than local validation).
 *   • GitHub reuses Task 24's `completeGithubConnectViaCallback`, now with the
 *     runtime-DISCOVERED installation id (task-62 D5) rather than a fabricated
 *     literal, so the API's App-JWT verification runs against real api.github.com.
 *
 * Requires the real stack: Postgres + MinIO + the containerised API via the root
 * Compose files (brought up and gated by `tests/e2e/global-setup.render.ts`) with
 * SUPAGLOO_ENABLE_TEST_SEED=1 and real provider credentials; `next dev` on :3000;
 * and the root `.env` GitHub creds in this worker (`tests/e2e/load-root-env.ts`).
 * Runs in the `test:e2e:real` lane.
 * See scratch/task-25-openrouter-gloo-connect-ui.md §5.
 */

const BASE_URL = "http://localhost:3000";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SEED_FRESH_URL = `${BASE_URL}/?seed=authed-fresh&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

/**
 * ── THE APP-UNDER-TEST'S GLOO CREDENTIALS (real, from the environment) ───────
 *
 * These were the deleted gloo-stub's fixture literals (`gloo-e2e-client` /
 * `gloo-e2e-secret`) — the stub accepted any Basic pair except `gloo-invalid`. Task
 * 34-E8 deleted that stub, so real Gloo rejects them, E-C3 fails on "We couldn't
 * verify those credentials with Gloo", and E-C4/E-C5 cascade because the wizard never
 * completes. They now come from the environment, with no fallback (design-delta
 * §10.8: a suite that quietly degrades rather than failing is a green lie).
 *
 * ── WHY THE `GLOO_CONNECT_` PREFIX (task 34-E2) ──────────────────────────────
 * In THIS repo `GLOO_CLIENT_ID`/`GLOO_CLIENT_SECRET` are already taken: they
 * configure STAGEHAND's own LLM (`lib/gloo/llm-client.ts`) — the harness's brain,
 * nothing to do with the app's per-user Gloo connections. Reusing those names for the
 * app-under-test's credentials would have one file's meaning silently clobber the
 * other's. Hence the distinct `GLOO_CONNECT_*` names, which are nextjs-only (the api
 * and dbos repos have no Stagehand to collide with, so there this concept is just
 * `GLOO_CLIENT_ID`/`_SECRET`). Documented, NAMES ONLY, in `.env.example`; the values
 * live in the untracked `.env.local`, loaded into the worker by `tests/e2e/load-env.ts`.
 */
const GLOO_ID_ENV_VAR = "GLOO_CONNECT_CLIENT_ID";
const GLOO_SECRET_ENV_VAR = "GLOO_CONNECT_CLIENT_SECRET";

function requireGlooConnectCredential(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `[openrouter-gloo-connect] ${name} is unset or empty, so E-C3 cannot type ` +
        `credentials real Gloo will accept.\n` +
        `  Set ${GLOO_ID_ENV_VAR} + ${GLOO_SECRET_ENV_VAR} in this repo's untracked ` +
        `\`.env.local\` (copy the real values from the ROOT supagloo checkout's ` +
        `\`.env\`, where the same pair is named GLOO_CLIENT_ID/GLOO_CLIENT_SECRET).\n` +
        `  The GLOO_CONNECT_ prefix is mandatory here: plain GLOO_CLIENT_ID/SECRET in ` +
        `this repo belong to STAGEHAND's own LLM (task 34-E2).\n` +
        `  There is deliberately no fallback — the old literals were the deleted ` +
        `gloo-stub's fixtures and real Gloo rejects them.`,
    );
  }
  return value;
}

const GLOO_VALID_ID = requireGlooConnectCredential(GLOO_ID_ENV_VAR);
const GLOO_VALID_SECRET = requireGlooConnectCredential(GLOO_SECRET_ENV_VAR);

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

/** The live-credits readout, once it has SETTLED either way.
 *
 *  `data-status="connected"` is not a barrier for it: the card reaches `connected` off
 *  `GET /api/connections`, while the balance comes from a SEPARATE
 *  `GET /api/connections/openrouter/credits` that is still in flight at that moment.
 *  `E-C4` read the page in the gap and saw `Checking credits…` — measured at 226 ms and
 *  230 ms on two runs, against a credits call that took 152 ms and answered 200 both
 *  times. So the failure was the spec racing its own precondition, not the product.
 *
 *  This waits for a TERMINAL state and returns which one it is; it deliberately does NOT
 *  wait for the money shape. Waiting for the thing under assertion would make the
 *  assertion vacuous — "Credits unavailable" (a key real OpenRouter rejected) has to stay
 *  observable, because it is one of the two ways this can genuinely break. */
async function settledCreditsText(timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await testidText("connection-card-openrouter");
    if (!last.includes("Checking credits")) return last;
    await page.waitForTimeout(150);
  }
  throw new Error(
    `the OpenRouter card never left "Checking credits…" within ${timeoutMs}ms — the live ` +
      `GET /api/connections/openrouter/credits neither resolved nor errored. Last text: ` +
      `${JSON.stringify(last)}`,
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
    await completeGithubConnectViaCallback(stagehand.context, {
      installationId: await resolveInstallationId(),
    });
    await waitForStepLabel("STEP 3 OF 4 · OPENROUTER");

    // Kick off the real PKCE connect: pending + window.open(authorize) + stash the
    // verifier + the main-tab poll. Then simulate OpenRouter's redirect-back.
    await clickTestId("connect-openrouter-submit");
    // `opener: page` waits for the PKCE verifier to actually be stashed before the
    // callback tab opens — the store happens after an awaited SHA-256, so without the
    // barrier this is a race that presents as a bare `data-state="error"`.
    await completeOpenRouterConnectViaCallback(stagehand.context, { opener: page });

    // The poll observes the stored connection → connected → auto-advance to Gloo.
    await waitForStepLabel("STEP 4 OF 4 · GLOO AI");
  });

  test("E-C2: a LIVE Gloo verify failure surfaces as a real form error, not local validation", async () => {
    // Not a reserved fixture any more (the gloo-stub is gone): `gloo-invalid` is just
    // a client id real Gloo rejects → 401 at the API's live verify → API 400.
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
    // The DISCOVERED installation login, not a stub fixture literal (task-62 D5).
    expect(recap).toContain(`✓ GitHub connected · @${await resolveGithubLogin()}`);
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
    // The credits read is a SECOND, independent request that `connected` does not gate.
    // Barrier first, assert second — see `settledCreditsText`.
    await settledCreditsText();

    const text = await h.bodyText();
    // OpenRouter: the masked form of the REAL key that was stored (last4 DERIVED from
    // OPENROUTER_E2E_TEST_API_KEY — the old literal `cafe` was a property of the fake
    // key the intercepted exchange used to return).
    expect(text).toContain(`sk-or-••••••${openRouterKeyLast4()}`);
    // …and LIVE credits. The old exact `$87.50` was the deleted openrouter-stub's
    // fixture arithmetic (100 total − 12.5 used); a real balance moves with every run,
    // so assert the SHAPE the card renders (`formatCreditRemaining`). This still fails
    // loudly on the two ways this can actually break: "Credits unavailable" (the live
    // GET /api/connections/openrouter/credits errored — e.g. a key real OpenRouter
    // rejects) and "Checking credits…" (it never resolved).
    expect(text).toMatch(/\$[\d,]+\.\d{2} credit remaining/);
    expect(text).not.toContain("Credits unavailable");
    // Gloo: the REAL stored clientId (round-tripped from the API, never a fixture).
    expect(text).toContain(GLOO_VALID_ID);
    // GitHub: the login read back off the REAL installation.
    expect(text).toContain(`@${await resolveGithubLogin()}`);
  });

  test("E-C5: disconnect clears both providers server-side", async () => {
    // The disconnect fix makes the not-linked flip CONDITIONAL on the DELETE's
    // actual response: the card only reaches `data-status="not-linked"` after the
    // real `DELETE /api/connect/<provider>` resolved with a 2xx (a failed DELETE
    // keeps the card connected, so this wait would time out and fail loudly). So
    // `waitForStatus(..., "not-linked")` is now a GENUINE happens-after-DELETE
    // barrier — not the old timing coincidence where an un-awaited DELETE merely
    // happened to beat the follow-up read. Waiting for BOTH cards before the merged
    // read therefore makes the server-side assertion below a real post-condition.
    await clickTestId("disconnect-openrouter");
    await waitForStatus("connection-card-openrouter", "not-linked");
    await clickTestId("disconnect-gloo");
    await waitForStatus("connection-card-gloo", "not-linked");

    // Both DELETEs have provably resolved (per the barrier above) — a fresh merged
    // read must therefore show both cleared, with no race against an in-flight DELETE.
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
