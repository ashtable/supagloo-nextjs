import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { type StagehandPage } from "./helpers";
import {
  completeGithubConnectViaCallback,
  completeCreateRepoViaCallback,
} from "./connect-helpers";

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
 * ── EXECUTION NOTE (in-flight-dblib-e2e-constraint; same posture as the task-27/57
 * studio e2e) ── Running this needs the full stack: `next dev`, a locally-built API
 * (with the commit + jobs routes) + github-stub + git-server, and a running DBOS
 * git-ops COMMIT worker (so the commit reaches `succeeded` and the manifest is
 * re-read on re-open). It needs NO OpenRouter/Gloo (no LLM — the manifest is crafted),
 * so it is strictly LESS demanding than the replan spec. Until that stack is stood up
 * EXECUTION IS DEFERRED to the release step; the behavior is proven meanwhile by the
 * unit suite (`lib/api/contracts.test.ts` — the widened schema accepts an arbitrary
 * abbreviation; `lib/studio/manifest-adapter.test.ts` U-A18 — round-trip; and
 * `lib/studio/studio-data.test.ts` U-D4b — `fetchManifest` parses "NIV" instead of
 * returning `manifest_invalid`, the EXACT read-side failure this fixes).
 *
 * DELIBERATELY Gloo-free + deterministic (testid + `evaluate` + `data-*`, NOT
 * act/extract/observe — those need the Gloo LLM client the harness keeps degraded;
 * the same convention as every prior studio + real-stack spec). Per-run nonce.
 */

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
function clickTestId(id: string) {
  return page.locator(`[data-testid="${id}"]`).click();
}
async function waitForTestId(id: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(id)) > 0) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`[data-testid="${id}"] never appeared within ${timeoutMs}ms`);
}
async function waitForUrlIncludes(fragment: string, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = page.url();
    if (last.includes(fragment)) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`URL never included ${JSON.stringify(fragment)} (last: ${last})`);
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

/** Create a fresh real project via the create-new JIT hop, open it in the studio,
 *  and return its studio slug. */
async function createProjectAndOpenStudio(repoName: string): Promise<string> {
  await gotoWorkspace();
  await waitForTestId("workspace-new-project");
  await clickTestId("workspace-new-project");
  await waitForTestId("new-project-wizard");
  await page.evaluate((name) => {
    const el = document.querySelector<HTMLInputElement>('[data-testid="new-repo-name"]');
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(el, name);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, repoName);
  await clickTestId("new-project-cta");
  await completeCreateRepoViaCallback(page, stagehand.context);
  await waitForTestId("project-ready-card", 120_000);
  await clickTestId("open-in-studio");
  await waitForUrlIncludes("/studio/");
  return page.url().split("/studio/")[1]?.split(/[?#]/)[0] ?? "";
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
  await completeGithubConnectViaCallback(stagehand.context, { installationId: "42" });
}, 120_000);

afterAll(async () => {
  await stagehand?.close();
});

describe("A committed non-KJV/BSB translation hydrates the studio (not a load error)", () => {
  test("E-TW1: seed a manifest with a non-KJV/BSB translation → /studio hydrates + reads it back", async () => {
    // ── seed: create a real project, then commit a crafted non-KJV/BSB manifest ──
    const slug = await createProjectAndOpenStudio(`translation-widen-${RUN_ID}`);
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
