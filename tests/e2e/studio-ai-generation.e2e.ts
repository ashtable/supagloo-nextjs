import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { type StagehandPage } from "./helpers";
import {
  completeGithubConnectViaCallback,
  connectGlooViaProfile,
  connectOpenRouterViaProfile,
} from "./connect-helpers";
import {
  createProjectViaExistingEmptyRepo,
  resolveInstallationId,
} from "./github-e2e";

/**
 * Task #35 — the REAL-STACK studio AI wiring, exercised end to end (browser → BFF
 * routes → the containerised supagloo-nodejs-api → Postgres + real github.com → the DBOS
 * ai-generation worker calling REAL OpenRouter → MinIO) via the `?seed=` seam
 * (design-delta §5.3, §6b, §10). The commit's git path is a real push to github.com;
 * only the AI egress is live (§10).
 *
 * Two headline properties:
 *  - E-AI1: "↻ Reroll visual" on a scene runs a real `image` generation and the
 *    preview updates from a MinIO asset PRODUCED BY THE REAL PROVIDER (the scene's
 *    `data-visual-asset-key` becomes a real `projects/…/assets/…` key and a
 *    `scene-visual` <Img> renders with a non-empty src).
 *  - E-AI2: the generated ref survives Commit + a fresh studio re-open (the manifest
 *    is re-read from git, so the persisted `visualAssetKey` is still there).
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
 * three times. The unit-level proofs named below still stand alongside it. */

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
/** Task #57: the inverse — poll until an element is GONE (e.g. the generating scrim
 *  clears once the generation settles). */
async function waitForTestIdGone(id: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(id)) === 0) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`[data-testid="${id}"] never disappeared within ${timeoutMs}ms`);
}
async function waitForDataAttr(id: string, attr: string, expected: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last: string | null = null;
  while (Date.now() < deadline) {
    last = await dataAttr(id, attr);
    if (last === expected) return;
    await page.waitForTimeout(300);
  }
  throw new Error(`[data-testid="${id}"] ${attr}="${last}" never became "${expected}"`);
}
/** Poll until the scene inspector exposes a non-empty visual asset key (a real
 *  `projects/…/assets/…` MinIO key produced by the live provider). Returns the key. */
