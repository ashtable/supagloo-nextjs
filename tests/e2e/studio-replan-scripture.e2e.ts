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
 * Task #57 (item 1) — the REAL-STACK regression guard for the scripture-reattachment
 * bug. A storyboard RE-PLAN (`storyboard` kind) whose new scene ids overlap the
 * committed manifest's ids used to make `serializeManifest` reattach the id-matched
 * OLD scene's scripture (`reference`/`translation`) onto brand-new generated content.
 * The fix carries the LLM's OWN per-scene scripture through the UI `Scene`, so a
 * re-plan persists the freshly-generated scripture.
 *
 * Headline property (content-agnostic, so it holds against a real, non-deterministic
 * LLM):
 *  - E-RS1: capture scene s1's LIVE per-scene reference/translation right after the
 *    re-plan lands (the fresh plan-2 values, read off the `data-scene-reference` /
 *    `data-scene-translation` inspector seam), Commit, then re-open the project in a
 *    fresh page. The PERSISTED (re-hydrated-from-git) s1 reference/translation must
 *    EQUAL the captured plan-2 values. A reattachment bug would instead persist
 *    plan-1's id-matched s1 scripture ≠ the captured value.
 *
 * ── EXECUTION NOTE (in-flight-dblib-e2e-constraint; same posture as the task-35
 * studio e2e) ── Running this needs the full stack: `next dev`, a locally-built API
 * (with the AI + commit routes) + real OpenRouter creds, a DBOS **ai-generation**
 * worker (so two `storyboard` generations reach `succeeded`) and a DBOS **git-ops
 * commit** worker (so both commits land + the manifest is re-read on re-open). Until
 * that stack is stood up EXECUTION IS DEFERRED to the release step; the behavior is
 * proven meanwhile by the unit suite (`lib/studio/manifest-adapter.test.ts` U-A14/15/16,
 * `lib/studio/storyboard.test.ts` U-AI-S7).
 *
 * DELIBERATELY Gloo-free + deterministic (testid + `evaluate` + `data-*`, NOT
 * act/extract/observe) — the same convention as every prior studio + real-stack spec.
 * Per-run nonce.
 */

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
async function gotoWorkspace(url = SEED_URL) {
  await page.goto(url, { waitUntil: "load" });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if ((await countTestId("workspace-home")) > 0) return;
    await page.waitForTimeout(250);
  }
  throw new Error("workspace-home never rendered (is the API up + seed enabled?)");
}

/** Select scene `sceneId` via the scene-tree, then read its persisted scripture off
 *  the inspector seam. Returns `{reference, translation}` (both may be ""). */
async function scriptureOfScene(
  p: StagehandPage,
  sceneId: string,
): Promise<{ reference: string; translation: string }> {
  await p.locator(`[data-testid="scene-tree-row"][data-scene-id="${sceneId}"]`).click();
  return p.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="scene-inspector"]');
    return {
      reference: el?.getAttribute("data-scene-reference") ?? "",
      translation: el?.getAttribute("data-scene-translation") ?? "",
    };
  });
}

/**
 * Create a fresh real project and open its studio, via the ONE shared helper in
 * `tests/e2e/github-e2e.ts` (task-62 D14). This used to be a private copy that drove
 * the wizard's create-NEW-repo tab and faked GitHub's user-authorization redirect with
 * a literal `code`; against real GitHub that is `bad_verification_code`, and a
 * containerised api has no seam to intercept the exchange. The helper instead
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

/** Commit the current edit and wait for the version chip to go clean. */
async function commitAndWaitClean() {
  await clickTestId("commit-button");
  await waitForDataAttr("version-branch-chip", "data-dirty", "true", 10_000).catch(() => {});
  await waitForDataAttr("version-branch-chip", "data-dirty", "false", 180_000);
  expect(await countTestId("commit-error")).toBe(0);
}

/** Fire a full storyboard re-plan (top-bar Regenerate → "Re-plan all scenes") and wait
 *  for the new scenes. */
async function replanAndWaitForScenes() {
  await clickTestId("regenerate");
  await waitForTestId("reroll-menu");
  await clickTestId("regen-storyboard");
  // scenes are replaced when the new plan lands (script-input re-renders on scene 1)
  await waitForTestId("script-input", 240_000);
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
  // …and OpenRouter, WITHOUT WHICH THIS SPEC CANNOT RUN AT ALL: E-RS1 is *about* two
  // real `storyboard` generations (plan-1, then the re-plan). The `?seed=` seam mints
  // a user with no provider connections, so both would fail in the worker with
  // `OpenRouterNotConnectedError`, surfacing only as a `script-input` that never
  // arrives. The helper connects through the shipping profile card and shims ONLY
  // OpenRouter's human-only consent hop; the stored key is the real
  // OPENROUTER_E2E_TEST_API_KEY.
  await connectOpenRouterViaProfile(stagehand.context, page);
}, 300_000);

afterAll(async () => {
  await stagehand?.close();
});

describe("Re-plan persists the fresh per-scene scripture, not a stale reattached value", () => {
  test("E-RS1: re-plan (overlapping ids) → commit → re-open keeps s1's OWN reference/translation", async () => {
    // ── plan-1: create + generate + commit, so the manifest has committed scenes
    //    (ids s1…sN) for the re-plan to overlap ─────────────────────────────────
    const slug = await createProjectAndOpenStudio("replan");
    expect(slug.length).toBeGreaterThan(0);
    await waitForTestId("studio-frame");
    await waitForTestId("generate-storyboard");
    await clickTestId("generate-storyboard");
    await waitForTestId("script-input", 240_000);
    await commitAndWaitClean();

    // ── plan-2: RE-PLAN (its scenes get ids s1…sM, overlapping plan-1's) ─────────
    await replanAndWaitForScenes();

    // capture scene s1's LIVE (plan-2) scripture — the carried-through LLM values.
    const planned = await scriptureOfScene(page, "s1");
    expect(planned.reference.length).toBeGreaterThan(0);

    // ── commit plan-2, then re-open in a FRESH page (manifest re-read from git) ──
    await commitAndWaitClean();

    const fresh = await stagehand.context.newPage();
    try {
      await fresh.goto(`${BASE_URL}/studio/${slug}?seed=authed-returning&nonce=${RUN_ID}`, {
        waitUntil: "load",
      });
      // wait for the scene tree + inspector to hydrate from the committed manifest
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        if (
          (await fresh.locator('[data-testid="scene-tree-row"][data-scene-id="s1"]').count()) > 0
        )
          break;
        await fresh.waitForTimeout(300);
      }
      const persisted = await scriptureOfScene(fresh, "s1");

      // the PERSISTED s1 scripture equals the plan-2 value we captured — NOT plan-1's
      // id-matched scene (which a reattachment bug would have written back).
      expect(persisted.reference).toBe(planned.reference);
      expect(persisted.translation).toBe(planned.translation);
    } finally {
      await fresh.close();
    }
  }, 900_000);
});
