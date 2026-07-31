import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";
import {
  GUARDRAIL_REDIRECT_MS,
  PROFILE_CONNECTIONS_URL,
} from "../../lib/workspace/connection-guardrail";

/**
 * R1 / R2 / R3 — connections become OPTIONAL at onboarding and are enforced at the point of
 * use, driven end to end against the REAL stack (browser → BFF → supagloo-nodejs-api →
 * Postgres).
 *
 * ── Why this spec makes ZERO provider and ZERO GitHub egress ────────────────────────
 *
 * Every case here is about a user who has connected NOTHING. That is not a compromise to
 * keep the lane cheap; it is the exact state R1/R2/R3 are written about. The real lane
 * creates real private GitHub repos and spends real credit, and its cost axis forbids
 * in-suite teardown — so a spec that can make its claims without egress must.
 *
 * R4–R8 are deliberately NOT here. Defaults and disabled states are provable without a
 * network at all, and `studio-model-cost.e2e.ts` already drives the connected Inspector
 * against the live catalogues. Adding a second real-lane project scaffold to assert a
 * `<select>`'s value would buy nothing and cost a repo.
 *
 * ── What still requires the real stack ──────────────────────────────────────────────
 *
 * All three requirements are about SERVER state that no unit test can see:
 *   · R1's skip has to leave GitHub genuinely unconnected in the database while the wizard
 *     still advances;
 *   · R2's whole claim is that dismissal persists `User.onboardingCompletedAt` — proven
 *     only by a FRESH browser context re-seeding the same user (the `E-B3` pattern);
 *   · R3's redirect target is `/profile`, which bounces `firstSignIn` users straight back
 *     to `/` — so `E-OC3` passing at all is also the proof that R2 landed before R3.
 *
 * Requires Compose (postgres + api with `SUPAGLOO_ENABLE_TEST_SEED=1`) and `next dev` on
 * :3000. No `skip`, no conditional body, no silent `return`: a spec that can quietly not run
 * is a green lie (`E-SH2`, 2026-07-30).
 */

const BASE_URL = "http://localhost:3000";
/** One nonce for the whole file, SHARED by both browser contexts — so the seeded server
 *  user is fresh every run (repeatable) while context A and context B still resolve to the
 *  SAME user, which is what R2's persistence claim needs. */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
/** `authed-fresh`, never `authed-returning`: the latter pre-marks GitHub + OpenRouter
 *  connected in the CLIENT regardless of the database (`session-model.ts`'s
 *  `connectionsSeed = "wireframe"`), which would make every assertion below meaningless.
 *  It has already turned a connect helper into a silent no-op once. */
