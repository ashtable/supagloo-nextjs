import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// Side-effect import: loads the ROOT repo's `.env` into THIS (main) process, so the
// GitHub fail-fast below can see the credentials. Vitest workers get the same file
// via `setupFiles` (task-62 D24) — globalSetup and the workers are separate
// processes, so both loads are needed.
import { ROOT_DIR } from "./load-root-env";
import devServerSetup from "./global-setup";
import { resolveGithubE2eContext } from "./github-e2e";

/**
 * task-62 D23 — the globalSetup for the REAL and HEAVY-RENDER e2e lanes.
 *
 * Before this existed, nothing anywhere started a DBOS worker: the nextjs
 * globalSetup only reused-or-spawned `next dev`, root's `INFRA_SERVICES` omitted
 * `dbos`, and the dbos repo's own harness brings up infra but never the `dbos`
 * service itself. That gap — not a stub bug — is why plan row 62's render spec
 * had never executed. `studio-render-real.e2e.ts` needs BOTH of the worker's
 * queues live: `git-ops` (scaffold, then publish) and `render`.
 *
 * ONE worker process serves all three queues (the dbos registry is static), so a
 * single `dbos` container covers everything.
 *
 * This is the third instance of the established reuse-or-spawn Compose pattern
 * (root's `tests/e2e/global-setup.ts`, the api's and the dbos repo's). It brings
 * the stack up from the ROOT repo, gates it in four ordered steps — each throwing
 * with the exact remediation command — and then delegates to the existing
 * `./global-setup.ts` for the `next dev` half.
 *
 * Deliberately does NOT tear the Compose stack down. Bringing it up costs minutes
 * (image builds + a Remotion-capable worker), the lanes are meant to be re-run
 * back to back, and the sibling harnesses in root/api/dbos leave it up too. Only
 * a `next dev` that THIS setup spawned is killed.
 *
 * Requires no new dependency: every check is a `docker`/`fetch` call, because the
 * nextjs repo deliberately has no `pg` or `@aws-sdk/client-s3` dependency.
 */

// ── the string the dbos worker prints when it is genuinely ready ─────────────

/**
 * Pinned copy of the dbos repo's `WORKER_READY_LOG` constant
 * (`src/dbos/worker-log.ts`, logged by `src/main.ts`). It is a CONSTANT over
 * there, pinned by a dbos unit test, precisely so a future reword fails loudly in
 * dbos rather than silently turning this gate into a no-op. If the gate below
 * reports drift, update this string — do not loosen the match.
 */
const WORKER_READY_LOG =
  "[supagloo-dbos] worker launched — static queues registered, polling for work";

/** A looser marker used ONLY to distinguish "the worker booted but its ready line
 *  was reworded" from "the worker never booted". Never used to pass the gate. */
const WORKER_READY_LOOSE = /\[supagloo-dbos\][^\n]*worker launched/i;

const WORKER_FAILED_MARKER = /failed to launch/i;

// ── stack coordinates ───────────────────────────────────────────────────────

const SERVICES = ["postgres", "minio", "minio-init", "migrate", "api", "dbos"];
const MINIO_HEALTH_URL = "http://localhost:9000/minio/health/live";
const API_HEALTH_URL = "http://localhost:4000/healthz";
const PG_USER = "supagloo";
const PG_DATABASES = ["supagloo", "supagloo_dbos"];

/**
 * Base compose + the gitignored standalone-build bridge (when present) + the
 * TEST-ENABLEMENT overlay.
 *
 * The overlay is not optional: it is what sets `NODE_ENV: development` and
 * `SUPAGLOO_ENABLE_TEST_SEED: "1"` on the api, without which the `?seed=` seam
 * every real-stack spec mounts on is a hard 404. It no longer overrides any
 * GitHub variable — the api inherits the REAL App credentials from the root
 * `.env` through base compose's `${VAR}` substitution, which is the whole of
 * half (A) at the Compose level.
 *
 * Passing explicit `-f` disables Docker's auto-merge of
 * `docker-compose.override.yml`, so it is re-added explicitly. That override is
 * what redirects the api/dbos build contexts at the sibling working checkouts
 * instead of the submodule pointers — i.e. it is what makes the containers carry
 * IN-FLIGHT api/dbos code. Without it you are testing the last released pins.
 */
