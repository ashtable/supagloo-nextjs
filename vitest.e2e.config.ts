import { defineConfig } from "vitest/config";

// E2E config: drives a real local browser via Stagehand v3 (env: "LOCAL")
// against `next dev` on :3000. Long timeouts (cold compile + LLM calls), one
// browser at a time, a global setup that boots/reuses the dev server, and a
// setup file that loads .env.local into the worker (for Gloo creds).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    globalSetup: ["./tests/e2e/global-setup.ts"],
    setupFiles: ["./tests/e2e/load-env.ts"],
  },
});
