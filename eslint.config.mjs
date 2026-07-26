import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored sibling checkouts. `supagloo-database-lib` is a git SUBMODULE with its
    // own lint config, its own committed `dist/`, and a hard rule that it is never
    // edited from this repo — so linting it here can only ever produce failures nobody
    // in this repo is allowed to fix (229 errors before this line existed).
    // `tsconfig.json` already excludes it for exactly the same reason; this keeps the
    // two tools' views of "what is ours" identical.
    "supagloo-database-lib/**",
    "supagloo-prompts/**",
  ]),
]);

export default eslintConfig;
