import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { type StagehandPage } from "./helpers";
import { completeGithubConnectViaCallback } from "./connect-helpers";
import {
  createProjectViaExistingEmptyRepo,
  resolveInstallationId,
} from "./github-e2e";

/**
 * Task #58 — the REAL-STACK regression guard for the widened `TranslationSchema`
 * (design-delta §2.11 / §9-Q10). A project whose committed manifest carries a
 * non-KJV/BSB licensed translation (e.g. "NIV") used to be UNREADABLE by the studio:
 * `fetchManifest` re-validated the just-committed manifest against nextjs's OWN stale
 * `z.enum(["KJV","BSB"])` and rejected it → `{ ok:false, reason:"manifest_invalid" }`
 * → the studio rendered the `studio-load-error` body, permanently blocking hydration.
 * The fix widens `TranslationSchema` to `z.string().min(1)` so the read parses.
 *
 * Headline property:
 *  - E-TW1: seed a project whose committed manifest has a scene with
 *    `translation:"NIV"`, then open `/studio/:slug`. The studio HYDRATES normally
 *    (`studio-frame` present, `studio-load-error` ABSENT) and the scene inspector's
 *    `data-scene-translation` reads back `"NIV"` — proving the non-KJV/BSB value
 *    specifically survived the read/hydrate. Without the fix this is inverted:
 *    `studio-load-error` shows and `studio-frame` never mounts.
 *
 * ── Why a crafted commit, not a picker / a re-plan ──────────────────────────────
 * There is NO UI control to pick a translation (no wireframe depicts one), and
 * §9-Q10's full YouVersion-picker scope is not yet wired — generation still defaults
 * to KJV/BSB — so a re-plan cannot deterministically (or currently at all) produce a
 * non-KJV/BSB translation. So the spec SEEDS the non-KJV/BSB manifest deterministically
 * via a real `POST /v1/projects/:id/commit` of a CRAFTED manifest (through the same
 * httpOnly-session BFF proxy every studio spec uses; the API accepts the free-string
 * translation against its already-broadened db-lib schema, and the DBOS git-ops commit
 * worker writes `supagloo.project.json` to the branch), then proves the READ.
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
const SEED_QS = `?seed=authed-returning&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

/** The licensed non-KJV/BSB translation we seed (any real YouVersion abbreviation). */
const SEED_TRANSLATION = "NIV";

let stagehand: Stagehand;
let page: StagehandPage;

function countTestId(id: string) {
  return page.locator(`[data-testid="${id}"]`).count();
}
// `clickTestId` / `waitForTestId` used to live here for this file's private copy of
// the project-creation flow; that copy is now the shared
// `createProjectViaExistingEmptyRepo` (task-62 D14), which carries its own.
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

/** Resolve the project's cuid id from its studio slug via the BFF list route
 *  (mirrors `resolveProjectBySlug`), running in-page so the httpOnly session cookie
 *  is sent. */
async function resolveProjectId(slug: string): Promise<string> {
  const id = await page.evaluate(async (s) => {
    const res = await fetch("/api/projects", { cache: "no-store" });
    const body = (await res.json()) as { projects?: Array<{ id: string; slug: string }> };
    return body.projects?.find((p) => p.slug === s)?.id ?? "";
  }, slug);
  if (!id) throw new Error(`could not resolve project id for slug ${slug}`);
  return id;
}

/** SEED the manifest by a REAL commit of a crafted manifest whose one scene carries a
 *  non-KJV/BSB translation. Runs in-page through the BFF commit proxy (real session
 *  cookie) → real API (broadened db-lib validation) → DBOS git-ops commit worker.
 *  Polls the commit ProjectJob to `succeeded`. */
async function seedNonKjvBsbManifest(id: string, translation: string): Promise<void> {
  const jobId = await page.evaluate(
    async ({ pid, tr }) => {
      const manifest = {
        manifestVersion: 1 as const,
        composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
        scenes: [
          {
            id: "s1",
            name: "wilderness · dawn",
            scriptText: "I am the voice of one calling in the wilderness",
            reference: "JOHN 1:23",
            translation: tr,
            visualPrompt: "sweeping empty wilderness at first light",
            durationSeconds: 5,
            captions: true,
            visualAssetKey: null,
          },
        ],
        narratorVoice: { description: "warm, weathered, resonant baritone" },
      };
      const res = await fetch(`/api/projects/${pid}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest, message: `Seed ${tr} manifest` }),
      });
      const body = (await res.json()) as { jobId?: string };
      return body.jobId ?? "";
    },
    { pid: id, tr: translation },
  );
  if (!jobId) throw new Error("commit did not return a jobId (is the API/commit worker up?)");

  // Poll the commit ProjectJob to a terminal state.
  const deadline = Date.now() + 180_000;
  let status = "";
  while (Date.now() < deadline) {
    status = await page.evaluate(
      async ({ pid, jid }) => {
        const res = await fetch(`/api/projects/${pid}/jobs/${jid}`, { cache: "no-store" });
        const body = (await res.json()) as { job?: { status?: string } };
        return body.job?.status ?? "";
      },
      { pid: id, jid: jobId },
    );
    if (status === "succeeded" || status === "failed" || status === "canceled") break;
    await page.waitForTimeout(500);
  }
  if (status !== "succeeded") {
    throw new Error(`commit job did not succeed (status=${status || "unknown"})`);
  }
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

describe("A committed non-KJV/BSB translation hydrates the studio (not a load error)", () => {
  test("E-TW1: seed a manifest with a non-KJV/BSB translation → /studio hydrates + reads it back", async () => {
    // ── seed: create a real project, then commit a crafted non-KJV/BSB manifest ──
    const slug = await createProjectAndOpenStudio("widen");
    expect(slug.length).toBeGreaterThan(0);
    const id = await resolveProjectId(slug);
    await seedNonKjvBsbManifest(id, SEED_TRANSLATION);

    // ── the READ under test: open the studio in a FRESH page (manifest re-read from
    //    git → fetchManifest → ManifestResponseSchema.safeParse — the fixed boundary) ─
    const fresh = await stagehand.context.newPage();
    try {
      await fresh.goto(`${BASE_URL}/studio/${slug}${SEED_QS}`, { waitUntil: "load" });

      // wait past the loading state to a terminal render (frame OR the load-error body)
      const deadline = Date.now() + 60_000;
      let framed = 0;
      let errored = 0;
      while (Date.now() < deadline) {
        framed = await fresh.locator('[data-testid="studio-frame"]').count();
        errored = await fresh.locator('[data-testid="studio-load-error"]').count();
        if (framed > 0 || errored > 0) break;
        await fresh.waitForTimeout(300);
      }

      // headline: the project HYDRATED (frame present) and did NOT hit the load-error
      // state — the exact inversion the stale enum used to cause.
      expect(errored).toBe(0);
      expect(framed).toBeGreaterThan(0);

      // and the non-KJV/BSB translation specifically survived hydration: select s1 and
      // read the inspector's data-scene-translation seam.
      await fresh
        .locator('[data-testid="scene-tree-row"][data-scene-id="s1"]')
        .click();
      const persistedTranslation = await fresh.evaluate(() => {
        const el = document.querySelector<HTMLElement>('[data-testid="scene-inspector"]');
        return el?.getAttribute("data-scene-translation") ?? "";
      });
      expect(persistedTranslation).toBe(SEED_TRANSLATION);
    } finally {
      await fresh.close();
    }
  }, 600_000);
});
