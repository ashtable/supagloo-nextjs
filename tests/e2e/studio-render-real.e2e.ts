import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { type StagehandPage } from "./helpers";
import { completeGithubConnectViaCallback } from "./connect-helpers";
import {
  createProjectViaExistingEmptyRepo,
  resolveInstallationId,
} from "./github-e2e";

/**
 * Task #38 + plan row 62 — the REAL-STACK 14c render overlay, exercised end to end
 * (browser → BFF routes → the containerised supagloo-nodejs-api → Postgres + MinIO +
 * **real github.com** → the DBOS `render` worker running a real Remotion bundle +
 * encode) via the `?seed=` seam (design-delta §5.3 row 8 / §6c).
 *
 * This is the real counterpart of the mock render specs (`studio-publish.e2e.ts`
 * E-RND1..4), which stay green untouched in the Docker-free mock lane: in a demo build
 * the catalog id `psalm-121` resolves to the bundled DEMO_STORYBOARD and keeps the fake
 * frame ticker. Where those prove the DESIGN, this proves the DATA: the overlay's
 * frames, status, output spec and download link all come from `GET /v1/renders/:id`.
 *
 * ── THE LANE (task-62 D21) ───────────────────────────────────────────────────
 * This file IS the heavy render lane: `npm run test:e2e:render`
 * (`vitest.e2e.render.config.ts` includes exactly this path). Its
 * `tests/e2e/global-setup.render.ts` brings up the root Compose stack
 * (`postgres minio minio-init migrate api dbos`) and gates it: both logical
 * databases, MinIO, the api's `/healthz`, then the DBOS worker — running, NOT
 * crash-looping across two samples, and having logged its own launch line. That
 * worker gate is new: nothing anywhere used to start a DBOS worker, which is the
 * whole reason this spec had never executed.
 *
 * The filename is deliberately unchanged: plan row 62's acceptance criterion names
 * `tests/e2e/studio-render-real.e2e.ts` verbatim, and lane membership is the
 * config's `include`, not a naming convention.
 *
 * Requires: `next dev` on :3000 (globalSetup reuses/spawns it), the root repo's
 * gitignored `docker-compose.override.yml` so the api+dbos containers carry
 * in-flight code, all six `S3_*` at the Compose MinIO with
 * `S3_PUBLIC_ENDPOINT=http://localhost:9000` (E-RR3 fetches presigned objects FROM
 * THE BROWSER, so they must be host-reachable), and the root `.env` GitHub App
 * credentials + `GITHUB_E2E_PAT_TOKEN`. NEVER run concurrently with the dbos
 * repo's e2e lanes — those kill and restart the worker to prove crash-recovery.
 *
 * ── HOW A PROJECT IS ACQUIRED (task-62 D14) ──────────────────────────────────
 * `createProjectAndOpenStudio` used to drive the wizard's create-NEW-repo tab and
 * then fake GitHub's user-authorization redirect with a literal `code`. The
 * retired github-stub accepted any non-empty code; real GitHub answers
 * `bad_verification_code`, and there is no seam to intercept the exchange inside a
 * containerised api. So this spec now uses the wizard's SECOND tab — "use existing
 * empty repo" (wireframe 13a), a fully shipped designed path whose
 * `startRealExisting` POSTs straight to `/api/projects` with no consent hop —
 * against a private throwaway repo the harness PAT-creates per run. That keeps
 * this lane's failure modes about RENDERING instead of OAuth plumbing, and it
 * removes `GITHUB_APP_CLIENT_ID`/`SECRET` from the critical path entirely. The
 * shared helper lives in `tests/e2e/github-e2e.ts`.
 *
 * Fixture repos are NEVER torn down by a spec (they live in an account that also
 * holds real repos). Reclaim them with the root repo's interactive
 * `npm run cleanup:github-e2e`, which archives — never deletes.
 *
 * ── COST / LATENCY (design-delta §10.9, plan §6 note 4) ──────────────────────
 * The SLOW/HEAVY lane: a real Chromium install + Remotion bundle takes minutes,
 * and every git operation is now a real round-trip to github.com (the wizard's
 * `project-ready-card` budget is 240 s against the wireframes' designed ~20 s
 * ideal). Hence the 20-minute per-test budgets below.
 *
 * It is ZERO-PROVIDER-egress (no OpenRouter/Gloo/YouVersion calls), but NOT because
 * anything is cached. Every test here builds a FRESH project, so the manifest the
 * worker renders is db-lib's `buildBlankManifest()`: `scenes: []`, a `narratorVoice`
 * with NO `assetKey`, and no `music` key at all. Both of the worker's audio plans
 * therefore resolve to `skipped` in dbos `render/audio.ts` `planAudioTrack` —
 * narration because the per-scene `scriptText` concatenation over zero scenes is
 * empty ("no narration script text in the manifest"), music because
 * `manifest.music?.style` is undefined ("the manifest has no music bed") — and a
 * `skipped` plan issues no `requestSpeech`. (If `RENDER_NARRATION_MODEL`/
 * `RENDER_MUSIC_MODEL` are unset, or the seeded owner has no OpenRouter connection,
 * both plans skip even earlier, at those gates. Every path through a blank manifest
 * is `skipped`.) The GIT path, by contrast, is now fully real: a real clone from
 * github.com on every render.
 *
 * ── WHAT THAT COSTS US IN COVERAGE (read before quoting these results) ───────
 * The same blank fixture is the limit of this spec. A zero-scene manifest generates
 * a composition whose `durationInFrames` is clamped to `Math.max(1, 0) === 1`, so
 * **there is essentially ONE frame to count**: E-RR2's "frames advance" assertion is
 * WEAK, and "the overlay tracks real frames" is true only in the sense that every
 * number the overlay shows originates from the server rather than a fake ticker. Do
 * not overclaim it. These tests prove the PLUMBING — clone → install → bundle →
 * encode → upload → presign, plus the overlay tracking whatever the server reports —
 * over an essentially empty 1080×1920 frame. They do NOT exercise the `cached` audio
 * branch, a multi-scene composition, or a frame count large enough for the progress
 * math to be interesting. A zero-egress multi-scene render fixture is its own plan row.
 *
 * ── NO PARITY ASSERTIONS ─────────────────────────────────────────────────────
 * Per design-delta §2 v1-limitation #2 (restated as a hard rule at plan.md:122), nothing
 * here compares the studio preview's frame math to the server's `framesTotal`. The spec
 * asserts the overlay tracks whatever the SERVER reports, never that the two agree.
 *
 * ── THE THUMBNAIL IS PROVEN SERVER-SIDE, ON PURPOSE (task-62 D17) ────────────
 * Row 62's acceptance demands "a real Remotion mp4 PLUS its thumbnail in MinIO".
 * Wireframe 14c has **no thumbnail affordance** — its mini preview is a client-side
 * gradient plus the studio-derived caption, not the render's `thumbnailAssetKey` —
 * so asserting a thumbnail through the UI would invent design authority the
 * wireframes do not grant. E-RR3 instead proves it through routes that already
 * ship: `GET /api/renders/<id>` → `thumbnailAssetKey` → presign → an in-page fetch
 * of the presigned URL → JPEG magic bytes. `thumbnailAssetKey` is surfaced by the
 * DTO and has no UI consumer by design. Honest limit: this proves the object
 * exists, is JPEG-framed, is owner-scoped and is reachable by the browser through
 * the real presigner against real MinIO — NOT that it depicts a representative
 * frame (on a 1-frame blank composition that would be near-meaningless anyway).
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

/** How long the SERVER's render may take once it has been enqueued. */
const RENDER_TIMEOUT_MS = 900_000;

