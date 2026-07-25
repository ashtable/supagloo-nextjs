import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { type StagehandPage } from "./helpers";
import {
  completeGithubConnectViaCallback,
  completeCreateRepoViaCallback,
} from "./connect-helpers";

/**
 * Task #38 — the REAL-STACK 14c render overlay, exercised end to end (browser → BFF
 * routes → supagloo-nodejs-api → Postgres + MinIO + github-stub + git-server → the DBOS
 * `render` worker running a real Remotion bundle + encode) via the `?seed=` seam
 * (design-delta §5.3 row 8 / §6c).
 *
 * This is the real counterpart of the mock render specs (`studio-publish.e2e.ts`
 * E-RND1..4), which stay green untouched: in a demo build the catalog id `psalm-121`
 * resolves to the bundled DEMO_STORYBOARD and keeps the fake frame ticker. Where those
 * prove the DESIGN, this proves the DATA: the overlay's frames, status, output spec and
 * download link all come from `GET /v1/renders/:id`.
 *
 * ── EXECUTION NOTE (release-step harness) ────────────────────────────────────
 * Running this spec requires the FULL real stack:
 *   1. `next dev` on :3000 (global-setup spawns/reuses it);
 *   2. a locally-built API (`node dist/server.js`) with the studio env (GITHUB_* →
 *      github-stub + git-server, all six S3_* → the Compose MinIO);
 *   3. a running DBOS `render` worker — a REAL Remotion render: clone at the version
 *      branch, `npm ci --ignore-scripts`, bundle and encode in a scrubbed-env child,
 *      then upload `renders/{id}/output.mp4` + `thumb.jpg` to MinIO.
 * Standing that up is the release-step harness's job, so — exactly like the sibling
 * `studio-publish-real.e2e.ts` / `studio-hydration.e2e.ts` / `project-wizards-real.e2e.ts`
 * — this spec is WRITTEN + typechecked and its EXECUTION is DEFERRED to that harness.
 * It is never reported as a false green.
 *
 * Behaviour is proven meanwhile by the nextjs unit suite (the wire-contract pins in
 * `lib/api/contracts.test.ts`, the polled-fixture overlay mapping in
 * `lib/studio/render-model.test.ts`, the render effects in `lib/studio/render-data.test.ts`,
 * and the real-render reducer transitions + `renderOutcome` in `lib/studio/reducer.test.ts`)
 * and, on the server side, by the api repo's `tests/e2e/renders.e2e.ts` (real HTTP + real
 * DBOS enqueue/cancel + a real presigned MinIO download) plus the dbos repo's
 * `render.render.e2e.ts` (the real Remotion render itself, task 36).
 *
 * ── COST / LATENCY (design-delta §10.9, plan §6 note 4) ──────────────────────
 * This is the SLOW/HEAVY lane: a real Chromium install + Remotion bundle takes minutes,
 * hence the 900 s timeouts below.
 *
 * It is ZERO-provider-egress, but NOT because anything is cached. Every test here builds
 * a FRESH project through the create-repo wizard (`createProjectAndOpenStudio`), so the
 * manifest the worker renders is db-lib's `buildBlankManifest()`: `scenes: []`, a
 * `narratorVoice` with NO `assetKey`, and no `music` key at all. Both of the worker's
 * audio plans therefore resolve to `skipped` in dbos `render/audio.ts` `planAudioTrack`
 * — narration because the per-scene `scriptText` concatenation over zero scenes is empty
 * ("no narration script text in the manifest"), music because `manifest.music?.style` is
 * undefined ("the manifest has no music bed") — and a `skipped` plan issues no
 * `requestSpeech`. (If `RENDER_NARRATION_MODEL`/`RENDER_MUSIC_MODEL` are unset, or the
 * seeded owner has no OpenRouter connection, both plans skip even earlier, at those
 * gates. Every path through a blank manifest is `skipped`.) The git path stays on
 * github-stub + git-server (§10 — GitHub is still stubbed).
 *
 * ── WHAT THAT COSTS US IN COVERAGE ───────────────────────────────────────────
 * The same blank fixture is the limit of this spec. A zero-scene manifest generates a
 * composition whose `durationInFrames` is clamped to 1, so what these tests prove is the
 * PLUMBING — clone → install → bundle → encode → upload → presign, and the overlay
 * tracking whatever the server reports — over an essentially empty 1080×1920 frame. They
 * do NOT exercise the `cached` audio branch, a multi-scene composition, or a frame count
 * large enough for the progress math to be interesting. Covering those needs a fixture
 * that generates and commits scene content first; tracked as a follow-up plan row.
 *
 * ── NO PARITY ASSERTIONS ─────────────────────────────────────────────────────
 * Per design-delta §2 v1-limitation #2 (restated as a hard rule at plan.md:122), nothing
 * here compares the studio preview's frame math to the server's `framesTotal`. The spec
 * asserts the overlay tracks whatever the SERVER reports, never that the two agree.
 *
 * DELIBERATELY Gloo-free + deterministic (testid + `evaluate` + `data-*`, NOT
 * act/extract/observe — those need the Gloo LLM client the harness keeps degraded, and
 * an `act`-driven click on a multi-minute progress overlay would be flaky for no gain;
 * every prior real-stack spec follows this convention). Per-run nonce.
 */

