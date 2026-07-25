/**
 * The pure 14c render model (no React/DOM). It serves TWO data sources behind one
 * `RenderState`, discriminated by `mode`:
 *
 *   - `"mock"` — demo-catalog projects (`NEXT_PUBLIC_SUPAGLOO_DEMO=1`). A caller-owned
 *     timer ticks `advanceRender`; frames climb toward the composition's total and the
 *     4-stage checklist follows. Unchanged from Turn 14.
 *   - `"real"` (Task #38) — a server `RenderJob` polled from `GET /api/renders/:id`.
 *     Frames, status, output spec and errors all come off the wire; nothing is derived
 *     from the local composition (design-delta §2 v1-limitation #2 forbids asserting
 *     preview/render parity, so the overlay must never claim the server's frame total).
 *
 * All view copy is derived here so the overlay stays presentational.
 */
import { aspectDimensions, type Aspect } from "./aspect";
import {
  initLog,
  isLogComplete,
  type LogSequence,
} from "../project-wizard/provisioning-log";
import type { LogRow } from "../project-wizard/job-log";
import type { RenderJobDto, RenderStatus } from "../api/contracts";

/** The five output-spec fields the server echoes back on every poll. Structurally
 *  identical to the wire `RenderOutputSpec`; typed locally so this module stays a pure
 *  model with no contract import cycle at the value level. */
export interface RenderOutputSpecLike {
  width: number;
  height: number;
  fps: number;
  aspectRatio: string;
  codec: string;
}

export interface RenderState {
  /** Which data source drives this render: the mocked ticker or a polled server job. */
  mode: "mock" | "real";
  /** the published tag being rendered (14b LIVE / 14c eyebrow). */
  publishedVersion: string;
  /** composition length in frames. MOCK: derived from the storyboard. REAL: the
   *  server's `framesTotal`, which is 0 until the worker's `bundleComposition` resolves
   *  the composition — 0 means INDETERMINATE, never "done". */
  totalFrames: number;
  /** frames encoded so far. */
  framesDone: number;
  /** MOCK only: the 4-stage checklist driven off `framesDone`. REAL renders build their
   *  rows from `status` via {@link renderStageRows}. */
  stages: LogSequence;
  /** true once "Run in background" hides the overlay (the render keeps going). */
  backgrounded: boolean;

  // ── REAL-mode fields (all null/false in mock mode) ─────────────────────────
  /** the server `RenderJob.id` (= the DBOS workflow id); null until the POST returns. */
  renderJobId: string | null;
  /** the polled server status; null until the first successful poll. */
  status: RenderStatus | null;
  /** the server's ECHOED output spec — the spec line renders from this, not from the
   *  local aspect toggle. */
  outputSpec: RenderOutputSpecLike | null;
  /** `RenderJob.startedAt !== null` — the worker has picked the job up. Task 36 sets
   *  `startedAt` WITHOUT leaving `queued`, so this is the only way to tell "waiting for
   *  a worker" from "preparing your project". */
  started: boolean;
  /** terminal error message, or null. */
  error: string | null;
  /** the presigned download URL, once the render completed and it has been fetched. */
  downloadUrl: string | null;
  /** wall-clock ms at the FIRST `encoding` poll — the ETA clock's origin. Kept in state
   *  (stamped from an action payload) so the model stays pure. */
  encodingSinceMs: number | null;
  /** the last NON-terminal status seen. A failed/canceled render loses the phase it died
   *  in (`status` becomes `failed`), so the failure card would have no way to mark WHICH
   *  stage broke without remembering it. */
  lastPhase: RenderStatus | null;
}

/**
 * The 4 render stages, in RUNTIME order.
 *
 * D7: wireframe 14c lists "Bundled composition" first, but Remotion snapshots `public/`
 * assets at BUNDLE time, so the shipped worker — and design-delta §6c, and dbos's
 * `render.order.test.ts` — synthesizes audio FIRST. The checklist follows the
 * implementation: a checklist that reports a false order is worse than a two-row
 * deviation from a wireframe. The designed copy is preserved verbatim.
 */
export const RENDER_STAGE_ROWS: readonly string[] = [
  "Synthesized narration & music",
  "Bundled composition",
  "Encoding video",
  "Upload & finalize share link",
];

/** Frames encoded per tick + the tick interval (ms) — MOCK path only. Frequent, small
 *  steps so progress visibly climbs while the total render (≈13.5s for the 900-frame
 *  demo) stays comfortably LONGER than the E2E's ~10s "progress increases" poll window.
 *  The E2E polls for increasing progress; it never sleeps a fixed time. */