/**
 * The per-test budget. Larger than `RENDER_TIMEOUT_MS` because each test first
 * scaffolds a fresh project against real github.com (up to 240 s) and publishes it
 * (up to 180 s) before any render starts.
 */
const TEST_TIMEOUT_MS = 1_200_000;

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
 * Create a fresh real project and open its studio, via the ONE shared
 * existing-empty-repo helper (task-62 D14 — see the header). `slug` names the
 * throwaway repo's purpose; the harness appends the per-run id, so repeated and
 * concurrent runs never collide on a GitHub repo name (real GitHub 422s duplicates,
 * and the scaffold's v0.0.0 commit is byte-deterministic, so a REUSED repo would
 * reject a second run).
 */
async function createProjectAndOpenStudio(slug: string): Promise<string> {
  const { projectId } = await createProjectViaExistingEmptyRepo(page, {
    slug,
    seedUrl: SEED_URL,
  });
  return projectId;
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
  // The REAL installation id, discovered from `GET /app/installations` — never the
  // literal "42" this used to plant, which is exactly what made every downstream
  // `POST /app/installations/42/access_tokens` a permanent 404 (plan row 62 item d).
  await completeGithubConnectViaCallback(stagehand.context, {
    installationId: await resolveInstallationId(),
  });
}, 300_000);

afterAll(async () => {
  await stagehand?.close();
});

