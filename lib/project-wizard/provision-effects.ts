/**
 * The REAL-mode wizard effect layer (Task #26 §5.3 rows 4 + §2.3/§6b). Everything the
 * New-project / Import wizards do against the real stack, kept pure + injectable
 * (`fetch` / `storage` / `sleep` / `now`) so the whole surface is unit-tested with
 * zero network and no React.
 *
 * Two shapes of work:
 *  1. create/import → a real BFF endpoint → `{ projectId, jobId }`, then POLL the job
 *     `stages` (replacing the fake ticker as the provisioning-log data source).
 *  2. the create-new-repo JIT hop's CROSS-TAB handoff: the wizard stashes its form
 *     params under a `state` nonce + opens the authorize popup; the popup callback
 *     page reads the params, POSTs `create-repo`, and writes the `{ projectId, jobId }`
 *     result back under the same nonce; the main tab polls that result key. This
 *     mirrors the OpenRouter verifier stash — a full-page redirect would reset the
 *     wizard's step state.
 */
import {
  CreateProjectResponseSchema,
  ProjectJobResponseSchema,
  type ProjectJobDto,
  type RepoVisibility,
  type ProjectCreatedFrom,
} from "../api/contracts";

export interface JobRef {
  projectId: string;
  jobId: string;
}

interface FetchDep {
  fetchImpl?: typeof fetch;
}

const doFetchOf = (deps: FetchDep) => deps.fetchImpl ?? fetch;

async function postForJobRef(
  url: string,
  body: unknown,
  deps: FetchDep,
): Promise<JobRef | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const parsed = CreateProjectResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ── use-existing-empty + import: repo already exists, no JIT ──────────────────

export interface ScaffoldExistingInput {
  repoOwner: string;
  repoName: string;
  projectName: string;
  visibility?: RepoVisibility;
}

/** `POST /api/projects` for the "use existing empty repo" tab (the repo exists, so
 *  no JIT hop). Always `createdFrom: "blank"` in v1. */
export function scaffoldExistingRepo(
  input: ScaffoldExistingInput,
  deps: FetchDep = {},
): Promise<JobRef | null> {
  return postForJobRef(
    "/api/projects",
    {
      repoOwner: input.repoOwner,
      repoName: input.repoName,
      visibility: input.visibility ?? "private",
      createdFrom: "blank" satisfies ProjectCreatedFrom,
      name: input.projectName,
    },
    deps,
  );
}

export interface ImportInput {
  repoOwner: string;
  repoName: string;
  projectName: string;
  visibility?: RepoVisibility;
}

/** `POST /api/projects/import` for the Import wizard (12b). No `createdFrom` — the
 *  API fixes it to `import` and reads the manifest from the repo. */
export function importRepo(
  input: ImportInput,
  deps: FetchDep = {},
): Promise<JobRef | null> {
  return postForJobRef(
    "/api/projects/import",
    {
      repoOwner: input.repoOwner,
      repoName: input.repoName,
      visibility: input.visibility ?? "private",
      name: input.projectName,
    },
    deps,
  );
}

// ── job polling (the provisioning-log data source) ───────────────────────────

/** One `GET /api/projects/:id/jobs/:jobId` read; unwraps the `{ job }` envelope.
 *  Null on any failure. */
export async function fetchJob(
  projectId: string,
  jobId: string,
  deps: FetchDep = {},
): Promise<ProjectJobDto | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/projects/${projectId}/jobs/${jobId}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const parsed = ProjectJobResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.job : null;
  } catch {
    return null;
  }
}

export interface PollJobDeps extends FetchDep {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  timeoutMs?: number;
  /** Called with every successfully-read job (drives the live provisioning log). */
  onUpdate?: (job: ProjectJobDto) => void;
}

const DEFAULT_JOB_POLL_INTERVAL_MS = 700;
const DEFAULT_JOB_POLL_TIMEOUT_MS = 120_000;

const jobTerminal = (job: ProjectJobDto) =>
  job.status === "succeeded" || job.status === "failed" || job.status === "canceled";

/** Poll a job until it reaches a terminal status (or the deadline). Calls
 *  `onUpdate` on every read so the caller can render the live stage log. Returns the
 *  terminal job, or null on timeout. */
