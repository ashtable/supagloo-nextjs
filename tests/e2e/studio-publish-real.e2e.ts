import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { commitOneSceneViaBff, type StagehandPage } from "./helpers";
import { completeGithubConnectViaCallback } from "./connect-helpers";
import {
  createProjectViaExistingEmptyRepo,
  resolveInstallationId,
} from "./github-e2e";

/**
 * Task #28 — the REAL-STACK Publish wizard + version dropdown, exercised end to end
 * (browser → BFF routes → the containerised supagloo-nodejs-api → Postgres + real github.com →
 * the DBOS git-ops PUBLISH worker) via the `?seed=` seam (design-delta §5.3 row 7).
 * This is the real counterpart of the mock publish spec (`studio-publish.e2e.ts`),
 * which stays green untouched (the catalog id `psalm-121` in a demo build resolves to
 * the bundled DEMO_STORYBOARD synchronously — the unchanged server-rendered mock path
 * with the wireframe-literal TWO-step bump).
 *
 * Where the mock spec drives a mocked pending→settled PR dance + two-step version
 * math, THIS spec proves: Publish hits the real `POST /v1/projects/:id/publish
 * { message }`, the wizard renders the polled 7-stage `ProjectJob` log, the success
 * card reflects the REAL Model-A ONE-step bump ("v0.0.1 PUBLISHED … editing on
 * v0.0.2"), and the version dropdown is derived from `GET /v1/projects/:id/versions`
 * (real states, LIVE ON MAIN badge, restore).
 *
 * ── STACK (task 62 half A) ───────────────────────────────────────────────────
 * There is no github-stub and no local git-server any more: every GitHub call in this
 * spec reaches real `github.com` / `api.github.com`, and the `installationId` planted
 * by `completeGithubConnectViaCallback` is DISCOVERED at runtime from
 * `GET /app/installations` (the fabricated literal it used to plant was exactly plan
 * row 62 item (d) — a permanent 404 on every installation-token mint).
 *
 * The spec runs in the `test:e2e:real` lane (`vitest.e2e.real.config.ts`), whose
 * `tests/e2e/global-setup.render.ts` brings up the ROOT Compose stack — postgres,
 * minio, minio-init, migrate, the containerised api AND the `dbos` worker, which
 * nothing used to start — and gates each of them, including a crash-loop check on the
 * worker. It needs the root repo's gitignored `docker-compose.override.yml` so the
 * api+dbos containers carry in-flight code, plus the root `.env` GitHub App
 * credentials + `GITHUB_E2E_PAT_TOKEN` (loaded into this worker by
 * `tests/e2e/load-root-env.ts`).
 *
 * Its project is acquired through the shared `createProjectViaExistingEmptyRepo`
 * helper: a private throwaway repo the harness PAT-creates per run, picked via the
 * wizard's already-shipping "use existing empty repo" tab. Fixture repos are never
 * auto-removed — reclaim them with the root repo's interactive
 * `npm run cleanup:github-e2e`, which archives rather than deletes.
 *
 * EXECUTION STATUS (updated 2026-07-25, superseding task-62 D21's "deferred"): this
 * lane RUNS and is GREEN — `npm run test:e2e:real`, 21/21, reproduced independently
 * three times. The unit-level proofs named below still stand alongside it.
 *
 * ── 2026-07-27: E-PUBR1 REWRITTEN, and why ───────────────────────────────────
 * Until today this test created a project and clicked Publish immediately. That stopped
 * being a publishable state on 2026-07-27 with dbos `de745d2`
 * ("fix(scaffold): cut v0.0.1 from the merged base tip, not the local v0.0.0"): the
 * working branch is now created AT `pr.mergeSha`, i.e. byte-identical to `main`, so a
 * freshly-scaffolded project has ZERO commits to merge. Reproduced here on
 * 2026-07-28 — the run reached the real endpoint and the DBOS worker recorded
 *
 *     ProjectJob(publish).error =
 *       "open pull request failed: 422 — Validation Failed — No commits between main and v0.0.1"
 *
 * — so the old assertion (`publish-published-card` appears) was asking real GitHub for an
 * outcome it cannot produce, and no UI change could have made it pass.
 *
 * That state is exactly what task item 7 exists to refuse, so the test now proves BOTH
 * halves against real server data: Publish is DISABLED on the freshly-scaffolded project,
 * and ENABLED (and successful, with the Model-A one-step bump) once a real commit is
 * ahead of main. The commit is seeded through the app's OWN real BFF route with the real
 * session cookie — the same "seed through the real routes" idiom the api e2e suite uses
 * for provider connections — because a freshly-scaffolded manifest has `scenes: []` and
 * the studio renders `<StudioEmpty />`, so there is no `script-input` to type into. */

