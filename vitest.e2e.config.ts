import { defineConfig } from "vitest/config";

/**
 * E2E lane 1 of 3 — the MOCK lane (task-62 D21).
 *
 * Drives a real local browser via Stagehand v3 (env: "LOCAL") against `next dev`
 * on :3000. NOTHING ELSE: no Docker Compose, no supagloo-nodejs-api, no DBOS
 * worker, no root `.env`, and **no network egress to github.com**. That is the
 * point of this lane — half (A) of task 62 replaced the github-stub with REAL
 * GitHub for every real-stack spec, and these eight specs are what keeps
 * "mock/pure-UI coverage still runs anywhere, offline, in seconds" true.
 *
 * The other two lanes need Compose + a DBOS worker + real GitHub credentials:
 *   - `vitest.e2e.real.config.ts`   → `npm run test:e2e:real`
 *   - `vitest.e2e.render.config.ts` → `npm run test:e2e:render` (row 62's target)
 *
 * `exclude` below is therefore load-bearing, not tidiness: a real-stack spec that
 * leaked into this lane would fail for an infrastructure reason in the one lane
 * that must stay green everywhere. `tests/unit/e2e-lane-coverage.test.ts` asserts
 * the three lanes partition `tests/e2e/*.e2e.ts` exactly once and pins this
 * lane's membership by name, so adding a spec forces an explicit lane decision.
 *
 * Deliberately does NOT list `./tests/e2e/load-root-env.ts` in `setupFiles` (D24):
 * the mock lane must not require the root repo's `.env` to exist.
 *
 * Long timeouts (cold compile + LLM calls), one browser at a time, a global setup
 * that boots/reuses the dev server, and a setup file that loads .env.local into
 * the worker (for Gloo creds).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.ts"],
    exclude: [
      // ── the twelve real-stack specs (lane 2: vitest.e2e.real.config.ts) ──
      // Real YouVersion egress (§11.2: real provider or no provider). It needs the ROOT
      // repo's `.env` for YOUVERSION_APP_KEY, which only the real/render lanes load.
      "tests/e2e/bible-youversion-live.e2e.ts",
      "tests/e2e/bff-session.e2e.ts",
      "tests/e2e/gallery.e2e.ts",
      "tests/e2e/gallery-watch.e2e.ts",
      "tests/e2e/github-connect.e2e.ts",
      "tests/e2e/openrouter-gloo-connect.e2e.ts",
      "tests/e2e/project-wizards-real.e2e.ts",
      "tests/e2e/studio-ai-generation.e2e.ts",
      "tests/e2e/studio-model-cost.e2e.ts",
      "tests/e2e/studio-hydration.e2e.ts",
      "tests/e2e/studio-publish-real.e2e.ts",
      "tests/e2e/studio-replan-scripture.e2e.ts",
      "tests/e2e/studio-translation-widen.e2e.ts",
      // ── the heavy render spec (lane 3: vitest.e2e.render.config.ts) ──
      "tests/e2e/studio-render-real.e2e.ts",
    ],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    globalSetup: ["./tests/e2e/global-setup.ts"],
    setupFiles: ["./tests/e2e/load-env.ts"],
  },
});
