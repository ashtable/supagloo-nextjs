import { defineConfig } from "vitest/config";

// Unit config: pure-logic tests only (no jsdom, no browser). Fast.
// E2E lives under tests/e2e/*.e2e.ts and runs via vitest.e2e.config.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".next", "tests/e2e/**"],
  },
});
