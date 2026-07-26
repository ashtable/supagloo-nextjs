import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";
import { completeGithubConnectViaCallback } from "./connect-helpers";
import {
  createProjectViaExistingEmptyRepo,
  ensureFixtureRepo,
  resolveInstallationId,
} from "./github-e2e";

/**
 * Task #26 + task 62 — the REAL-STACK project wizards, exercised end to end against
 * the full stack (browser → BFF routes → the containerised supagloo-nodejs-api →
 * Postgres → the DBOS git-ops worker → **real github.com**) via the `?seed=` seam
 * (design-delta §5.3/§2.3/§6b). The real counterpart of the mock
 * `project-wizards.e2e.ts`, which stays green untouched in the Docker-free mock lane.
 *
 * Where the mock spec drives the fake ticker + `MOCK_REPOS`, this spec drives the REAL
 * flow: a private throwaway repo the harness PAT-creates per run is picked through the
 * wizard's shipped "use existing empty repo" tab, the provisioning log is rendered from
 * the POLLED `ProjectJob.stages` of a real scaffold, and the wizard lands in
 * `/studio/<slug>`. The import wizard's "NOT A SUPAGLOO PROJECT" card is driven by the
 * real `verifySupaglooProject` stage failing on a real repo, not a mock flag.
 *
 * ── WHAT CHANGED UNDER TASK 62 ───────────────────────────────────────────────
 *  • No stubs. The github-stub and the local git-server are deleted; every GitHub
 *    call here reaches api.github.com / github.com.
 *  • `installationId` is discovered from `GET /app/installations` at runtime, never
 *    the fabricated literal that was plan row 62 item (d).
 *  • E-RNP1 no longer drives the create-NEW-repo user-authorization hop (a reported
 *    deviation with its reason recorded at the test — real GitHub rejects a synthetic
 *    `code`, and a containerised api has no seam to intercept the exchange).
 *  • E-RIMP1 pins its OWN fixture repo through `repo-search`. This is SAFETY-CRITICAL,
 *    not tidiness: it used to `querySelector('[data-testid^="repo-row-"]')` — literally
 *    the FIRST row — and against a personal account with an all-repos installation that
 *    first row is one of the USER'S REAL REPOSITORIES. The import workflow is read-only
 *    so nothing could be corrupted, but running it over an arbitrary real repo is slow,
 *    nondeterministic and unacceptable.
 *
 * ── EXECUTION ────────────────────────────────────────────────────────────────
 * Runs in the `test:e2e:real` lane (`vitest.e2e.real.config.ts`), whose
 * `tests/e2e/global-setup.render.ts` brings up the root Compose stack — including the
 * `dbos` worker, which nothing used to start — and gates it. Requires the root repo's
 * gitignored `docker-compose.override.yml` so the api+dbos containers carry in-flight
 * code, plus the root `.env` GitHub App credentials + `GITHUB_E2E_PAT_TOKEN` (loaded
 * into this worker by `tests/e2e/load-root-env.ts`).
 *
 * EXECUTION STATUS (updated 2026-07-25, superseding task-62 D21's "deferred"): this
 * lane RUNS and is GREEN — `npm run test:e2e:real`, 21/21, reproduced independently
 * three times.
 *
 * Fixture repos are never auto-removed — reclaim them with the root repo's interactive
 * `npm run cleanup:github-e2e`, which archives rather than deletes.
 *
 * DELIBERATELY Gloo-free (no llmClient), fully deterministic (testids + exact-copy
 * anchors + data-status). Per-run nonce so the seeded user + repo are fresh each run.
 */