describe("Render a REAL project → real endpoint + polled progress + download", () => {
  test("E-RR1/E-RR2/E-RR3: the overlay opens on the server's spec, tracks real frames, and lands on a working download link", async () => {
    const slug = await createProjectAndOpenStudio("render");
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
    // The presigned URL actually resolves to the encoded mp4. `bytes` proves it is
    // not an empty/error object; the ISO-BMFF `ftyp` box at offset 4 proves it is an
    // MP4 CONTAINER and not, say, an XML S3 error body that happened to be long
    // (the dbos-side render spec makes the same check; this one used to omit it).
    const probe = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      return {
        ok: res.ok,
        bytes: buf.byteLength,
        brand: String.fromCharCode(...Array.from(bytes.slice(4, 8))),
      };
    }, href);
    expect(probe.ok).toBe(true);
    expect(probe.bytes).toBeGreaterThan(1000);
    expect(probe.brand, "the download is a real MP4 container").toBe("ftyp");

    // ── the THUMBNAIL half of row 62's acceptance, proven SERVER-SIDE ─────────
    // 14c has no thumbnail affordance (its mini preview is a client-side gradient),
    // so this walks the shipped routes instead of inventing UI: the overlay's own
    // `data-render-job-id` → GET /api/renders/<id> → thumbnailAssetKey → presign →
    // an in-page fetch of the presigned URL → JPEG magic bytes. Everything runs in
    // the BROWSER, so it also proves the presigned URL is host-reachable through
    // MinIO's public endpoint, and that the api's ownership scoping accepts the
    // render-thumbnail key for the seeded owner. This is the first consumer of the
    // `render-thumbnail` presign kind — a failure here may be a latent bug in it
    // rather than in the render itself.
    const renderJobId = await testidAttr("render-overlay", "data-render-job-id");
    expect(renderJobId.length, "the overlay carries the server render id").toBeGreaterThan(
      0,
    );

    const thumb = await page.evaluate(async (id) => {
      const out = {
        stage: "detail",
        detailStatus: 0,
        key: "",
        presignStatus: 0,
        url: "",
        ok: false,
        bytes: 0,
        head: "",
      };
      const detail = await fetch(`/api/renders/${id}`, { cache: "no-store" });
      out.detailStatus = detail.status;
      if (!detail.ok) return out;
      const body = (await detail.json()) as {
        render?: { thumbnailAssetKey?: string | null };
      };
      out.stage = "key";
      out.key = body.render?.thumbnailAssetKey ?? "";
      if (!out.key) return out;

      out.stage = "presign";
      const presign = await fetch(
        `/api/files/presign-download?key=${encodeURIComponent(out.key)}`,
        { cache: "no-store" },
      );
      out.presignStatus = presign.status;
      if (!presign.ok) return out;
      out.url = ((await presign.json()) as { url?: string }).url ?? "";
      if (!out.url) return out;

      out.stage = "fetch";
      const object = await fetch(out.url);
      const buf = await object.arrayBuffer();
      out.ok = object.ok;
      out.bytes = buf.byteLength;
      out.head = Array.from(new Uint8Array(buf.slice(0, 3)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
      out.stage = "ok";
      return out;
    }, renderJobId);

    expect(
      thumb.stage,
      `thumbnail proof stopped at "${thumb.stage}" (render detail ${thumb.detailStatus}, ` +
        `key ${JSON.stringify(thumb.key)}, presign ${thumb.presignStatus})`,
    ).toBe("ok");
    // The key shape the render workflow's `buildRenderThumbnailKey` produces — the
    // same shape the api's own renders e2e pins.
    expect(thumb.key).toBe(`renders/${renderJobId}/thumb.jpg`);
    expect(thumb.url).toContain("X-Amz-Signature");
    expect(thumb.ok).toBe(true);
    expect(thumb.bytes).toBeGreaterThan(1000);
    // JPEG SOI + marker. Remotion writes the thumbnail as a JPEG.
    expect(thumb.head, "the thumbnail is a real JPEG").toBe("ff d8 ff");

    // "Back to studio" dismisses the terminal card (D-RENDER-DISMISS governs the
    // IN-FLIGHT overlay; a finished card must be dismissable).
    await clickTestId("render-done");
    await waitForGone("render-overlay");
  }, TEST_TIMEOUT_MS);

  test("E-RR4: Run in background hides the overlay, the studio stays interactive, and the render still finishes", async () => {
    const slug = await createProjectAndOpenStudio("renderbg");
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
  }, TEST_TIMEOUT_MS);

  test("E-RR5: Cancel render clears the overlay and the server render reaches `canceled`", async () => {
    const slug = await createProjectAndOpenStudio("rendercancel");
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
  }, TEST_TIMEOUT_MS);
});
