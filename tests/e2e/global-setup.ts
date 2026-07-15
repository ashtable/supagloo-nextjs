import { spawn } from "node:child_process";
import { resolve } from "node:path";

const BASE_URL = "http://localhost:3000";

/**
 * Load `.env.local` into THIS process's env before we spawn `next dev`, so the
 * spawned server inherits the app's server env — notably YV_APP_KEY, which
 * `app/layout.tsx` requires at module scope (it throws otherwise, and the app
 * renders a 500 `/_error` page). globalSetup runs in Vitest's main process,
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
 * True only if the dev server answers `GET /` with a healthy 2xx. A crashing or
 * keyless server (e.g. `app/layout.tsx`'s YV_APP_KEY guard throwing) serves a
 * 500 `/_error` overlay — that must NOT count as "up", or we would reuse a
 * broken server and produce wrong-reason failures. `response.ok` gates reuse.
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