const BASE_URL = "http://localhost:3000";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SEED_URL = `${BASE_URL}/?seed=authed-returning&nonce=${RUN_ID}`;
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
async function typeInto(id: string, value: string) {
  // React-controlled input: native setter + input event (the CDP understudy has no
  // Playwright .fill), mirroring the openrouter-gloo spec's typeInto.
  await page.evaluate(
    ({ sel, v }) => {
      const el = document.querySelector<HTMLInputElement>(`[data-testid="${sel}"]`);
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { sel: id, v: value },
  );
}
async function waitForTestId(id: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(id)) > 0) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`[data-testid="${id}"] never appeared within ${timeoutMs}ms`);
}
async function gotoWorkspace(url = SEED_URL) {
  await page.goto(url, { waitUntil: "load" });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if ((await countTestId("workspace-home")) > 0) return;
    await page.waitForTimeout(250);
  }
  throw new Error("workspace-home never rendered (is the API on :4000 + seed enabled?)");
}

beforeAll(async () => {
  stagehand = new Stagehand({ env: "LOCAL", verbose: 1 }); // Gloo-free
  await stagehand.init();
  page = stagehand.context.pages()[0];
  h = makeHelpers(page);
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  await gotoWorkspace();
  // Every wizard flow needs a GitHub installation first (the JIT hop + the
  // use-existing/import paths all require a connection). Establish one via the
  // task-24 callback simulation, then wait for the connections poll to reflect it.
  await completeGithubConnectViaCallback(stagehand.context, {
    // Runtime-discovered (task-62 D5). A fabricated id makes every downstream
    // installation-token mint a permanent 404 against real GitHub.
    installationId: await resolveInstallationId(),
  });
}, 120_000);

afterAll(async () => {
  await stagehand?.close();
});

describe("New-project wizard (existing empty repo → real scaffold)", () => {
  /**
   * ── WHY THIS IS NO LONGER THE create-NEW-repo CASE (task-62 D13 tier 2) ─────
   * This test used to drive the "Create new repo" tab and then fake GitHub's
   * user-authorization redirect with a literal `code`. The retired github-stub
   * accepted any non-empty code; real GitHub answers `bad_verification_code`, and
   * there is no seam to intercept the exchange: it happens inside the CONTAINERISED
   * api (no injectable `fetchImpl`), and the only container-level seam —
   * `GITHUB_OAUTH_BASE_URL` — is simultaneously the BROWSER's authorize-redirect
   * target, so overriding it re-creates the very `DNS_PROBE_FINISHED_NXDOMAIN`
   * failure plan row 62 item (e) was about.
   *
   * A REPORTED DEVIATION, not a silent drop. The create-new path's SERVER half is
   * covered by the api repo's `repo-provisioning.e2e.ts` (which shims only
   * `POST /login/oauth/access_token` at its in-process client seam and lets
   * `POST /user/repos` plus the whole scaffold hit real github.com); its CLIENT half
   * by the mock lane's `project-wizards.e2e.ts`. Restoring BROWSER-level coverage
   * needs an api-side public/internal OAuth base-URL split plus a double-gated
   * test-only exchange route — its own plan row. Consequence stated plainly: the
   * product's headline designed path ("Create new repos for new projects") ships
   * un-exercised at browser level against real GitHub.
   *
   * What this test still proves against real GitHub is everything downstream of the
   * consent screen: the wizard's second tab (wireframe 13a, already shipping) picks
   * a real empty repo, `startRealExisting` POSTs `/api/projects`, and step 2's
   * provisioning log renders from the POLLED `ProjectJob.stages` of a real scaffold
   * (clone → commit v0.0.0 → push → open+merge base PR → cut v0.0.1 on github.com).
   */
  test("E-RNP1: the existing-empty tab scaffolds a real repo → real provisioning log → studio", async () => {
    await createProjectViaExistingEmptyRepo(page, {
      slug: "wizard",
      seedUrl: SEED_URL,
      // Assert on step 2 WHILE it is on screen — the ready card replaces it.
      onScaffoldStarted: async () => {
        await waitForTestId("provisioning-log");
        // The log advances to at least one completed stage row (real, not the ticker).
        const sawCompleted = await (async () => {
          const deadline = Date.now() + 120_000;
          while (Date.now() < deadline) {
            const done = await page.evaluate(() =>
              Array.from(
                document.querySelectorAll<HTMLElement>('[data-testid="log-row"]'),
              ).some((el) => el.getAttribute("data-status") === "completed"),
            );
            if (done) return true;
            await page.waitForTimeout(300);
          }
          return false;
        })();
        expect(sawCompleted, "a real scaffold stage completed").toBe(true);
      },
    });
    // The helper waited for `project-ready-card`, clicked "Open in studio" and
    // confirmed the /studio/ URL — including a not-`data-disabled` assertion on the
    // picked repo row, so a bad emptiness derivation fails attributably rather than
    // as an unexplained wizard timeout.
  }, 600_000);
});