const BASE_URL = "http://localhost:3000";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SEED_URL = `${BASE_URL}/?seed=authed-returning&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

/** A real render is minutes, not seconds — this is the heavy lane. */
const RENDER_TIMEOUT_MS = 900_000;

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
async function testidAttr(id: string, attr: string): Promise<string> {
  return page.evaluate(
    ({ sel, a }) =>
      document
        .querySelector<HTMLElement>(`[data-testid="${sel}"]`)
        ?.getAttribute(a) ?? "",
    { sel: id, a: attr },
  );
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
async function waitForGone(id: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(id)) === 0) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`[data-testid="${id}"] never disappeared within ${timeoutMs}ms`);
}
/** Wait until the overlay's `data-status` is one of `wanted`; returns the one seen. */
async function waitForRenderStatus(
  wanted: readonly string[],
  timeoutMs = RENDER_TIMEOUT_MS,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await testidAttr("render-overlay", "data-status");
    if (wanted.includes(last)) return last;
    await page.waitForTimeout(500);
  }
  throw new Error(
    `render never reached ${wanted.join("|")} within ${timeoutMs}ms (last: ${last})`,
  );
}
/** Wait until the overlay has attached the server render id (the POST has returned). */
async function waitForRenderJobId(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await testidAttr("render-overlay", "data-render-job-id")).length > 0) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`render-overlay never attached a render job id within ${timeoutMs}ms`);
}

/** The first integer in a testid's text (`"612 / 840"` → 612, `"0 / —"` → 0). */
async function firstIntIn(id: string): Promise<number> {
  const text = await testidText(id);
  const m = text.match(/\d+/);
  return m ? Number(m[0]) : -1;
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

/** Create a fresh real project via the create-new JIT hop and open its studio. */
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

/** Publish the working version, then fire the step-3 "Render & share ▸" CTA. */
async function publishThenStartRender(): Promise<void> {
  await clickTestId("publish-button");
  await waitForTestId("publish-review");
  await clickTestId("publish-confirm");
  await waitForTestId("publish-published-card", 180_000);
  await clickTestId("publish-render-share");
  await waitForTestId("render-overlay", 30_000);
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

describe("Render a REAL project → real endpoint + polled progress + download", () => {
  test("E-RR1/E-RR2/E-RR3: the overlay opens on the server's spec, tracks real frames, and lands on a working download link", async () => {
    const slug = await createProjectAndOpenStudio(`render-${RUN_ID}`);
    expect(slug.length).toBeGreaterThan(0);
    await waitForTestId("studio-frame");

    await publishThenStartRender();

    // E-RR1 — the overlay is REAL (not the mock ticker) and names the published tag.
    expect(await testidAttr("render-overlay", "data-mode")).toBe("real");
    expect(await testidText("render-eyebrow")).toContain("RENDERING · v0.0.1");
    expect(await countTestId("render-stage")).toBe(4);

    // Before bundleComposition the server has no frame total — the overlay must say so
    // rather than fake a percentage (D1/D8).
    expect(await testidText("render-frame-count")).toContain("/ —");
    expect(await testidAttr("render-bar-fill", "data-indeterminate")).toBe("1");
    // ...and the progress caption names the real phase, including the two `queued`
    // states task 36 handed to task 38.
    expect(
      [
        "Waiting for a render worker",
        "Preparing your project",
        "Synthesizing narration & music",
        "Bundling composition",
        "Encoding frames",
        "Uploading & finalizing",
        "Starting render",
      ],
    ).toContain(await testidText("render-progress-label"));

    // E-RR2 — once encoding starts the frame total is REAL and progress climbs. No
    // parity assertion: we only require the SERVER's numbers to be self-consistent.
    await waitForRenderStatus(["encoding", "uploading", "completed"]);
    if ((await testidAttr("render-overlay", "data-status")) === "encoding") {
      expect(await testidAttr("render-bar-fill", "data-indeterminate")).toBe("0");
      const total = Number((await testidText("render-frame-count")).split("/")[1]?.trim());
      expect(total).toBeGreaterThan(0);

      const first = await firstIntIn("render-frame-count");
      const deadline = Date.now() + 120_000;
      let grew = false;
      while (Date.now() < deadline) {
        if ((await firstIntIn("render-frame-count")) > first) {
          grew = true;
          break;
        }
        if ((await testidAttr("render-overlay", "data-status")) !== "encoding") {
          grew = true; // it finished encoding out from under us — progress happened
          break;
        }
        await page.waitForTimeout(500);
      }
      expect(grew, "render frames advance over time").toBe(true);
    }

    // E-RR3 — completion: the terminal card, the four ✓ stages, a real download link.
    await waitForRenderStatus(["completed"]);
    await waitForTestId("render-complete", 30_000);
    expect(await countTestId("render-failed")).toBe(0);
    expect(await dataAttrAll("render-stage", "data-status")).toEqual([
      "completed",
      "completed",
      "completed",
      "completed",
    ]);
    // the spec line is the SERVER's echo
    expect(await testidText("render-progress-label")).toMatch(
      /^\d+×\d+ · \d+:\d+ · \d+fps · /,
    );

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if ((await testidAttr("render-download", "data-ready")) === "1") break;
      await page.waitForTimeout(500);
    }
    expect(await testidAttr("render-download", "data-ready")).toBe("1");

    const href = await testidAttr("render-download", "href");
    expect(href).toContain("renders/");
    expect(href).toContain("X-Amz-Signature");
    // the presigned URL actually resolves to the encoded mp4
    const probe = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      return { ok: res.ok, bytes: buf.byteLength };
    }, href);
    expect(probe.ok).toBe(true);
    expect(probe.bytes).toBeGreaterThan(1000);

    // "Back to studio" dismisses the terminal card (D-RENDER-DISMISS governs the
    // IN-FLIGHT overlay; a finished card must be dismissable).
    await clickTestId("render-done");
    await waitForGone("render-overlay");
  }, RENDER_TIMEOUT_MS);

  test("E-RR4: Run in background hides the overlay, the studio stays interactive, and the render still finishes", async () => {
    const slug = await createProjectAndOpenStudio(`renderbg-${RUN_ID}`);
    expect(slug.length).toBeGreaterThan(0);
    await waitForTestId("studio-frame");

    await publishThenStartRender();
    await clickTestId("render-background");
    await waitForGone("render-overlay", 15_000);

    // interactive again — the version chip still responds, nothing is blocking
    expect(await countTestId("version-menu-trigger")).toBeGreaterThan(0);
    await clickTestId("version-menu-trigger");
    await waitForTestId("version-menu");
    await clickTestId("version-menu-trigger");
    await waitForGone("version-menu");

    // The poll driver lives in StudioProvider (above the overlay), so a hidden render
    // keeps polling — the completion card reappears with the download link.
    await waitForTestId("render-complete", RENDER_TIMEOUT_MS);
    expect(await testidAttr("render-overlay", "data-status")).toBe("completed");
    await clickTestId("render-done");
    await waitForGone("render-overlay");
  }, RENDER_TIMEOUT_MS);

  test("E-RR5: Cancel render clears the overlay and the server render reaches `canceled`", async () => {
    const slug = await createProjectAndOpenStudio(`rendercancel-${RUN_ID}`);
    expect(slug.length).toBeGreaterThan(0);
    await waitForTestId("studio-frame");

    await publishThenStartRender();
    // Capture the server render id before dismissing, so we can verify the SERVER state
    // afterwards. (The overlay carries it; there is deliberately no `?mine=1` BFF route
    // yet — the "Your videos" listing is plan task 41.)
    await waitForRenderJobId();
    const renderJobId = await testidAttr("render-overlay", "data-render-job-id");
    expect(renderJobId.length).toBeGreaterThan(0);

    await clickTestId("render-cancel");
    await waitForGone("render-overlay", 15_000);
    expect(await countTestId("render-overlay")).toBe(0);

    // The API cancels the DBOS workflow first, then conditionally flips the row — so the
    // row reaches `canceled` (or, if it raced a completion, stays `completed`; never a
    // false `canceled` over finished work).
    {
      const deadline = Date.now() + 120_000;
      let status = "";
      while (Date.now() < deadline) {
        status = await page.evaluate(async (id) => {
          const res = await fetch(`/api/renders/${id}`, { cache: "no-store" });
          if (!res.ok) return "";
          const body = (await res.json()) as { render?: { status: string } };
          return body.render?.status ?? "";
        }, renderJobId);
        if (status === "canceled" || status === "completed") break;
        await page.waitForTimeout(1000);
      }
      expect(["canceled", "completed"]).toContain(status);
    }
  }, RENDER_TIMEOUT_MS);
});
