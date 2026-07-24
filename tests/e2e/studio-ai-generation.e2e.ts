import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { type StagehandPage } from "./helpers";
import {
  completeGithubConnectViaCallback,
  completeCreateRepoViaCallback,
} from "./connect-helpers";

/**
 * Task #35 — the REAL-STACK studio AI wiring, exercised end to end (browser → BFF
 * routes → supagloo-nodejs-api → Postgres + github-stub/git-server → the DBOS
 * ai-generation worker calling REAL OpenRouter → MinIO) via the `?seed=` seam
 * (design-delta §5.3, §6b, §10). The commit's git path stays github-stub + git-server;
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
 * ── EXECUTION NOTE (in-flight-dblib-e2e-constraint; same posture as tasks 27/28) ──
 * Running this requires the full real stack stood up: `next dev` (global-setup),
 * a locally-built API (`node dist/server.js`) carrying the merged task-31/32 AI
 * routes + real OpenRouter creds, a running DBOS **ai-generation** worker (so an
 * `image` generation reaches `succeeded` with a real MinIO `resultAssetKey`), and a
 * DBOS **git-ops commit** worker (so Commit lands). Until that stack is stood up the
 * spec's EXECUTION is DEFERRED to the release step; the behavior is proven meanwhile
 * by the nextjs unit suite (`lib/studio/ai-generation-data.test.ts`,
 * `lib/studio/reducer.test.ts` generation machine + outcome mappers,
 * `lib/studio/storyboard.test.ts` transforms, `lib/studio/manifest-adapter.test.ts`
 * reroll→serialize persistence, `lib/api/ai-config.test.ts`, `lib/api/contracts.test.ts`).
 *
 * DELIBERATELY Gloo-free + deterministic (testid + `evaluate` + `data-*`, NOT
 * act/extract/observe) — the same convention as every prior studio + real-stack spec
 * (act/extract/observe need the degraded Gloo LLM client, and every load-bearing
 * assertion here is a precise data-attribute / element check, not natural language).
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

/** Open a studio that HAS scenes: either a provided populated-manifest fixture
 *  (`SUPAGLOO_E2E_STUDIO_SLUG`, fast) or a fresh project whose storyboard is
 *  generated via the real `storyboard` kind from the empty state. Returns the slug. */
async function openStudioWithScenes(): Promise<string> {
  const fixture = process.env.SUPAGLOO_E2E_STUDIO_SLUG;
  if (fixture) {
    await page.goto(`${BASE_URL}/studio/${fixture}?seed=authed-returning&nonce=${RUN_ID}`, {
      waitUntil: "load",
    });
    await waitForTestId("script-input", 60_000);
    return fixture;
  }
  const slug = await createProjectAndOpenStudio(`aigen-${RUN_ID}`);
  await waitForTestId("studio-frame");
  // A freshly-scaffolded project is empty → the first-time "Generate storyboard"
  // entry point runs a REAL `storyboard` generation; scenes appear when it lands.
  await waitForTestId("generate-storyboard");
  await clickTestId("generate-storyboard");
  await waitForTestId("script-input", 240_000);
  return slug;
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

describe("Reroll visual → preview updates from a real MinIO asset, and survives commit + re-open", () => {
  test("E-AI1/E-AI2: reroll a scene visual (real OpenRouter → MinIO), then Commit + re-open persists the ref", async () => {
    const slug = await openStudioWithScenes();
    expect(slug.length).toBeGreaterThan(0);

    // A scene is selected and clean; no visual generated yet.
    await waitForTestId("scene-inspector");
    expect(await dataAttr("version-branch-chip", "data-dirty")).toBe("false");

    // ── E-AI1: real reroll → preview updates from a MinIO asset ────────────────
    await clickTestId("reroll-visual");
    // pending state shows immediately
    await waitForDataAttr("reroll-visual", "data-state", "running", 10_000);
    // the real image generation lands: a real MinIO key + a rendered <Img> preview
    const assetKey = await waitForVisualAssetKey(240_000);
    expect(assetKey).toMatch(/^projects\/.+\/assets\/.+/);
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