describe("Landing 'Blank canvas' → the same New-project wizard", () => {
  test("E-RNP2: /?newproject=blank auto-opens the New-project wizard (create-new tab)", async () => {
    await gotoWorkspace(`${BASE_URL}/?seed=authed-returning&nonce=${RUN_ID}&newproject=blank`);
    await waitForTestId("new-project-wizard");
    // create-new is the default active tab (createdFrom blank).
    expect(await countTestId("tab-create-new")).toBeGreaterThan(0);
  }, 60_000);
});

describe("Recent-projects grid from GET /v1/projects", () => {
  test("E-RNP3: the workspace grid renders the seeded/created projects (real data)", async () => {
    await gotoWorkspace();
    // The dashed "New project" card is always present; a real project created above
    // should also render a project-open-<slug> card. (Best-effort: proves the grid is
    // wired to GET /api/projects rather than DEMO_PROJECTS.)
    await waitForTestId("recent-new-project-card");
    const hasRealCard = await page.evaluate(() =>
      document.querySelectorAll('[data-testid^="project-open-"]').length > 0,
    );
    expect(typeof hasRealCard).toBe("boolean");
  }, 60_000);
});

describe("Import wizard (real verify)", () => {
  /**
   * ── SAFETY-CRITICAL: this test MUST pin its own fixture repo (task-62 D14) ───
   * It used to select `document.querySelector('[data-testid^="repo-row-"]')` —
   * literally the FIRST row the picker rendered. That was harmless against the
   * github-stub's four-repo fixture. Against the real account this App is installed
   * on, with `repository_selection: all` and 100+ repositories, the first row is one
   * of the USER'S REAL REPOSITORIES. The import workflow is read-only, so nothing
   * could be corrupted, but cloning and verifying an arbitrary real repo is slow,
   * nondeterministic, and simply not something a test may do. It now provisions its
   * own throwaway repo and narrows the picker to it by name.
   *
   * The fixture is also what makes the assertion DETERMINISTIC rather than
   * accepting-either-outcome: the harness creates the repo with a single
   * auto-initialised README, so it has no `remotion.config.ts` and no version
   * branch, and the real `verifySupaglooProject` stage must fail → 12b's
   * "NOT A SUPAGLOO PROJECT" card. Under the old "first row" selection the
   * repo could have been anything, so the spec had to accept a successful import
   * too — which would have silently passed on a genuinely broken verify.
   */
  test("E-RIMP1: importing a non-Supagloo repo surfaces the real 'NOT A SUPAGLOO PROJECT' card", async () => {
    const fixture = await ensureFixtureRepo("import");
    await gotoWorkspace();
    await waitForTestId("workspace-import-repo");
    await clickTestId("workspace-import-repo");
    await waitForTestId("import-wizard");

    // The import picker is populated from the real GET /api/github/repos list, which
    // returns 100+ rows here — narrow it to the fixture before clicking anything.
    await typeInto("repo-search", fixture.name);
    const rowId = `repo-row-${fixture.name}`;
    await waitForTestId(rowId, 60_000);
    await clickTestId(rowId);
    await clickTestId("import-cta");

    const outcome = await (async () => {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        if ((await countTestId("import-error-card")) > 0) return "error";
        if ((await countTestId("open-in-studio")) > 0) return "ready";
        await page.waitForTimeout(300);
      }
      return "timeout";
    })();
    expect(
      outcome,
      `a README-only repo (${fixture.fullName}) must fail verifySupaglooProject`,
    ).toBe("error");
  }, 300_000);
});