export const RENDER_FRAMES_PER_TICK = 10;
export const RENDER_TICK_MS = 150;

/** The real-mode fields, all inert. Spread into both constructors so the shape is
 *  identical whichever source drives it. */
const REAL_FIELDS = {
  renderJobId: null,
  status: null,
  outputSpec: null,
  started: false,
  error: null,
  downloadUrl: null,
  encodingSinceMs: null,
  lastPhase: null,
} as const;

/** MOCK: seed a render whose frames climb on a timer toward the composition total. */
export function initRender(
  totalFrames: number,
  publishedVersion: string,
): RenderState {
  return {
    mode: "mock",
    publishedVersion,
    totalFrames,
    framesDone: 0,
    stages: initLog(RENDER_STAGE_ROWS),
    backgrounded: false,
    ...REAL_FIELDS,
  };
}

/** REAL: seed a render with nothing known yet — the POST has not returned, so there is
 *  no job id, no status, and (per D1) no frame total to promise. */
export function initRealRender(publishedVersion: string): RenderState {
  return {
    mode: "real",
    publishedVersion,
    totalFrames: 0,
    framesDone: 0,
    stages: initLog(RENDER_STAGE_ROWS),
    backgrounded: false,
    ...REAL_FIELDS,
  };
}

/** The stage cursor implied by the current frame progress: floor(fraction · N)
 *  during the render, N (all complete) once every frame is encoded — monotonic
 *  because `framesDone` only climbs. MOCK path only. */
function stageTargetIndex(framesDone: number, totalFrames: number): number {
  if (framesDone >= totalFrames) return RENDER_STAGE_ROWS.length;
  const fraction = totalFrames > 0 ? framesDone / totalFrames : 1;
  return Math.min(
    RENDER_STAGE_ROWS.length - 1,
    Math.floor(fraction * RENDER_STAGE_ROWS.length),
  );
}

/** MOCK: advance one tick — climb `framesDone` (clamped at the total) and pull the
 *  stage cursor forward to match (never rewinds). Pure — returns a new state. */
export function advanceRender(r: RenderState): RenderState {
  const framesDone = Math.min(r.totalFrames, r.framesDone + RENDER_FRAMES_PER_TICK);
  const target = stageTargetIndex(framesDone, r.totalFrames);
  return {
    ...r,
    framesDone,
    stages: {
      rows: r.stages.rows,
      activeIndex: Math.max(r.stages.activeIndex, target),
    },
  };
}

/**
 * REAL: fold a polled `RenderJobDto` into the state. `atMs` is the caller's wall clock
 * (passed in, so this stays pure) and stamps `encodingSinceMs` on the FIRST `encoding`
 * sighting only — later polls must not reset the ETA clock or the estimate would jitter.
 */
export function applyRenderJob(
  r: RenderState,
  job: RenderJobDto,
  atMs: number,
): RenderState {
  const enteringEncode = job.status === "encoding" && r.encodingSinceMs === null;
  const terminal =
    job.status === "completed" || job.status === "failed" || job.status === "canceled";
  return {
    ...r,
    mode: "real",
    renderJobId: job.id,
    status: job.status,
    framesDone: job.framesDone,
    totalFrames: job.framesTotal,
    outputSpec: job.outputSpec,
    started: job.startedAt !== null,
    error: job.error,
    encodingSinceMs: enteringEncode ? atMs : r.encodingSinceMs,
    lastPhase: terminal ? r.lastPhase : job.status,
    // A COMPLETED render un-backgrounds itself. "Run in background" is a request not to
    // be blocked WHILE rendering; the completion is the payoff, and it carries the only
    // download affordance that exists (the "Your videos" listing is task 41). The 14c
    // footer promises "we'll notify you when it's ready" and no notification surface is
    // designed — surfacing the completion card IS that notification.
    backgrounded: job.status === "completed" ? false : r.backgrounded,
  };
}

/** Integer percent complete. An UNKNOWN total (0) is 0%, never 100% — a real render sits
 *  at `framesTotal: 0` from creation until `bundleComposition`, and an indeterminate bar
 *  must not read as a finished one. */
export function renderPercent(r: RenderState): number {
  if (r.totalFrames <= 0) return 0;
  return Math.min(100, Math.round((r.framesDone / r.totalFrames) * 100));
}

