import { defineConfig } from "vitest/config";

/**
 * E2E lane 3 of 3 — the HEAVY RENDER lane (task-62 D21). **Plan row 62's
 * acceptance criterion runs here, and nowhere else.**
 *
 * `include` is a single file. Row 62's acceptance text names
 * `tests/e2e/studio-render-real.e2e.ts` verbatim, so the spec deliberately KEEPS
 * that filename — lane membership is this `include`, not a `*.render.e2e.ts`
 * naming convention (a rename would make the acceptance text false and churn
 * every plan/memory reference).
 *
 * It is its own lane so it can be re-run on its own: one pass is a real Remotion
 * bundle + encode per test (`npm ci --ignore-scripts` inside the worker's cloned
 * workspace, a headless Chromium download on first run), on top of three real
 * scaffolds against github.com. Minutes, not seconds — hence the 20-minute
 * per-test budget. The spec also passes its own `RENDER_TIMEOUT_MS` per test.
 *
 * Requires everything `vitest.e2e.real.config.ts` requires — the Compose stack
 * with a live DBOS worker (both the `git-ops` and `render` queues), MinIO with a
 * host-reachable `S3_PUBLIC_ENDPOINT` (the spec fetches the presigned mp4 and
 * thumbnail FROM THE BROWSER), and the root `.env` GitHub credentials.
 * `tests/e2e/global-setup.render.ts` brings that up and gates it.
 *
 * NEVER run concurrently with the dbos repo's e2e lanes: those specs kill and
 * restart the worker to prove crash-recovery, which would abort a render mid-flight.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/studio-render-real.e2e.ts"],
    testTimeout: 1_200_000,
    hookTimeout: 900_000,
    fileParallelism: false,
    globalSetup: ["./tests/e2e/global-setup.render.ts"],
    setupFiles: ["./tests/e2e/load-env.ts", "./tests/e2e/load-root-env.ts"],
  },
});
