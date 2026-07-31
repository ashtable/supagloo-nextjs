import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { type StagehandPage } from "./helpers";
import {
  completeGithubConnectViaCallback,
  connectOpenRouterViaProfile,
} from "./connect-helpers";
import {
  createProjectViaExistingEmptyRepo,
  resolveInstallationId,
} from "./github-e2e";

/**
 * Task #27 — the REAL-STACK studio: hydration from the git manifest + a real commit,
 * exercised end to end (browser → BFF routes → supagloo-nodejs-api → Postgres +
 * real github.com → the DBOS git-ops commit worker) via the `?seed=` seam
 * (design-delta §5.3 rows 3 & 6, §2.11). This is the real counterpart of the mock
 * studio specs (`studio-project.e2e.ts` etc.), which stay green untouched (a catalog
 * id in a demo build resolves to the bundled DEMO_STORYBOARD synchronously — the
 * unchanged server-rendered mock path).
 *
 * Where the mock specs render `DEMO_STORYBOARD`, this spec proves the studio reducer
 * hydrates from the Zod-parsed `ProjectManifest` READ FROM THE REPO
 * (`GET /v1/projects/:id` + manifest), that Commit runs the real
 * `POST /v1/projects/:id/commit` + ProjectJob poll (not the mocked setTimeout), and
 * that a committed edit survives a fresh re-open (the manifest is re-read from git).
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
 * Its projects are acquired through the shared `createProjectViaExistingEmptyRepo`
 * helper: a private throwaway repo the harness PAT-creates per run, picked via the
 * wizard's already-shipping "use existing empty repo" tab. Fixture repos are never
 * auto-removed — reclaim them with the root repo's interactive
 * `npm run cleanup:github-e2e`, which archives rather than deletes. This spec now takes
 * TWO per run: E-SH1 needs a project that is still empty, E-SH2 needs one with committed
 * scenes, and one project cannot be both.
 *
 * EXECUTION STATUS (updated 2026-07-25, superseding task-62 D21's "deferred"): this
 * lane RUNS and is GREEN — `npm run test:e2e:real`, 21/21, reproduced independently
 * three times. The unit-level proofs named below still stand alongside it.
 *
 * CORRECTED 2026-07-30 — read the paragraph above with one qualification. Of those 21,
 * E-SH2 had never actually executed: it opened with a `return` guarded on an env var that
 * is impossible to satisfy (see its own comment), and vitest counts a silent early return
 * as a pass. So the sentence in the second paragraph above — "that a committed edit
 * survives a fresh re-open (the manifest is re-read from git)" — was an unproven claim
 * every one of those three runs, and this is the first commit at which it is true.
 *
 * CORRECTED AGAIN, SAME DAY (2026-07-30) — E-SH2's first real execution FAILED, and the
 * failure was the SPEC's, not the app's. It typed into `script-input`, committed,
 * re-opened, and read `script-input` again, assuming both reads addressed the same
 * scene. They do not: a just-generated storyboard leaves `scenes[0]` selected
 * (`STORYBOARD_GENERATED`), while a fresh open selects `scenes[1]`
 * (`initialStudioState` — the 5a wireframe's SCENE 02). The re-open therefore returned
 * scene 2's untouched generated line, which reads exactly like a silently-lost commit.
 * It was not: the edit is in the repo — fixture
 * `supagloo-e2e-delete-me-hydrate-edit-ms8kh9fca9d2d735`, branch `v0.0.1`, commit
 * `71cb0f5`, whose entire `supagloo.project.json` diff is `scenes[0].scriptText`.
 *
 * E-SH2 now captures the scene id it edits and selects that scene after the re-open;
 * the assertion itself is unchanged and is now ATTRIBUTABLE. Held without a stack by
 * `tests/unit/studio-edit-round-trip.test.ts` (the same round trip, pure) and
 * `tests/unit/studio-scene-identity.test.tsx` (the `data-scene-id` seam that lets a
 * `script-input` read say whose script it read). */

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
/** Type into the React-controlled SCRIPT textarea via the native setter + `input`
 *  event (the CDP understudy has no Playwright `.fill`) — the exact seam
 *  `studio.e2e.ts`/`studio-project.e2e.ts` use. */
