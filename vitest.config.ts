import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit config. The DEFAULT environment is still `node` — the overwhelming majority of
 * this lane is pure-logic tests over `lib/**`, and a DOM would only slow them down.
 *
 * A `.test.tsx` file opts INTO jsdom with a `// @vitest-environment jsdom` docblock.
 * That capability exists because row 41's review found two classes of defect that live
 * inside a client component's async control flow and that no pure-logic test can reach:
 * a stale-run early return that skipped an in-flight flag reset, and a dialog whose
 * `useState` initializers only run once per page load. Both are about WHEN a response
 * lands relative to another interaction, which is only observable by driving the real
 * component. `tests/unit/support/render.tsx` is the (dependency-free) renderer.
 *
 * E2E lives under tests/e2e/*.e2e.ts and runs via the three e2e configs.
 */
export default defineConfig({
  // `@/…` is the app's own path alias (tsconfig `paths`). Vite does not read tsconfig
  // paths, so a component test importing a component that imports `@/lib/…` needs this.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
    ],
    exclude: ["node_modules", "dist", ".next", "tests/e2e/**"],
  },
});