const BASE_URL = "http://localhost:3000";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SEED_URL = `${BASE_URL}/?seed=authed-returning&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

let stagehand: Stagehand;
let page: StagehandPage;

function countTestId(id: string) {
  return page.locator(`[data-testid="${id}"]`).count();
}
function clickTestId(id: string) {
  return page.locator(`[data-testid="${id}"]`).click();
}
async function testidText(id: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${sel}"]`);
    return (el?.textContent ?? "").trim();
  }, id);
}
async function dataAttrAll(id: string, attr: string): Promise<string[]> {
  return page.evaluate(
    ({ sel, a }) =>
      Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${sel}"]`)).map(
        (el) => el.getAttribute(a) ?? "",
      ),
    { sel: id, a: attr },
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
async function waitForTestidTextContains(id: string, needle: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await testidText(id);
    if (last.includes(needle)) return;
    await page.waitForTimeout(250);
  }
  throw new Error(
    `[data-testid="${id}"] text never contained ${JSON.stringify(needle)} within ${timeoutMs}ms (last: ${JSON.stringify(last)})`,
  );
}
/** The live `disabled` PROPERTY of a control (not the attribute), so a React-rendered
 *  `disabled={true}` is read the way the browser gates the click. */
async function isDisabled(id: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLButtonElement>(`[data-testid="${sel}"]`);
    return el ? el.disabled === true : false;
  }, id);
}
async function waitForDisabled(id: string, want: boolean, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await isDisabled(id)) === want) return;
    await page.waitForTimeout(200);
  }
  throw new Error(
    `[data-testid="${id}"] never became disabled=${want} within ${timeoutMs}ms`,
  );
}
async function attr(id: string, name: string): Promise<string | null> {
  return page.evaluate(
    ({ sel, a }) =>
      document.querySelector<HTMLElement>(`[data-testid="${sel}"]`)?.getAttribute(a) ??
      null,
    { sel: id, a: name },
  );
}

async function gotoWorkspace(url = SEED_URL) {
  await page.goto(url, { waitUntil: "load" });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if ((await countTestId("workspace-home")) > 0) return;
    await page.waitForTimeout(250);
  }
  throw new Error("workspace-home never rendered (is the API up + seed enabled?)");
}

/**
 * Create a fresh real project and open its studio, via the ONE shared helper in
 * `tests/e2e/github-e2e.ts` (task-62 D14). This used to be a private copy that drove
 * the wizard's create-NEW-repo tab and faked GitHub's user-authorization redirect with
 * a literal `code`; against real GitHub that is `bad_verification_code`, and at the
 * time a containerised api had no seam to intercept the exchange. (Plan row 66 has
 * since added one and restored browser coverage of that path as
 * `createProjectViaCreateNewRepo`; this spec still does not want the consent hop —
 * it is not what is under test here.) The helper instead
 * PAT-creates a private throwaway repo per run and drives the wizard's already-shipping
 * "use existing empty repo" tab (wireframe 13a), which POSTs straight to
 * `/api/projects` with no consent hop. `slug` names the repo's purpose; the harness
 * appends the per-run id (real GitHub 422s a duplicate repo name, and the scaffold's
 * v0.0.0 commit is byte-deterministic, so a REUSED repo would reject a second run).
 * Fixture repos are never auto-removed — reclaim them with the root repo's
 * `npm run cleanup:github-e2e`, which archives rather than deletes.
 */
/**
 * Returns the project id AND the repo's real `owner/name`. The full name has to come
 * back from the helper: the fixture repo is named by the SHARED harness (its own run
 * id and its own throwaway prefix), so this file's local `RUN_ID` — which only ever
 * salts the `?nonce=` seed URL — cannot be used to reconstruct it.
 */
async function createProjectAndOpenStudio(
  slug: string,
): Promise<{ projectId: string; repoFullName: string }> {
  const { projectId, repoFullName } = await createProjectViaExistingEmptyRepo(page, {
    slug,
    seedUrl: SEED_URL,
  });
  return { projectId, repoFullName };
}

beforeAll(async () => {
  stagehand = new Stagehand({ env: "LOCAL", verbose: 1 }); // Gloo-free
  await stagehand.init();
  page = stagehand.context.pages()[0];
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  await gotoWorkspace();
  // The REAL installation id, discovered at runtime from `GET /app/installations`.
  // The fabricated literal this used to plant is exactly what made every downstream
  // installation-token mint a permanent 404 against real GitHub (plan row 62 item d).
  await completeGithubConnectViaCallback(stagehand.context, {
    installationId: await resolveInstallationId(),
  });
}, 120_000);