async function typeIntoScript(value: string): Promise<void> {
  await page.evaluate((v) => {
    const ta = document.querySelector<HTMLTextAreaElement>('[data-testid="script-input"]');
    if (!ta) return;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    setter.call(ta, v);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
async function dataAttr(id: string, attr: string): Promise<string | null> {
  return page.evaluate(
    ({ sel, a }) =>
      document.querySelector<HTMLElement>(`[data-testid="${sel}"]`)?.getAttribute(a) ?? null,
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
async function waitForDataAttr(id: string, attr: string, expected: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last: string | null = null;
  while (Date.now() < deadline) {
    last = await dataAttr(id, attr);
    if (last === expected) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`[data-testid="${id}"] ${attr}="${last}" never became "${expected}"`);
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
  // …and OpenRouter, WITHOUT WHICH E-SH2 CANNOT RUN: it needs a project with committed
  // scenes to edit, and the only way this spec gets one is a real `storyboard` generation
  // from the empty state. The `?seed=` seam mints a user with no provider connections at
  // all, so that generation would fail in the worker with `OpenRouterNotConnectedError`,
  // visible in the browser only as a `script-input` that never appears — a 240 s timeout
  // with no attribution. The helper connects through the shipping profile card and shims
  // ONLY OpenRouter's human-only consent hop; the key it stores is the real
  // OPENROUTER_E2E_TEST_API_KEY. (No Gloo: nothing here generates an image.)
  await connectOpenRouterViaProfile(stagehand.context, page);
}, 300_000);

afterAll(async () => {
  await stagehand?.close();
});

describe("Studio hydrates from the REAL manifest (not DEMO_STORYBOARD)", () => {
  test("E-SH1: opening a real scaffolded project reads its manifest from git (empty → the empty state, real identity)", async () => {
    const { projectId: slug, repoFullName } = await createProjectAndOpenStudio("hydrate");
    expect(slug.length).toBeGreaterThan(0);

    // The editor mounted from the REAL project (the mock catalog never had this slug).
    await waitForTestId("studio-frame");
    // Identity comes from GET /v1/projects/:id, not the hardcoded mock. Asserted against
    // the repo the harness ACTUALLY created — owner and full name, per-run unique, so no
    // mock catalog entry can satisfy it.
    expect(await testidText("studio-repo-path")).toContain(repoFullName);
    // A freshly-scaffolded manifest is EMPTY → the empty state (proves we hydrated the
    // real empty manifest, NOT the 4-scene DEMO_STORYBOARD).
    expect(await countTestId("studio-empty")).toBeGreaterThan(0);
    expect(await countTestId("script-input")).toBe(0);
  }, 200_000);
});

describe("Edit a scene → real Commit → re-open persists (manifest re-read from git)", () => {
  // E-SH2 HAD NEVER EXECUTED ONCE. It opened on
  // `const slug = process.env.SUPAGLOO_E2E_STUDIO_SLUG; if (!slug) return;` — a silent
  // skip, reported by vitest as a pass — justified by a comment claiming "the release
  // harness seeds/imports a populated-manifest project and exposes its slug via a known
  // fixture". No such harness has ever existed, and the env var could not have worked even
  // if one did: every api project read is owner-scoped (`where: { id, ownerId: userId }`)
  // and this spec's user is minted fresh by `?seed=authed-returning&nonce=<RUN_ID>` with a
  // RUN_ID generated at module load, so a project seeded by any earlier run belongs to a
  // different owner by construction. Measured: pointing it at a real 5-scene fixture 404s,
  // surfacing as "script-input never appeared within 60000ms".
  //
  // That mattered more than a normally-skipped test would, because this is the ONLY
  // coverage anywhere of the edit → commit → re-open round trip — the headline flow of
  // task #27. So it is wired to the same path the sibling specs demonstrably run on
  // (`studio-model-cost.e2e.ts` / `studio-ai-generation.e2e.ts` `openStudioWithScenes()`,
  // `studio-replan-scripture.e2e.ts` E-RS1): create a real project, generate a real
  // storyboard from the empty state, commit it, and start from there.
  //
  // COST, stated rather than absorbed: this adds ONE fixture repo and ONE real
  // `storyboard` generation per run of this spec. It is not reusing E-SH1's project on
  // purpose — that would couple two tests through a mutation E-SH2's body cannot see, make
  // `-t E-SH2` unrunnable, and turn any E-SH1 flake into an unattributable E-SH2 failure.
  test("E-SH2: an edited scene script commits and survives a fresh re-open", async () => {
    // A committed storyboard is the PRECONDITION, not the subject: this test is about the
    // edit round trip, so the project has to reach a clean tree with >=1 scene first. A
    // freshly-scaffolded manifest is empty (that is exactly what E-SH1 asserts).
    const { projectId: slug } = await createProjectAndOpenStudio("hydrate-edit");
    expect(slug.length).toBeGreaterThan(0);
    await waitForTestId("studio-frame");
    await waitForTestId("generate-storyboard");
    await clickTestId("generate-storyboard");
    await waitForTestId("script-input", 240_000);
    // Commit the generated plan BEFORE editing. A generation writes into the WORKING
    // manifest, so a just-generated storyboard legitimately leaves the project dirty —
    // without this the `data-dirty === "false"` precondition below is simply false, and
    // the post-edit `data-dirty === "true"` assertion would pass vacuously on the
    // storyboard's dirt rather than on the edit's.
    await clickTestId("commit-button");
    await waitForDataAttr("version-branch-chip", "data-dirty", "false", 180_000);
    expect(await countTestId("commit-error")).toBe(0);

    // Re-confirm the editor is mounted after the commit's re-render before typing into it.
    // Not vestigial: `typeIntoScript` SILENTLY RETURNS when the textarea is absent, so a
    // transient unmount here would surface as the `data-dirty === "true"` wait below
    // timing out, blaming the dirty-tracking for a race in the setup.
    await waitForTestId("script-input", 60_000);
    expect(await dataAttr("version-branch-chip", "data-dirty")).toBe("false");

    // WHICH SCENE ARE WE ABOUT TO EDIT? Captured, never assumed — this is the whole
    // correction of 2026-07-30. `script-input` belongs to whichever scene the inspector
    // is rendering, and the studio has two deliberate entry points that DISAGREE about
    // which that is: a just-generated storyboard leaves `scenes[0]` selected
    // (`STORYBOARD_GENERATED`), while a fresh open selects `scenes[1]` (`initialStudioState`,
    // matching the 5a wireframe's SCENE 02). This test edits after a generation and then
    // re-opens, so it crosses exactly that seam.
    const editedSceneId = await dataAttr("scene-inspector", "data-scene-id");
    // Fail LOUDLY on an unattributable read rather than carrying `null` into a selector
    // below, where it would degrade into a "scene never appeared" timeout with no hint
    // that the id was the problem.
    if (!editedSceneId) {
      throw new Error(
        "scene-inspector reported no data-scene-id — the panel that owns script-input " +
          "cannot say which scene it is showing, so this assertion cannot be attributed.",
      );
    }

    const edited = `Persisted edit ${RUN_ID}`;
    await typeIntoScript(edited);
    await waitForDataAttr("version-branch-chip", "data-dirty", "true", 10_000);

    // Real Commit → POST /commit + ProjectJob poll → settles back to clean.
    await clickTestId("commit-button");
    await waitForDataAttr("version-branch-chip", "data-dirty", "false", 120_000);
    expect(await countTestId("commit-error")).toBe(0);

    // Re-open in a FRESH page (same context/cookie) — the manifest is re-read from git.
    const fresh = await stagehand.context.newPage();
    try {
      await fresh.goto(`${BASE_URL}/studio/${slug}?seed=authed-returning&nonce=${RUN_ID}`, {
        waitUntil: "load",
      });
      // Wait for the editor to mount, then SELECT THE SCENE THAT WAS EDITED. Without this
      // the read below lands on whatever scene `initialStudioState` opened on — a
      // different one — and the original generated script it finds there looks exactly
      // like a lost commit. That is what this test reported on its first-ever execution,
      // and the edit was in the repo the whole time.
      const rowSelector = `[data-testid="scene-tree-row"][data-scene-id="${editedSceneId}"]`;
      const mountDeadline = Date.now() + 60_000;
      let rows = 0;
      while (Date.now() < mountDeadline) {
        rows = await fresh.locator(rowSelector).count();
        if (rows > 0) break;
        await fresh.waitForTimeout(300);
      }
      // A missing row is its own distinct failure — the re-read manifest does not contain
      // the scene we edited — and it must not be reported as a click that went nowhere.
      if (rows === 0) {
        throw new Error(
          `the re-opened studio has no scene-tree row for the edited scene ` +
            `${editedSceneId} within 60000ms (scenes re-read from git do not include it)`,
        );
      }
      await fresh.locator(rowSelector).click();

      // Poll the inspector's OWN id alongside the value: the click is only a request to
      // select, and a read taken before it lands is a read of the previous scene. Waiting
      // for the element (rather than for the selection to take effect) is the silent no-op
      // that fails one level downstream — the same trap the scripture cascade hit.
      const deadline = Date.now() + 60_000;
      let shown: { sceneId: string | null; value: string } = { sceneId: null, value: "" };
      while (Date.now() < deadline) {
        shown = await fresh.evaluate(() => {
          const panel = document.querySelector<HTMLElement>(
            '[data-testid="scene-inspector"]',
          );
          const ta = document.querySelector<HTMLTextAreaElement>(
            '[data-testid="script-input"]',
          );
          return {
            sceneId: panel?.getAttribute("data-scene-id") ?? null,
            value: ta?.value ?? "",
          };
        });
        if (shown.sceneId === editedSceneId && shown.value.includes(edited)) break;
        await fresh.waitForTimeout(300);
      }
      // Assert the SUBJECT before the content, so a failure says which of the two went
      // wrong instead of leaving the next reader to guess between them.
      expect(shown.sceneId).toBe(editedSceneId);
      expect(shown.value).toContain(edited);
    } finally {
      await fresh.close();
    }
    // 900 s, up from the 240 s this carried while it was skipping — that budget only ever
    // had to cover a goto against an already-populated fixture. It now matches
    // `studio-replan-scripture.e2e.ts` E-RS1, the closest analogue by shape (create +
    // real generation + commit + a second commit + fresh re-open).
  }, 900_000);
});
