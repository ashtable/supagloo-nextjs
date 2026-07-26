import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * task-62 D24 — load the ROOT repo's `.env` into THIS Vitest worker.
 *
 * Vitest runs `globalSetup` in the main process and every test file in a WORKER,
 * so env vars set during globalSetup never reach a spec. The real-GitHub harness
 * needs `GITHUB_APP_ID` / `GITHUB_APP_SLUG` / `GITHUB_APP_PRIVATE_KEY` /
 * `GITHUB_E2E_PAT_TOKEN` (and optionally `SUPAGLOO_E2E_GITHUB_OWNER`) inside the
 * worker, and those live in the ROOT repo's untracked `.env` — the single
 * credential source for every lane in every repo. Hence this setupFile, modelled
 * on the sibling `load-env.ts` (which loads THIS repo's `.env.local`).
 *
 * Plan row 66 added `GITHUB_E2E_EXCHANGE_TOKEN` to that same root `.env`, but it is
 * NOT read here: it is consumed inside the **api container**, which receives it by
 * `${VAR}` substitution from the same file via `docker-compose.test.yml`. The
 * distinction matters — `GITHUB_E2E_PAT_TOKEN` is loaded into this worker and enters
 * no container; `GITHUB_E2E_EXCHANGE_TOKEN` enters exactly one container and is never
 * needed here. Do not "tidy" them into one variable or one path.
 *
 * Listed ONLY by `vitest.e2e.real.config.ts` and `vitest.e2e.render.config.ts`.
 * The mock lane (`vitest.e2e.config.ts`) deliberately omits it so that lane keeps
 * running with no root checkout, no root `.env` and no credentials at all —
 * asserted by `tests/unit/e2e-lane-coverage.test.ts`.
 *
 * `process.loadEnvFile` does NOT override an already-set variable, so an explicit
 * `GITHUB_APP_ID=… npm run test:e2e:render` still wins, and a value already
 * exported in the shell is untouched.
 *
 * Failures here are DELIBERATELY SILENT: the actionable, remediation-carrying
 * error belongs to the harness's own fail-fast (task-62 D5, see
 * `tests/e2e/github-e2e.ts`), which names the exact missing variable, the root
 * `.env` path and `.env.example`. Throwing from a setupFile instead would abort
 * every worker with a stack trace that says nothing about which credential is
 * missing. Never log the file's contents — it holds real GitHub secrets.
 */

/** Where the root supagloo checkout lives, as a sibling of this repo by default. */
export const ROOT_DIR =
  process.env.SUPAGLOO_ROOT_DIR ?? resolve(process.cwd(), "..", "supagloo");

export const ROOT_ENV_PATH = resolve(ROOT_DIR, ".env");

type LoadEnvFile = (path?: string) => void;
const loadEnvFile = (process as unknown as { loadEnvFile?: LoadEnvFile })
  .loadEnvFile;

if (typeof loadEnvFile === "function" && existsSync(ROOT_ENV_PATH)) {
  try {
    loadEnvFile(ROOT_ENV_PATH);
  } catch {
    // Unparseable/unreadable root .env — let the harness's D5 fail-fast name the
    // specific missing variable instead of failing here with no context.
  }
}
