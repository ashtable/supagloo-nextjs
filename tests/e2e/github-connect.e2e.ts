import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";
import { completeGithubConnectViaCallback } from "./connect-helpers";

/**
 * Task 24 — the REAL GitHub App connect flow in the onboarding wizard's step 2/4,
 * exercised end to end against the real stack (browser → BFF routes →
 * supagloo-nodejs-api → Postgres + github-stub) via the `?seed=` seam.
 *
 * Where Task 23 left the wizard's github step MOCKED even in seed mode (a 350ms
 * timer with a hardcoded "@ashsrinivas"), Task 24 makes it real (design-delta
 * §5.3/§6a): clicking Authorize opens `/api/connect/github/start` and the main tab
 * POLLS `GET /api/connections` until the callback has stored the connection —
 * `pending` spans that real round-trip. The github-stub can't render GitHub's own
 * install-picker page, so `completeGithubConnectViaCallback` simulates GitHub's
 * redirect-back by driving `/api/connect/github/callback` directly (see that
 * helper). The proof the flow is REAL, not mock: the Done recap shows the stub's
 * `account.login` — `@acme` — not the mock `@ashsrinivas`.
 *
 * DELIBERATELY Gloo-free (no llmClient), fully deterministic (testids + exact-copy
 * anchors). Per-run nonce so the seeded user is fresh each run.
 *
 * Requires the real stack: Postgres (compose) + the API on :4000 with a VALID
 * GitHub App key and GITHUB_API_BASE_URL → the github-stub (:4801) and
 * SUPAGLOO_ENABLE_TEST_SEED=1; and `next dev` on :3000 with SUPAGLOO_API_URL +
 * SUPAGLOO_ENABLE_TEST_SEED. See scratch/task-24-github-connect-ui.md §5.
 */

const BASE_URL = "http://localhost:3000";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SEED_FRESH_URL = `${BASE_URL}/?seed=authed-fresh&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

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

beforeAll(async () => {
  stagehand = new Stagehand({ env: "LOCAL", verbose: 1 }); // Gloo-free
  await stagehand.init();
  page = stagehand.context.pages()[0];
  h = makeHelpers(page);
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  await page.goto(SEED_FRESH_URL, { waitUntil: "load" });
  // The wizard mounts only after the real seed + GET /api/me resolve a
  // not-yet-onboarded server user.
  await waitForTestId("setup-wizard");
}, 120_000);

afterAll(async () => {
  await stagehand?.close();
});

describe("GitHub connect (real) — wizard step 2/4", () => {
  test("E-G1: the required GitHub step renders with no skip", async () => {
    await clickTestId("wizard-get-started");
    await waitForStepLabel("STEP 2 OF 4 · CONNECT GITHUB");

    const text = await h.bodyText();
    for (const a of [
      "REQUIRED",
      "CONNECT YOUR GITHUB",
      "SUPAGLOO WILL BE ABLE TO",
      "Authorize with GitHub",
      "Opens GitHub in a new tab",
    ]) {
      expect(text, `github-step anchor missing: ${a}`).toContain(a);
    }
    // Hard gate — the required GitHub step offers no skip.
    expect(await countTestId("wizard-skip")).toBe(0);
  });

  test("E-G2: authorizing → real BFF/API round-trip → pending resolves → auto-advance", async () => {
    // Kick off the real connect: pending + window.open(start) + the main-tab poll.
    await clickTestId("connect-authorize");
    // Simulate GitHub's redirect-back into the real callback (stores via the API).
    await completeGithubConnectViaCallback(stagehand.context);
    // The poll observes the stored connection and opens the gate → step 3.
    await waitForStepLabel("STEP 3 OF 4 · OPENROUTER");
  });

  test("E-G3: Done recap carries the REAL githubLogin (@acme), then finishing reveals the workspace", async () => {
    // Skip the two optional providers (Task 25 wires them); they stay not-linked.
    await clickTestId("wizard-skip");
    await waitForStepLabel("STEP 4 OF 4 · GLOO AI");
    await clickTestId("wizard-skip");
    await h.waitForText("YOU'RE ALL SET.");

    const text = await h.bodyText();
    // The stub's installation account.login is "acme" — proves the REAL login
    // flowed through the whole BFF↔API round-trip, NOT the mock "@ashsrinivas".
    expect(text).toContain("✓ GitHub connected · @acme");
    expect(text).not.toContain("@ashsrinivas");
    // The optional providers were skipped (doneRecap templates from real state).
    expect(text).toContain("— OpenRouter skipped · add later in Profile");
    expect(text).toContain("— Gloo AI skipped · add later in Profile");

    await clickTestId("wizard-finish");
    await h.waitForGone("setup-wizard");
    await h.waitForText("WELCOME BACK, GRACE.");
  });
});
