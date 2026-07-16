import { resolve } from "node:path";

/**
 * Load `.env.local` into THIS Vitest worker so `glooLlmClient()` can read
 * GLOO_CLIENT_ID / GLOO_CLIENT_SECRET / GLOO_STAGEHAND_MODEL. Next.js loads
 * .env.local for the dev server on its own, but Vitest workers do not — hence
 * this setupFile.
 *
 * Node >= 20.12 ships `process.loadEnvFile`; this repo runs Node 24. If ever run
 * on an older Node, add the `dotenv` devDependency and load the file via
 * `config({ path })` instead.
 */
const envPath = resolve(process.cwd(), ".env.local");

type LoadEnvFile = (path?: string) => void;
const loadEnvFile = (process as unknown as { loadEnvFile?: LoadEnvFile })
  .loadEnvFile;

if (typeof loadEnvFile === "function") {
  loadEnvFile(envPath);
} else {
  throw new Error(
    `process.loadEnvFile is unavailable on Node ${process.version}. ` +
      `Add the "dotenv" devDependency and load ${envPath} instead.`,
  );
}
