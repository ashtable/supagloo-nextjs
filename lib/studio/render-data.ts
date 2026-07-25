/**
 * Task #38 — the studio RENDER data layer (design-delta §5.3 row 8 / §6c). Mirrors
 * `ai-generation-data.ts`: injectable `fetch`/`sleep`/`now`, Zod-parse via the wire
 * `*ResponseSchema`, and NEVER throw — every failure is a `null`/`false` the caller maps
 * to an honest UI state. Fully unit-tested with zero network.
 *
 * Flow (design-delta §6c, sequence (c)): the studio posts a render
 * (`POST /api/projects/:id/renders { versionId, outputSpec, runInBackground }`), polls
 * `GET /api/renders/:id` to a terminal status — that poll is what drives the 14c overlay
 * — and, on completion, asks `GET /api/renders/:id/download` for a presigned URL.
 * `POST /api/renders/:id/cancel` aborts.
 */
import {
  CreateRenderResponseSchema,
  FilePresignDownloadResponseSchema,
  RenderJobResponseSchema,
  type RenderJobDto,
  type RenderOutputSpec,
} from "../api/contracts";

interface FetchDep {
  fetchImpl?: typeof fetch;
}
const doFetchOf = (deps: FetchDep) => deps.fetchImpl ?? fetch;

/** The client-side create body. Unlike a generation, nothing is injected server-side —
 *  the studio owns the version and the output spec. */
export interface StartRenderBody {
  versionId: string;
  outputSpec: RenderOutputSpec;
  runInBackground: boolean;
}

/** `POST /api/projects/:id/renders` → the new render job id. Null on any non-2xx (404
 *  unknown project/version, 400 malformed spec) or failure. */
export async function startRenderJob(
  projectId: string,
  body: StartRenderBody,
  deps: FetchDep = {},
): Promise<string | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/projects/${projectId}/renders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const parsed = CreateRenderResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.renderJobId : null;
  } catch {
    return null;
  }
}

/** `GET /api/renders/:id` → the `RenderJobDto` (unwraps `{ render }`). Null on any
 *  non-2xx / parse failure / throw. */
export async function fetchRender(
  id: string,
  deps: FetchDep = {},
): Promise<RenderJobDto | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/renders/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = RenderJobResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.render : null;
  } catch {
    return null;
  }
}

/** `POST /api/renders/:id/cancel` → true if the server accepted the cancel. False on a
 *  409 (already terminal), a 404, or any failure — the overlay closes optimistically
 *  either way, so this is a signal, not a gate. */
export async function cancelRenderJob(
  id: string,
  deps: FetchDep = {},
): Promise<boolean> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/renders/${id}/cancel`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

/** `GET /api/renders/:id/download` → a short-lived presigned GET url for the finished
 *  mp4. Null while the output is not available (404) or on any failure. */
export async function fetchRenderDownloadUrl(
  id: string,
  deps: FetchDep = {},
): Promise<string | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/renders/${id}/download`, { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = FilePresignDownloadResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.url : null;
  } catch {
    return null;
  }
}

export interface PollRenderDeps extends FetchDep {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  timeoutMs?: number;
  /** Called with every successfully-read render — this is what drives the 14c overlay. */
  onUpdate?: (render: RenderJobDto) => void;
}

const DEFAULT_RENDER_POLL_INTERVAL_MS = 1500;
/** 30 minutes. A real Remotion render (clone + npm ci + bundle + encode + upload) is
 *  minutes, an order of magnitude past the 5-minute generation timeout. */
const DEFAULT_RENDER_POLL_TIMEOUT_MS = 1_800_000;

const renderTerminal = (r: RenderJobDto) =>
  r.status === "completed" || r.status === "failed" || r.status === "canceled";

/** Poll a render until it reaches a terminal status (or the deadline). Calls `onUpdate`
 *  on every read so the overlay tracks real frames. Returns the terminal render, or null
 *  on timeout. Mirrors `pollGenerationUntilTerminal` on the RenderJob lifecycle. */
export async function pollRenderUntilTerminal(
  id: string,
  deps: PollRenderDeps = {},
): Promise<RenderJobDto | null> {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const interval = deps.intervalMs ?? DEFAULT_RENDER_POLL_INTERVAL_MS;
  const timeout = deps.timeoutMs ?? DEFAULT_RENDER_POLL_TIMEOUT_MS;
  const deadline = now() + timeout;

  for (;;) {
    const render = await fetchRender(id, deps);
    if (render) {
      deps.onUpdate?.(render);
      if (renderTerminal(render)) return render;
    }
    if (now() >= deadline) return render && renderTerminal(render) ? render : null;
    await sleep(interval);
  }
}