/** Whether the frame total is still unknown (real mode, pre-bundle) — the overlay shows
 *  an indeterminate bar and no ETA. */
export function isRenderIndeterminate(r: RenderState): boolean {
  return r.totalFrames <= 0;
}

/** The render finished successfully. REAL: the server said `completed`. MOCK: every
 *  frame encoded and every stage complete. */
export function isRenderComplete(r: RenderState): boolean {
  if (r.mode === "real") return r.status === "completed";
  return r.framesDone >= r.totalFrames && isLogComplete(r.stages);
}

/** Nothing more will change (REAL only — a mock render can only complete). */
export function isRenderTerminal(r: RenderState): boolean {
  if (r.mode !== "real") return isRenderComplete(r);
  return (
    r.status === "completed" || r.status === "failed" || r.status === "canceled"
  );
}

/** The render ended badly (drives the failure card). */
export function isRenderFailed(r: RenderState): boolean {
  return r.mode === "real" && (r.status === "failed" || r.status === "canceled");
}

// ── derived view copy ────────────────────────────────────────────────────────

/** Runtime phase order — the index of each status in the 4-row checklist. `queued` is
 *  before row 0; the terminal statuses carry no phase of their own. */
const STATUS_ROW_INDEX: Partial<Record<RenderStatus, number>> = {
  synthesizing: 0,
  bundling: 1,
  encoding: 2,
  uploading: 3,
};

/**
 * The 4-row checklist for a real render's `status`, as `StudioLog`-ready rows.
 *
 * Rows before the active phase are `completed`, the active phase is `active`, later rows
 * are `queued`. `completed` completes everything. A `failed`/`canceled` render marks the
 * phase it died in with `failed` (so the user can see WHERE it broke) and leaves the
 * later rows `queued` — `lastPhase` is the last non-terminal status observed, defaulting
 * to the first row when the render never got going.
 */
export function renderStageRows(
  status: RenderStatus,
  lastPhase?: RenderStatus,
): LogRow[] {
  const label = (i: number) => RENDER_STAGE_ROWS[i]!;

  if (status === "completed") {
    return RENDER_STAGE_ROWS.map((l) => ({ label: l, status: "completed" as const }));
  }
  if (status === "failed" || status === "canceled") {
    const at = STATUS_ROW_INDEX[lastPhase ?? "synthesizing"] ?? 0;
    return RENDER_STAGE_ROWS.map((l, i) => ({
      label: l,
      status: i < at ? ("completed" as const) : i === at ? ("failed" as const) : ("queued" as const),
    }));
  }
  // queued → nothing active yet; otherwise the phase's own row is active.
  const active = STATUS_ROW_INDEX[status];
  return RENDER_STAGE_ROWS.map((l, i) => ({
    label: l,
    status:
      active === undefined
        ? ("queued" as const)
        : i < active
          ? ("completed" as const)
          : i === active
            ? ("active" as const)
            : ("queued" as const),
  }));
}

/**
 * The progress caption. MOCK keeps the wireframe's single "Encoding frames" line.
 * REAL names the actual phase — including the two distinct `queued` states task 36
 * deliberately left for task 38: the `render` queue runs one job per worker, so
 * "waiting for a worker" and "the worker has your project and is preparing it"
 * (`startedAt` set, status still `queued`) are genuinely different waits.
 */
export function renderProgressLabel(r: RenderState): string {
  if (r.mode !== "real" || r.status === null) {
    return r.mode === "real" ? "Starting render" : "Encoding frames";
  }
  switch (r.status) {
    case "queued":
      return r.started ? "Preparing your project" : "Waiting for a render worker";
    case "synthesizing":
      return "Synthesizing narration & music";
    case "bundling":
      return "Bundling composition";
    case "encoding":
      return "Encoding frames";
    case "uploading":
      return "Uploading & finalizing";
    case "completed":
      return "Render complete";
    case "failed":
      return "Render failed";
    case "canceled":
      return "Render canceled";
  }
}

/** `612 / 840`, or `0 / —` while the server has not resolved the composition yet
 *  (spaces around the slash, em-dash is U+2014). */
export function renderFrameCountLabel(r: RenderState): string {
  return `${r.framesDone} / ${r.totalFrames > 0 ? r.totalFrames : "—"}`;
}

/** Display names for the codecs we round-trip. Anything else falls back to its raw wire
 *  value uppercased, so the spec line is never a lie about what was encoded. */