export async function pollJobUntilTerminal(
  projectId: string,
  jobId: string,
  deps: PollJobDeps = {},
): Promise<ProjectJobDto | null> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const interval = deps.intervalMs ?? DEFAULT_JOB_POLL_INTERVAL_MS;
  const timeout = deps.timeoutMs ?? DEFAULT_JOB_POLL_TIMEOUT_MS;
  const deadline = now() + timeout;

  for (;;) {
    const job = await fetchJob(projectId, jobId, deps);
    if (job) {
      deps.onUpdate?.(job);
      if (jobTerminal(job)) return job;
    }
    if (now() >= deadline) return job && jobTerminal(job) ? job : null;
    await sleep(interval);
  }
}

// ── create-new-repo JIT cross-tab handoff ────────────────────────────────────

export interface CreateRepoParams {
  repoName: string;
  projectName: string;
  visibility: RepoVisibility;
  createdFrom: ProjectCreatedFrom;
}

export interface CreateRepoResult extends JobRef {
  slug: string;
}

const paramsKey = (state: string) => `sg_createrepo_params_${state}`;
const resultKey = (state: string) => `sg_createrepo_result_${state}`;

export function stashCreateRepoParams(
  state: string,
  params: CreateRepoParams,
  storage: Storage,
): void {
  storage.setItem(paramsKey(state), JSON.stringify(params));
}

export function readCreateRepoParams(
  state: string,
  storage: Storage,
): CreateRepoParams | null {
  const raw = storage.getItem(paramsKey(state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CreateRepoParams;
  } catch {
    return null;
  }
}

export function writeCreateRepoResult(
  state: string,
  result: CreateRepoResult,
  storage: Storage,
): void {
  storage.setItem(resultKey(state), JSON.stringify(result));
}

export function readCreateRepoResult(
  state: string,
  storage: Storage,
): CreateRepoResult | null {
  const raw = storage.getItem(resultKey(state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CreateRepoResult;
  } catch {
    return null;
  }
}

export function clearCreateRepo(state: string, storage: Storage): void {
  storage.removeItem(paramsKey(state));
  storage.removeItem(resultKey(state));
}

/**
 * Run in the POPUP CALLBACK tab after GitHub redirects back with a `code`. Reads the
 * stashed params, `POST /api/projects/create-repo`, and writes the resulting
 * `{ projectId, jobId, slug }` back under the same `state` nonce so the main tab's
 * poll picks it up. Returns the result, or null on any failure.
 */
export async function completeCreateRepo(
  state: string,
  code: string,
  deps: FetchDep & { storage: Storage },
): Promise<CreateRepoResult | null> {
  const params = readCreateRepoParams(state, deps.storage);
  if (!params) return null;
  const jobRef = await postForJobRef(
    "/api/projects/create-repo",
    {
      code,
      repoName: params.repoName,
      visibility: params.visibility,
      createdFrom: params.createdFrom,
      name: params.projectName,
    },
    deps,
  );
  if (!jobRef) return null;
  const result: CreateRepoResult = { ...jobRef, slug: params.repoName };
  writeCreateRepoResult(state, result, deps.storage);
  return result;
}

export interface PollResultDeps {
  storage: Storage;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  timeoutMs?: number;
}

const DEFAULT_RESULT_POLL_INTERVAL_MS = 500;
const DEFAULT_RESULT_POLL_TIMEOUT_MS = 180_000;

/** Poll (in the MAIN tab) the localStorage result key the callback tab writes.
 *  Returns the result once present, or null on timeout. */
export async function pollCreateRepoResult(
  state: string,
  deps: PollResultDeps,
): Promise<CreateRepoResult | null> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const interval = deps.intervalMs ?? DEFAULT_RESULT_POLL_INTERVAL_MS;
  const timeout = deps.timeoutMs ?? DEFAULT_RESULT_POLL_TIMEOUT_MS;
  const deadline = now() + timeout;

  for (;;) {
    const result = readCreateRepoResult(state, deps.storage);
    if (result) return result;
    if (now() >= deadline) return null;
    await sleep(interval);
  }
}