async function waitForVisualAssetKey(timeoutMs = 240_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last: string | null = null;
  while (Date.now() < deadline) {
    last = await dataAttr("scene-inspector", "data-visual-asset-key");
    if (last && last.length > 0) return last;
    // surface a generation failure loudly instead of silently timing out
    if ((await countTestId("reroll-error")) > 0) {
      throw new Error("reroll-visual reported a generation failure (reroll-error shown)");
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`scene-inspector data-visual-asset-key never populated (last: ${last})`);
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
async function createProjectAndOpenStudio(slug: string): Promise<string> {
  const { projectId } = await createProjectViaExistingEmptyRepo(page, {
    slug,
    seedUrl: SEED_URL,
  });
  return projectId;
}

/** The id of the scene the studio currently has selected, read off the shipping
 *  scene-tree's `data-selected` row. The inspector renders whichever scene this is,
 *  so every per-scene assertion is really an assertion about THIS id. */
async function selectedSceneId(): Promise<string> {
  return page.evaluate(
    () =>
      document
        .querySelector<HTMLElement>('[data-testid="scene-tree-row"][data-selected="true"]')
        ?.getAttribute("data-scene-id") ?? "",
  );
}

/** Commit the working manifest and wait for the branch chip to settle clean.
 *  Mirrors the sibling `studio-replan-scripture.e2e.ts` helper of the same name. */
async function commitAndWaitClean() {
  await clickTestId("commit-button");
  await waitForDataAttr("version-branch-chip", "data-dirty", "false", 180_000);
  expect(await countTestId("commit-error")).toBe(0);
}

/** Open a studio that HAS scenes, COMMITTED — a project whose scenes are persisted in git
 *  and whose working tree is clean: a fresh project whose storyboard is generated via the
 *  real `storyboard` kind from the empty state. Returns the slug.
 *
 *  This used to have a second branch that short-circuited on `SUPAGLOO_E2E_STUDIO_SLUG`
 *  ("a provided populated-manifest fixture, fast"). That branch was DEAD and could never
 *  have been anything else, so it is gone rather than fixed: every api project read is
 *  owner-scoped (`where: { id, ownerId: userId }`) and this spec's user is minted fresh by
 *  `?seed=authed-returning&nonce=<RUN_ID>` with a RUN_ID generated at module load, so a
 *  fixture from any earlier run belongs to a different owner by construction. Measured:
 *  pointing it at a real 5-scene fixture 404s, surfacing as
 *  "script-input never appeared within 60000ms". The path below is the one that has
 *  actually been running. */
async function openStudioWithScenes(): Promise<string> {
  const slug = await createProjectAndOpenStudio("aigen");
  await waitForTestId("studio-frame");
  // A freshly-scaffolded project is empty → the first-time "Generate storyboard"
  // entry point runs a REAL `storyboard` generation; scenes appear when it lands.
  await waitForTestId("generate-storyboard");
  await clickTestId("generate-storyboard");
  await waitForTestId("script-input", 240_000);
  // …and COMMIT that plan before handing the studio back. A generation writes into
  // the WORKING manifest, so a just-generated storyboard legitimately leaves the
  // project dirty — exactly the property E-AI1 asserts two steps later for the visual
  // reroll ("the new ref dirtied the project"). Without this commit the caller's
  // `data-dirty === "false"` precondition is simply false, and, worse, the later
  // dirty assertion would pass vacuously on the storyboard's dirt rather than on the
  // reroll's. Committing here makes both branches start from the same committed,
  // clean project and keeps every downstream assertion about the reroll alone.
  // (`studio-replan-scripture.e2e.ts` commits after its first plan for the same reason.)
  await commitAndWaitClean();
  return slug;
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
  // …and OpenRouter, WITHOUT WHICH EVERY GENERATION IN THIS SPEC IS DEAD. The `?seed=`
  // seam mints a user with no provider connections at all, so both generations below
  // (the storyboard from the empty state, and the reroll) would fail in the worker
  // with `OpenRouterNotConnectedError` — visible in the browser only as a
  // `script-input` that never appears, i.e. a 240 s timeout with no attribution.
  // The helper connects through the shipping profile card and shims ONLY OpenRouter's
  // human-only consent hop; the key it stores is the real OPENROUTER_E2E_TEST_API_KEY.
  await connectOpenRouterViaProfile(stagehand.context, page);
  // …and Gloo, WITHOUT WHICH E-AI1 CANNOT PASS EITHER — for a reason this spec never
  // mentions. The studio's SCENE IMAGE default is Gloo, so "↻ Reroll visual" enqueues a
  // `kind: image` generation against Gloo, and the seeded user has no Gloo row: the
  // worker throws `GlooNotConnectedError` and the browser shows a bare `reroll-error`
  // naming no provider. This spec is about a real MinIO round-trip surviving a commit;
  // it died on a dependency it does not test. Verify-then-store, no human-only hop.
  await connectGlooViaProfile(page);
}, 300_000);

afterAll(async () => {
  await stagehand?.close();
});

describe("Per-scene video (genesis-1 item 4)", () => {
  // DELIBERATELY UNEXECUTED, and said so rather than quietly omitted.
  //
  // The claim is real and worth making: `generate-scene-video` runs a live text-to-video
  // generation and the scene's `data-visual-asset-kind` becomes "video" — which is the
  // only end-to-end proof that the key and the KIND are written together, and therefore
  // that the renderer will reach for <OffthreadVideo> rather than <Img>.
  //
  // It is not enabled because of what it costs: a real clip is minutes of wall clock and
  // real money PER RUN, on every sweep, forever. §10.9 sanctions exactly three cost
  // mitigations (cheapest/fastest model, minimal duration/resolution, a low-balance key)
  // and none of them make a video generation cheap enough to be routine. What the
  // deferral does NOT leave uncovered: the durable submit → poll → download path already
  // has its own dbos crash/replay e2e against real OpenRouter, and the
  // key-and-kind-in-one-action rule is pinned by U-SV1/U-SV1b.
  //
  // Enable it by hand (`it` instead of `it.todo`) when validating item 4 against a live
  // provider; expect a 15–25 minute run and a real charge.
  test.todo(
    "E-AI3: generate-scene-video runs a real video generation and sets data-visual-asset-kind=video",
  );
});

describe("Reroll visual → preview updates from a real MinIO asset, and survives commit + re-open", () => {
  test("E-AI1/E-AI2: reroll a scene visual (real OpenRouter → MinIO), then Commit + re-open persists the ref", async () => {
    const slug = await openStudioWithScenes();
    expect(slug.length).toBeGreaterThan(0);

    // A scene is selected and clean; no visual generated yet.
    await waitForTestId("scene-inspector");
    expect(await dataAttr("version-branch-chip", "data-dirty")).toBe("false");
    expect(await dataAttr("scene-inspector", "data-visual-asset-key")).toBe("");

    // WHICH scene the reroll is about to target. Captured, not assumed: the studio
    // deliberately selects DIFFERENT scenes in the two situations this test walks
    // through — `STORYBOARD_GENERATED` selects `scenes[0]` (reducer.ts), while a cold
    // `initialStudioState` selects `scenes[1]` ("2nd scene by index (matches 5a)").
    // So the scene rerolled below is NOT the scene the re-opened studio will select,
    // and E-AI2 has to re-select this one before reading the persisted key back.
    const targetSceneId = await selectedSceneId();
    expect(targetSceneId.length).toBeGreaterThan(0);

    // ── E-AI1: real reroll → preview updates from a MinIO asset ────────────────
    await clickTestId("reroll-visual");
    // pending state shows immediately
    await waitForDataAttr("reroll-visual", "data-state", "running", 10_000);
    // Task #57 (item 3): the composition/preview itself shows an in-flight
    // "generating" scrim for the DURATION of the request — not just the button text.
    await waitForTestId("scene-generating", 10_000);
    // the real image generation lands: a real MinIO key + a rendered <Img> preview
    const assetKey = await waitForVisualAssetKey(240_000);
    expect(assetKey).toMatch(/^projects\/.+\/assets\/.+/);
    // once the generation settles, the scrim is gone (the slot cleared on success)
    await waitForTestIdGone("scene-generating", 15_000);
    await waitForTestId("scene-visual", 30_000);
    const src = await dataAttr("scene-visual", "src");
    expect(src && src.length > 0).toBe(true);
    // the new ref dirtied the project (it must be committed to persist)
    await waitForDataAttr("version-branch-chip", "data-dirty", "true", 10_000);

    // ── E-AI2: Commit → clean → re-open persists ───────────────────────────────
    await clickTestId("commit-button");
    await waitForDataAttr("version-branch-chip", "data-dirty", "false", 120_000);
    expect(await countTestId("commit-error")).toBe(0);

    // Re-open in a FRESH page (same context/cookie) — the manifest is re-read from
    // git and the persisted visualAssetKey is presigned back into the preview.
    const fresh = await stagehand.context.newPage();
    try {
      await fresh.goto(`${BASE_URL}/studio/${slug}?seed=authed-returning&nonce=${RUN_ID}`, {
        waitUntil: "load",
      });
      // Wait for the re-read manifest to render, then SELECT THE SCENE WE REROLLED —
      // via the shipping scene-tree row, the same affordance a user clicks. A cold
      // open lands on `scenes[1]`, so reading the inspector as-is would ask an
      // untouched scene whether it kept a key it never had (a guaranteed "" that
      // looks like a persistence failure). Selecting first is what makes this
      // assertion about persistence rather than about default selection.
      const rowDeadline = Date.now() + 60_000;
      let selected = false;
      while (Date.now() < rowDeadline) {
        const clicked = await fresh.evaluate((id: string) => {
          const row = document.querySelector<HTMLElement>(
            `[data-testid="scene-tree-row"][data-scene-id="${id}"]`,
          );
          if (!row) return false;
          row.click();
          return true;
        }, targetSceneId);
        if (clicked) {
          selected = true;
          break;
        }
        await fresh.waitForTimeout(300);
      }
      expect(selected).toBe(true);

      const deadline = Date.now() + 60_000;
      let persisted: string | null = null;
      while (Date.now() < deadline) {
        persisted = await fresh.evaluate(
          () =>
            document
              .querySelector<HTMLElement>('[data-testid="scene-inspector"]')
              ?.getAttribute("data-visual-asset-key") ?? null,
        );
        if (persisted && persisted.length > 0) break;
        await fresh.waitForTimeout(300);
      }
      expect(persisted).toBe(assetKey);
    } finally {
      await fresh.close();
    }
  }, 600_000);
});
