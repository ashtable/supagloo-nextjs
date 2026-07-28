import { defineConfig } from "vitest/config";

/**
 * E2E lane 2 of 3 — the REAL-STACK lane (task-62 D21).
 *
 * The ten specs that drive the browser through the BFF into the CONTAINERISED
 * supagloo-nodejs-api, Postgres, MinIO, a DBOS worker and — as of task 62 half
 * (A) — **real github.com / api.github.com**. No stubs are involved anywhere.
 *
 * Requires, all of which `tests/e2e/global-setup.render.ts` brings up or gates:
 *   1. the Compose stack (`postgres minio minio-init migrate api dbos`) from the
 *      ROOT repo, with the gitignored `docker-compose.override.yml` present so
 *      in-flight api/dbos code is what gets built;
 *   2. `next dev` on :3000 (reused or spawned);
 *   3. the root `.env` GitHub App credentials + `GITHUB_E2E_PAT_TOKEN`, loaded
 *      into every worker by `./tests/e2e/load-root-env.ts` (D24 — globalSetup
 *      runs in the main process, so setupFiles is the only thing that reaches
 *      the workers).
 *
 * ── EXECUTION HONESTY (D21) ──────────────────────────────────────────────────
 * These specs are EDITED + TYPECHECKED under half (A); their execution
 * stays deferred exactly as it was before (their own headers say so). Only the
 * render lane must be green for plan row 62. Do not report this lane as green
 * unless it actually ran green.
 *
 * `fileParallelism: false` is mandatory: one browser at a time, and — because the
 * specs share one DBOS worker and create real GitHub repos — no two specs may
 * scaffold concurrently. Never run this lane at the same time as the dbos repo's
 * e2e lanes (those kill and restart the worker) or the render lane.
 *
 * Timeouts are generous because every git operation is now a real round-trip to
 * github.com rather than a localhost stub: clone → commit → push → open PR →
 * merge → cut branch, against the wireframes' designed ~20 s ideal.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: [
      // Task item 1 — the LIVE YouVersion contract behind the studio scripture picker.
      // Browser-free: it drives `lib/youversion/client.ts` straight against
      // api.youversion.com. It lives in this lane (not the mock one) because it makes
      // real provider egress and needs the root `.env` app key.
      "tests/e2e/bible-youversion-live.e2e.ts",
      "tests/e2e/bff-session.e2e.ts",
      // Row 41 — the public gallery + "Your videos". Needs Compose (postgres, minio,
      // migrate, api) and the ROOT repo's `tests/support/gallery-e2e-seed.mjs`, but NOT
      // GitHub and NOT a provider: nothing here scaffolds a repo or runs a generation.
      "tests/e2e/gallery.e2e.ts",
      // Turn 16a — the watch page at `/gallery/[id]`. Same dependencies as the spec
      // above (Compose + the ROOT repo's gallery seed helper), plus it is the one place
      // the seeded mp4 is actually fetched by a browser: slice C7 retired the modal, so
      // `E-GU11`'s playback proof moved here as `E-GW3`.
      "tests/e2e/gallery-watch.e2e.ts",
      "tests/e2e/github-connect.e2e.ts",
      "tests/e2e/openrouter-gloo-connect.e2e.ts",
      "tests/e2e/project-wizards-real.e2e.ts",
      "tests/e2e/studio-ai-generation.e2e.ts",
      // Genesis-1 — the Inspector's provider/model selectors, faith alignment and cost
      // estimate against the LIVE OpenRouter AND Gloo catalogues. It needs Compose (the
      // api reads Gloo's catalogue with a bearer minted from the user's stored, encrypted
      // client credentials), real GitHub (E-MC5 commits the manifest and re-reads it from
      // git), and the root `.env` GLOO_CONNECT_* credentials.
      "tests/e2e/studio-model-cost.e2e.ts",
      "tests/e2e/studio-hydration.e2e.ts",
      "tests/e2e/studio-publish-real.e2e.ts",
      "tests/e2e/studio-replan-scripture.e2e.ts",
      "tests/e2e/studio-translation-widen.e2e.ts",
    ],
    testTimeout: 300_000,
    hookTimeout: 900_000,
    fileParallelism: false,
    globalSetup: ["./tests/e2e/global-setup.render.ts"],
    setupFiles: ["./tests/e2e/load-env.ts", "./tests/e2e/load-root-env.ts"],
  },
});