const CODEC_LABELS: Record<string, string> = {
  h264: "H.264",
  h265: "H.265",
  vp8: "VP8",
  vp9: "VP9",
  prores: "ProRes",
};
export function codecLabel(codec: string): string {
  return CODEC_LABELS[codec.toLowerCase()] ?? codec.toUpperCase();
}

/** MOCK spec line: `1080×1920 · 9:16 · 30fps · H.264`, resolution derived from the
 *  aspect (× is U+00D7). */
export function renderSpecLine(aspect: Aspect, fps: number): string {
  const { width, height } = aspectDimensions(aspect);
  return `${width}×${height} · ${aspect} · ${fps}fps · H.264`;
}

/** REAL spec line — the same designed copy, built from the SERVER's echoed spec. */
export function renderSpecLineFromSpec(spec: RenderOutputSpecLike): string {
  return `${spec.width}×${spec.height} · ${spec.aspectRatio} · ${spec.fps}fps · ${codecLabel(spec.codec)}`;
}

/**
 * Seconds remaining, extrapolated from the observed encode rate. Pure: `nowMs` is the
 * caller's clock. Null (→ the overlay shows no estimate) until there is something real
 * to extrapolate from — an unknown total, no encode start, or zero frames done. An
 * honest blank beats a fabricated countdown.
 */
export function renderEtaSeconds(r: RenderState, nowMs: number): number | null {
  if (r.mode !== "real") return null;
  if (r.encodingSinceMs === null || r.totalFrames <= 0 || r.framesDone <= 0) {
    return null;
  }
  const elapsedMs = nowMs - r.encodingSinceMs;
  if (elapsedMs <= 0) return null;
  const framesPerMs = r.framesDone / elapsedMs;
  if (framesPerMs <= 0) return null;
  const remaining = Math.max(0, r.totalFrames - r.framesDone);
  return Math.ceil(remaining / framesPerMs / 1000);
}

/** MOCK-only ETA from the fake tick rate (kept so the demo overlay reads identically). */
export function mockSecondsRemaining(r: RenderState): number {
  const left = Math.max(0, r.totalFrames - r.framesDone);
  const ticks = left / RENDER_FRAMES_PER_TICK;
  return Math.ceil((ticks * RENDER_TICK_MS) / 1000);
}

// ── request-side helpers (what the studio SENDS when starting a render) ───────

/** A `ProjectVersion` row as far as render targeting is concerned (structural mirror of
 *  the wire `ProjectVersionDto`, so this module needs no contract import). */
export interface RenderVersionLike {
  id: string;
  branchName: string;
}

/**
 * Resolve WHICH version to render (D11). The studio holds a branch name and a published
 * tag, never a `ProjectVersion` cuid, so the id comes from `GET /api/projects/:id/versions`
 * (already fetched by the 14b dropdown, already ordered semver-descending).
 *
 * Prefer the version whose `branchName` matches the tag the 14c eyebrow names — 14c is
 * reached from 14a step 3, so "RENDERING · v0.0.2" means the thing that just went live.
 * Publish tags `v0.0.2` and cuts `v0.0.3`, and the published `ProjectVersion` row carries
 * `branchName === "v0.0.2"`, so the match is exact. Falls back to the current working
 * branch, then to the newest version, so a studio re-opened without publishing this
 * session can still render. Null (→ no POST) when there is nothing to render.
 */
export function pickRenderVersion<T extends RenderVersionLike>(
  versions: readonly T[] | null,
  publishedVersion: string | null,
  workingBranch: string,
): T | null {
  if (!versions || versions.length === 0) return null;
  const byBranch = (name: string | null) =>
    name ? (versions.find((v) => v.branchName === name) ?? null) : null;
  return byBranch(publishedVersion) ?? byBranch(workingBranch) ?? versions[0] ?? null;
}

/** The Remotion codec id we request. Lowercase because that is the machine value the
 *  worker feeds `renderMedia`; the overlay renders it as "H.264" via {@link codecLabel}. */
export const RENDER_CODEC = "h264";

/**
 * Build the output spec to SEND (D12): resolution from the studio's aspect toggle, fps
 * from the composition, and the codec we support. What the overlay DISPLAYS is the
 * server's echo of this, not this object — so a server that clamps or substitutes
 * anything is visible rather than hidden.
 */
export function renderOutputSpecFor(
  aspect: Aspect,
  fps: number,
): RenderOutputSpecLike {
  const { width, height } = aspectDimensions(aspect);
  return { width, height, fps, aspectRatio: aspect, codec: RENDER_CODEC };
}
