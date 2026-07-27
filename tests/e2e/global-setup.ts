import { spawn } from "node:child_process";
import { resolve } from "node:path";

const BASE_URL = "http://localhost:3000";

/**
 * Load `.env.local` into THIS process's env before we spawn `next dev`, so the
 * spawned server inherits the app's server env — notably YV_APP_KEY, without
 * which `instrumentation.ts` refuses to boot: it logs one redacted line and
 * exits 1, so `next dev` dies rather than serving anything (R4344-1).
 * globalSetup runs in Vitest's main process,
 * which does NOT execute the worker's `load-env.ts` setupFile, so we must load
 * the env here too. Node >= 20.12 ships `process.loadEnvFile`.
 */
function loadEnvLocal(): void {
  const load = (process as unknown as { loadEnvFile?: (path?: string) => void })
    .loadEnvFile;
  if (typeof load !== "function") return;
  try {
    load(resolve(process.cwd(), ".env.local"));
  } catch {
    // No .env.local — let Next/app surface any missing-var errors themselves.
  }
}

/**
 * True only if the dev server answers `GET /` with a healthy 2xx. `response.ok`
 * (not "the port is listening") gates reuse because a server can be bound and
 * still be useless: any render-time throw in the tree serves a 500 `/_error`
 * overlay, and reusing that would produce wrong-reason failures everywhere. The
 * specific keyless case now exits instead (see `loadEnvLocal` above), but the
 * 2xx gate is the general guard and stays.
 */
async function serverIsUp(): Promise<boolean> {
  try {
    const response = await fetch(BASE_URL, {
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Vitest global setup for the E2E suite: reuse an already-running dev server on
 * :3000, otherwise spawn `next dev`, poll until it answers (<=60s), and return a
 * teardown that kills the whole process tree.
 */
export default async function setup() {
  if (await serverIsUp()) {
    // Reuse an already-running dev server; nothing for us to tear down.
    return;
  }

  loadEnvLocal(); // ensure the spawned `next dev` has YV_APP_KEY / GLOO_* etc.

  // Own process group (detached) so we can SIGTERM the entire `next dev` tree.
  const child = spawn("npm", ["run", "dev"], {
    stdio: "inherit",
    detached: true,
    env: process.env,
  });

  const killTree = () => {
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  };

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await serverIsUp()) {
      return async () => killTree();
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  killTree();
  throw new Error("`next dev` did not become ready on :3000 within 60s");
}
