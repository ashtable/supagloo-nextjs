import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";

/**
 * Task 23 — the BFF session layer + server-driven onboarding, exercised end to
 * end against the REAL stack (browser → BFF route handlers → supagloo-nodejs-api →
 * Postgres) via the EXTENDED Stagehand seam.
 *
 * Where the pure-client `?mock=` seam (onboarding-wizard.e2e.ts) fabricates a
 * session with zero network, `?seed=<scenario>` drives the real path: the
 * `SessionProvider` calls `POST /api/test/seed` (flag-gated) to mint a REAL
 * httpOnly session cookie, then loads the user from `GET /api/me`. The workspace
 * and wizard therefore render from SERVER data, and completing the wizard persists
 * `onboardingCompletedAt` server-side — proven by a FRESH browser context.
 *
 * DELIBERATELY Gloo-free (no `llmClient`) and fully deterministic (testids + exact
 * copy anchors), matching the onboarding-wizard spec. The seed identity uses a
 * distinct server name ("Grace Hopper" → GRACE) that the mock path never uses, so
 * the assertions prove the data is server-driven, not the mock's "Ash Srinivas".
 *
 * Requires the real stack: Postgres (compose) + the API on :4000 with
 * SUPAGLOO_ENABLE_TEST_SEED=1, and `next dev` on :3000 with SUPAGLOO_API_URL +
 * SUPAGLOO_ENABLE_TEST_SEED. RED until the four route handlers + the provider
 * rewiring ship (the `?seed=` seam renders the public landing today).
 */

const BASE_URL = "http://localhost:3000";
// A unique per-run nonce, SHARED by both browser contexts below, so the seeded
// server user is fresh every run (making this real-stack e2e repeatable) while
// context A and context B still resolve to the SAME user — which is what the
// persistence check needs.
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SEED_FRESH_URL = `${BASE_URL}/?seed=authed-fresh&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

function pageHelpers(page: StagehandPage) {
  const h = makeHelpers(page);
  return {
    h,
    countTestId: (id: string) => page.locator(`[data-testid="${id}"]`).count(),
    clickTestId: (id: string) => page.locator(`[data-testid="${id}"]`).click(),
    testidText: (id: string) =>
      page.evaluate((sel) => {
        const el = document.querySelector<HTMLElement>(`[data-testid="${sel}"]`);
        return (el?.textContent ?? "").trim();
      }, id),
    async waitForStepLabel(expected: string, timeoutMs = 8000) {
      const deadline = Date.now() + timeoutMs;
      let last = "";
      while (Date.now() < deadline) {
        last = await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>(
            '[data-testid="wizard-step-label"]',
          );
          return (el?.textContent ?? "").trim();
        });
        if (last === expected) return;
        await page.waitForTimeout(100);
      }
      throw new Error(
        `wizard-step-label never became ${JSON.stringify(expected)} (last: ${JSON.stringify(last)})`,
      );
    },
    async waitForTestId(id: string, timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if ((await page.locator(`[data-testid="${id}"]`).count()) > 0) return;
        await page.waitForTimeout(200);
      }
      throw new Error(`[data-testid="${id}"] never appeared within ${timeoutMs}ms`);
    },
  };
}

async function freshStagehand(): Promise<{ sh: Stagehand; page: StagehandPage }> {
  const sh = new Stagehand({ env: "LOCAL", verbose: 1 }); // Gloo-free
  await sh.init();
  const page = sh.context.pages()[0];
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  return { sh, page };
}

// ── Context A: first sign-in via the extended seam + complete the wizard ──────

let shA: Stagehand;
let pageA: StagehandPage;
let a: ReturnType<typeof pageHelpers>;
let hA: E2EHelpers;

beforeAll(async () => {
  ({ sh: shA, page: pageA } = await freshStagehand());
  a = pageHelpers(pageA);
  hA = a.h;
  await pageA.goto(SEED_FRESH_URL, { waitUntil: "load" });
  // The wizard only mounts AFTER the real seed + GET /api/me round-trips resolve a
  // not-yet-onboarded server user — so polling for it waits out the BFF calls.
  await a.waitForTestId("setup-wizard");
}, 120_000);

afterAll(async () => {
  await shA?.close();
});

describe("BFF session — first sign-in via the extended seam (real stack)", () => {
  test("E-B1: workspace renders from GET /v1/me (server name) with the wizard from server state", async () => {
    expect(await a.countTestId("setup-wizard")).toBeGreaterThan(0);
    expect(await hA.isVisibleByTestId("setup-wizard")).toBe(true);
    expect(await hA.isVisibleByTestId("modal-backdrop")).toBe(true);

    const text = await hA.bodyText();
    // The workspace behind the overlay carries the SERVER user's first name —
    // proving it came from GET /api/me, not the mock's hardcoded "Ash".
    expect(text).toContain("WELCOME BACK, GRACE.");
    // The wizard is driven by server onboarding state (onboardingCompletedAt null).
    expect(await a.testidText("wizard-step-label")).toBe("STEP 1 OF 4 · WELCOME");
    expect(text).toContain("WELCOME TO SUPAGLOO, GRACE.");
  });

  test("E-B2: completing the wizard (GitHub-only path) dismisses it and reveals the workspace", async () => {
    await a.clickTestId("wizard-get-started");
    await a.waitForStepLabel("STEP 2 OF 4 · CONNECT GITHUB");
    expect(await a.countTestId("wizard-skip")).toBe(0); // required gate, no skip

    await a.clickTestId("connect-authorize");
    await a.waitForStepLabel("STEP 3 OF 4 · OPENROUTER"); // mock OAuth auto-advance

    await a.clickTestId("wizard-skip");
    await a.waitForStepLabel("STEP 4 OF 4 · GLOO AI");

    await a.clickTestId("wizard-skip");
    await hA.waitForText("YOU'RE ALL SET.");

    // Finishing fires the REAL PATCH /api/me/onboarding, then dismisses the wizard.
    await a.clickTestId("wizard-finish");
    await hA.waitForGone("setup-wizard");
    await hA.waitForText("WELCOME BACK, GRACE.");
  });
});

// ── Context B: a FRESH browser context proves server-side persistence ─────────

describe("BFF session — onboardingCompletedAt persists across a fresh browser context", () => {
  test("E-B3: re-seeding the same user in a new context renders the workspace with NO wizard", async () => {
    const { sh: shB, page: pageB } = await freshStagehand();
    const b = pageHelpers(pageB);
    try {
      await pageB.goto(SEED_FRESH_URL, { waitUntil: "load" });
      // Fresh cookie jar → a new session for the SAME server user (upsert by
      // youversionUserId), whose onboardingCompletedAt was preserved server-side.
      await b.h.waitForText("WELCOME BACK, GRACE.");
      // Because the server remembers onboarding, the first-time wizard never shows.
      await b.h.waitForGone("setup-wizard");
      expect(await b.countTestId("setup-wizard")).toBe(0);
    } finally {
      await shB.close();
    }
  }, 120_000);
});