function composeFiles(): string[] {
  const files = ["docker-compose.yml"];
  if (existsSync(`${ROOT_DIR}/docker-compose.override.yml`)) {
    files.push("docker-compose.override.yml");
  }
  files.push("docker-compose.test.yml");
  return files;
}

function composeArgs(args: string[]): string[] {
  return ["compose", ...composeFiles().flatMap((f) => ["-f", f]), ...args];
}

/** Human-readable form of the compose invocation, for error remediation text. */
function composeCommand(tail: string): string {
  return `(cd ${ROOT_DIR} && docker ${composeArgs([tail]).join(" ")})`;
}

function compose(args: string[], opts: { capture?: boolean } = {}): string {
  const out = execFileSync("docker", composeArgs(args), {
    cwd: ROOT_DIR,
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out ?? "";
}

function composeQuiet(args: string[]): string {
  try {
    return compose(args, { capture: true }).trim();
  } catch {
    return "";
  }
}

async function httpOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

function pgReachable(database: string): boolean {
  try {
    compose(
      ["exec", "-T", "postgres", "psql", "-U", PG_USER, "-d", database, "-c", "select 1"],
      { capture: true },
    );
    return true;
  } catch {
    return false;
  }
}

async function waitFor(
  label: string,
  probe: () => boolean | Promise<boolean>,
  timeoutMs: number,
  remediation: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `[global-setup.render] ${label} did not become ready within ${timeoutMs}ms.\n  ${remediation}`,
  );
}

// ── gate 2: the worker container is running AND not crash-looping ────────────

interface ContainerState {
  running: boolean;
  restartCount: number;
}

/**
 * Read the worker container's state through `docker inspect` rather than
 * `docker compose ps --format json`: the latter's field names shift between
 * Compose releases (and it does not expose a restart count at all), while
 * `.State.Running` / `.RestartCount` are stable Docker Engine fields.
 */
function dbosContainerState(): ContainerState | null {
  const id = composeQuiet(["ps", "-q", "dbos"]).split("\n")[0]?.trim();
  if (!id) return null;
  let raw: string;
  try {
    raw = execFileSync(
      "docker",
      ["inspect", "--format", "{{.State.Running}} {{.RestartCount}}", id],
      { cwd: ROOT_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch {
    return null;
  }
  const [running, restarts] = raw.split(/\s+/);
  return { running: running === "true", restartCount: Number(restarts ?? "0") };
}

function dbosLogTail(lines = 400): string {
  return composeQuiet(["logs", "--no-color", `--tail=${lines}`, "dbos"]);
}

/**
 * The gate that actually catches the real failure mode: a worker that boots,
 * throws on a bad `GITHUB_APP_PRIVATE_KEY` (or a missing `SECRETS_ENCRYPTION_KEY`),
 * and is restarted by Docker in a loop. Such a container reports `running` at any
 * given instant, so a single sample passes — hence two samples 3 s apart and a
 * requirement that the restart count be STABLE.
 */
async function gateDbosWorker(): Promise<void> {
  await waitFor(
    "the dbos worker container",
    () => dbosContainerState()?.running === true,
    120_000,
    `Bring it up with ${composeCommand("up -d --build dbos")} and inspect ${composeCommand("logs --tail=200 dbos")}`,
  );

  const first = dbosContainerState();
  await new Promise((r) => setTimeout(r, 3000));
  const second = dbosContainerState();

  if (!first || !second || !second.running) {
    throw new Error(
      `[global-setup.render] the dbos worker container is not running.\n` +
        `  Log tail:\n${dbosLogTail(80)}\n` +
        `  Full logs: ${composeCommand("logs dbos")}`,
    );
  }
  if (second.restartCount !== first.restartCount) {
    throw new Error(
      `[global-setup.render] the dbos worker is CRASH-LOOPING ` +
        `(restart count ${first.restartCount} → ${second.restartCount} in 3s). It boots and ` +
        `dies, so it will never consume the git-ops or render queues. The usual causes are ` +
        `a malformed GITHUB_APP_PRIVATE_KEY in the root .env (the single-line escaped-\\n ` +
        `form is expected) or a missing SECRETS_ENCRYPTION_KEY.\n` +
        `  Log tail:\n${dbosLogTail(80)}`,
    );
  }

  const logs = dbosLogTail();
  if (WORKER_FAILED_MARKER.test(logs)) {
    throw new Error(
      `[global-setup.render] the dbos worker logged a launch failure.\n` +
        `  Log tail:\n${dbosLogTail(80)}`,
    );
  }
  if (!logs.includes(WORKER_READY_LOG)) {
    if (WORKER_READY_LOOSE.test(logs)) {
      throw new Error(
        `[global-setup.render] the dbos worker booted, but its ready line no longer matches ` +
          `the string this gate pins:\n  expected: ${JSON.stringify(WORKER_READY_LOG)}\n` +
          `  The dbos repo's WORKER_READY_LOG constant (src/dbos/worker-log.ts) has been ` +
          `reworded. Update WORKER_READY_LOG in tests/e2e/global-setup.render.ts to match ` +
          `it exactly — do NOT loosen the match, or this gate stops catching a dead worker.`,
      );
    }
    throw new Error(
      `[global-setup.render] the dbos worker never logged that it launched ` +
        `(${JSON.stringify(WORKER_READY_LOG)}). It is running but has not registered its ` +
        `queues, so no scaffold or render job will ever be picked up.\n` +
        `  Log tail:\n${dbosLogTail(80)}`,
    );
  }
}

// ── the setup itself ────────────────────────────────────────────────────────

export default async function setup(): Promise<(() => Promise<void>) | void> {
  if (!existsSync(`${ROOT_DIR}/docker-compose.yml`)) {
    throw new Error(
      `[global-setup.render] the root supagloo checkout was not found at ${ROOT_DIR}.\n` +
        `  The real + render e2e lanes drive the CONTAINERISED api and DBOS worker, which are\n` +
        `  defined by the root repo's Compose files. Check the repo out as a sibling of this\n` +
        `  one, or set SUPAGLOO_ROOT_DIR=/path/to/supagloo.`,
    );
  }
  if (!existsSync(`${ROOT_DIR}/docker-compose.override.yml`)) {
    // Not fatal: a CI checkout builds from the submodule pointers on purpose.
    console.log(
      `[global-setup.render] note: ${ROOT_DIR}/docker-compose.override.yml is absent, so the ` +
        `api + dbos containers build from the SUBMODULE pointers, not the sibling working ` +
        `checkouts. In-flight api/dbos changes will not be present.`,
    );
  }

  // ── gate 4a, run FIRST because it is instant and the commonest failure ──
  // Discover the installation + resolve the credentials before spending minutes on
  // image builds. Every failure here throws with its own remediation (task-62 D5):
  // a missing variable names itself and the root `.env`; zero installations names
  // the App's install URL. Never a warn-and-skip — a skipped file's console output
  // is collapsed by vitest's default reporter, which is how a green lie happens.
  const ctx = await resolveGithubE2eContext();
  console.log(
    `[global-setup.render] GitHub ready: installation ${ctx.installationId} on ` +
      `@${ctx.owner}, run id ${ctx.runId}. (No secret is printed.)`,
  );

  compose(["up", "-d", "--build", ...SERVICES]);

  // ── gate 1: infrastructure ──
  for (const database of PG_DATABASES) {
    await waitFor(
      `Postgres database "${database}"`,
      () => pgReachable(database),
      120_000,
      `Check ${composeCommand("logs postgres")} and ${composeCommand("logs migrate")}`,
    );
  }
  await waitFor(
    "MinIO",
    () => httpOk(MINIO_HEALTH_URL),
    90_000,
    `Check ${composeCommand("logs minio")}. The render worker uploads output.mp4 + thumb.jpg to the supagloo-dev bucket, so ${composeCommand("logs minio-init")} must have completed.`,
  );
  await waitFor(
    "the api",
    () => httpOk(API_HEALTH_URL),
    120_000,
    `Check ${composeCommand("logs api")}. A boot-time fail-fast on GITHUB_APP_* or SECRETS_ENCRYPTION_KEY is the usual cause.`,
  );

  // ── gates 2 + 3: the DBOS worker ──
  await gateDbosWorker();

  // ── finally the dev server (reuse-or-spawn), whose teardown we return ──
  return devServerSetup();
}