afterAll(async () => {
  await stagehand?.close();
});

describe("Publish a REAL project → real endpoint + polled stages + Model-A one-step bump", () => {
  test("E-PUBR1: publish v0.0.1 → success card 'editing on v0.0.2'; dropdown shows published + new working", async () => {
    const { projectId: slug, repoFullName } = await createProjectAndOpenStudio("publish");
    expect(slug.length).toBeGreaterThan(0);

    // The editor mounted from the REAL project. A freshly-scaffolded manifest is empty,
    // but the TopBar (identity / chip / Publish) is always present.
    await waitForTestId("studio-frame");
    // Asserted against the repo the harness ACTUALLY created — owner and full name.
    expect(await testidText("studio-repo-path")).toContain(repoFullName);
    expect(await testidText("version-branch-chip")).toContain("v0.0.1");

    // ── TASK ITEM 7, first half — against REAL server data ────────────────────
    // Scaffold cuts v0.0.1 AT `pr.mergeSha`, so the working branch is byte-identical to
    // `main` and there is genuinely nothing to merge. Before this, clicking Publish here
    // reached the real endpoint and the worker recorded
    // "open pull request failed: 422 — Validation Failed — No commits between main and
    // v0.0.1". The button now refuses up front, and says what to do instead.
    //
    // Waited for rather than sampled: the gate is derived from `GET /versions`, and it
    // FAILS OPEN until that read lands (an undecidable state must never deaden Publish).
    await waitForDisabled("publish-button", true, 30_000);
    expect(await attr("publish-button", "title")).toBe(
      "Nothing new to publish — commit a change first.",
    );
    // …and the refusal is real, not cosmetic: no wizard opens.
    await clickTestId("publish-button").catch(() => undefined);
    await page.waitForTimeout(500);
    expect(await countTestId("publish-wizard")).toBe(0);

    // ── put ONE real commit ahead of main, through the app's own BFF ──────────
    await commitOneSceneViaBff(page, slug, "v0.0.1");
    await page.reload({ waitUntil: "load" });
    await waitForTestId("studio-frame", 60_000);

    // ── TASK ITEM 7, second half ──────────────────────────────────────────────
    await waitForDisabled("publish-button", false, 30_000);
    expect(await attr("publish-button", "title")).toBeNull();

    // Open the Publish wizard's review step, then confirm → the REAL endpoint.
    await clickTestId("publish-button");
    await waitForTestId("publish-wizard");
    await waitForTestId("publish-review");
    await clickTestId("publish-confirm");

    // Step 2 renders the polled 7-stage publish job log (real stage labels, not the
    // mock PR-dance copy). Assert at least one real stage label appears.
    await waitForTestId("publishing-log", 30_000);
    await waitForTestidTextContains("publishing-log", "GitHub", 30_000);

    // Step 3 — the real Model-A one-step bump: v0.0.1 published, now editing on v0.0.2.
    await waitForTestId("publish-published-card", 180_000);
    const card = await testidText("publish-published-card");
    expect(card).toContain("v0.0.1 PUBLISHED");
    expect(card).toContain("v0.0.2"); // now editing on the new working branch
    expect(await countTestId("publish-error")).toBe(0);

    // Close → the top bar reflects the new working branch.
    await clickTestId("publish-close");
    await waitForTestidTextContains("version-branch-chip", "v0.0.2", 15_000);

    // The version dropdown is derived from GET /versions: working v0.0.2, live v0.0.1
    // (LIVE ON MAIN), template v0.0.0.
    await clickTestId("version-menu-trigger");
    await waitForTestId("version-menu");
    await waitForTestId("version-row", 15_000);
    const byBranch = await page.evaluate(() =>
      Object.fromEntries(
        Array.from(document.querySelectorAll<HTMLElement>('[data-testid="version-row"]')).map(
          (el) => [el.getAttribute("data-branch") ?? "", el.getAttribute("data-state") ?? ""],
        ),
      ),
    );
    expect(byBranch["v0.0.2"]).toBe("working");
    expect(byBranch["v0.0.1"]).toBe("live");
    expect(await testidText("version-live-pill")).toContain("LIVE ON MAIN");

    const states = await dataAttrAll("version-row", "data-state");
    expect(states).toContain("template"); // the v0.0.0 base floor
  }, 300_000);
});