const SEED_FRESH_URL = `${BASE_URL}/?seed=authed-fresh&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

function pageHelpers(page: StagehandPage) {
  const h = makeHelpers(page);
  return {
    h,
    page,
    countTestId: (id: string) => page.locator(`[data-testid="${id}"]`).count(),
    clickTestId: (id: string) => page.locator(`[data-testid="${id}"]`).click(),
    testidText: (id: string) =>
      page.evaluate((sel) => {
        const el = document.querySelector<HTMLElement>(`[data-testid="${sel}"]`);
        return (el?.textContent ?? "").trim();
      }, id),
    async waitForStepLabel(expected: string, timeoutMs = 15_000) {
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
    /** `next dev` compiles each page and each API route on its first request, so the first
     *  poll of a run can be paying a compile inside its own budget — never a bare timeout. */
    async waitForTestId(id: string, timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if ((await page.locator(`[data-testid="${id}"]`).count()) > 0) return;
        await page.waitForTimeout(150);
      }
      throw new Error(`[data-testid="${id}"] never appeared within ${timeoutMs}ms`);
    },
    async waitForPath(fragment: string, timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs;
      let last = "";
      while (Date.now() < deadline) {
        last = await page.evaluate(() => window.location.pathname);
        if (last.includes(fragment)) return;
        await page.waitForTimeout(150);
      }
      throw new Error(
        `location.pathname never contained ${JSON.stringify(fragment)} (last: ${JSON.stringify(last)})`,
      );
    },
    /** The three provider statuses the SERVER holds, straight off the BFF — not the client
     *  reducer, which seeds not-linked and only ever hydrates upwards. */
    connectionsFromServer: () =>
      page.evaluate(async () => {
        const res = await fetch("/api/connections", { cache: "no-store" });
        if (!res.ok) return { error: res.status };
        return (await res.json()) as Record<string, unknown>;
      }),
  };
}

async function freshStagehand(): Promise<{ sh: Stagehand; page: StagehandPage }> {
  const sh = new Stagehand({ env: "LOCAL", verbose: 1 }); // Gloo-free
  await sh.init();
  const page = sh.context.pages()[0];
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  return { sh, page };
}

let sh: Stagehand;
let page: StagehandPage;
let a: ReturnType<typeof pageHelpers>;
let h: E2EHelpers;

beforeAll(async () => {
  ({ sh, page } = await freshStagehand());
  a = pageHelpers(page);
  h = a.h;
  await page.goto(SEED_FRESH_URL, { waitUntil: "load" });
  // The wizard only mounts once the real seed + `GET /api/me` round-trips resolve a
  // not-yet-onboarded SERVER user, so polling for it waits the BFF calls out.
  await a.waitForTestId("setup-wizard");
}, 180_000);

afterAll(async () => {
  await sh?.close();
});

describe("R1 — connections are optional in the first-time setup wizard", () => {
  test("E-OC1: the GitHub step can be SKIPPED, and the user is still connected to nothing", async () => {
    // Before R1 this walk was impossible: `canAdvance("github", …)` was false until GitHub
    // connected and `GithubStep` rendered no escape at all — so any bug in the GitHub flow
    // locked a new user out of the entire product. That single point of failure is what R1
    // removes.
    await a.clickTestId("wizard-get-started");
    await a.waitForStepLabel("STEP 2 OF 4 · CONNECT GITHUB");

    // A DISTINCT testid. `wizard-skip` is already used twice in the codebase (the
    // OpenRouter step and the Gloo form); a third would make every
    // `clickTestId("wizard-skip")` in this lane a coin flip.
    expect(await a.countTestId("wizard-skip-github")).toBe(1);
    expect(await a.countTestId("wizard-skip")).toBe(0);

    await a.clickTestId("wizard-skip-github");
    await a.waitForStepLabel("STEP 3 OF 4 · OPENROUTER");

    // …and nothing was connected on the way past. Read from the SERVER, because that is the
    // only place that can distinguish "skipped" from "connected and the UI has not caught
    // up" — and because the whole point of R1 is that the account is genuinely empty here.
    const conns = (await a.connectionsFromServer()) as Record<string, unknown>;
    expect(conns.github).toBeNull();
    expect(conns.openrouter).toBeNull();
    expect(conns.gloo).toBeNull();
  });
});

describe("R2 — dismissing the wizard counts as having completed it", () => {
  test("E-OC2: dismissal persists onboarding across a FRESH browser context", async () => {
    // `markOnboarded` → `PATCH /v1/me/onboarding` → `User.onboardingCompletedAt`. The
    // requirement is explicitly about SUBSEQUENT logins, so the only honest proof is a new
    // cookie jar resolving the same server user (upsert by `youversionUserId`).
    await a.clickTestId("wizard-dismiss");
    await h.waitForGone("setup-wizard");
    await h.waitForText("WELCOME BACK, GRACE.");

    const { sh: shB, page: pageB } = await freshStagehand();
    const b = pageHelpers(pageB);
    try {
      await pageB.goto(SEED_FRESH_URL, { waitUntil: "load" });
      await b.h.waitForText("WELCOME BACK, GRACE.");
      await b.h.waitForGone("setup-wizard");
      expect(await b.countTestId("setup-wizard")).toBe(0);
    } finally {
      await shB.close();
    }
  }, 180_000);
});

describe("R3 — the create/import connection guardrail", () => {
  /** Back to a settled workspace before each case: `E-OC3` and `E-OC4` both end on
   *  `/profile`, and re-seeding the same user is cheap and re-asserts the R2 state. */
  async function backToWorkspace() {
    await page.goto(SEED_FRESH_URL, { waitUntil: "load" });
    await a.waitForTestId("workspace-home");
    await h.waitForText("WELCOME BACK, GRACE.");
    expect(await a.countTestId("setup-wizard")).toBe(0);
  }

  test("E-OC3: `＋ New project` refuses, explains, and its CTA reaches the profile anchor", async () => {
    await backToWorkspace();
    await a.clickTestId("workspace-new-project");
    await a.waitForTestId("connections-required");
    const openedAt = Date.now();

    // The wizard itself must NOT have opened. Step 1 of both wizards immediately needs live
    // GitHub data (owner login, repo lists) and has no designed empty state, which is why
    // the gate is at the launcher rather than inside the wizard.
    expect(await a.countTestId("new-project-wizard")).toBe(0);
    // The rows carry LIVE state — this account has none of the three.
    for (const provider of ["github", "openrouter", "gloo"]) {
      const row = await page.evaluate((p) => {
        const el = document.querySelector<HTMLElement>(
          `[data-testid="connections-required-row-${p}"]`,
        );
        return el?.dataset.connected ?? null;
      }, provider);
      expect(row, `${provider} row`).toBe("false");
    }

    await a.clickTestId("connections-required-cta");
    await a.waitForPath("/profile");
    await a.waitForTestId("profile-page");

    // The CTA is what navigated, not the auto-redirect: this landed inside the redirect
    // budget. (`E-OC4` proves the timer independently, with no click at all.)
    expect(Date.now() - openedAt).toBeLessThan(GUARDRAIL_REDIRECT_MS);

    // R3 sends the user to "the profile page SECTION holding the setup", so the anchor has
    // to exist — a fragment that resolves to nothing is a navigation that lands the user at
    // the top of a page and leaves them to find it.
    const anchor = await page.evaluate(
      () => document.getElementById("connections") !== null,
    );
    expect(anchor).toBe(true);
    expect(PROFILE_CONNECTIONS_URL).toBe("/profile#connections");
    // And all three cards are there to be acted on.
    for (const provider of ["github", "openrouter", "gloo"]) {
      expect(
        await a.countTestId(`connection-card-${provider}`),
        `${provider} card`,
      ).toBe(1);
    }
  }, 180_000);

  test("E-OC4: `Import repo` refuses the same way, and auto-redirects with NO click", async () => {
    await backToWorkspace();
    await a.clickTestId("workspace-import-repo");
    await a.waitForTestId("connections-required");
    expect(await a.countTestId("import-wizard")).toBe(0);

    // R3, verbatim: "if they do not click it, they are auto-redirected there anyway."
    // Nothing below touches the page — the navigation has to happen on its own.
    await a.waitForPath("/profile", GUARDRAIL_REDIRECT_MS + 20_000);
    await a.waitForTestId("profile-page");
  }, 180_000);
});
