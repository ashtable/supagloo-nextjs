/**
 * The pure 14c render model (no React/DOM). A frame counter climbing toward the
 * composition's total plus a 4-stage checklist (reusing the LogSequence
 * sequencer), and the derived spec line. The mocked Remotion-on-Railway render:
 * a caller-owned timer ticks `advanceRender`; the view renders the bar + stages.
 * All render numbers are DERIVED (frame total from the composition, dimensions
 * from the aspect) so the overlay never diverges from the timeline/player.
 */
import { aspectDimensions, type Aspect } from "./aspect";
import {
  initLog,
  isLogComplete,
  type LogSequence,
} from "../project-wizard/provisioning-log";

export interface RenderState {
  /** the published tag being rendered (14b LIVE / 14c eyebrow). */
  publishedVersion: string;
  /** composition length in frames (the single-source-of-truth total). */
  totalFrames: number;
  /** frames encoded so far, clamped at `totalFrames`. */
  framesDone: number;
  /** the 4-stage checklist, driven off `framesDone`. */
  stages: LogSequence;
  /** true once "Run in background" hides the overlay (render keeps ticking). */
  backgrounded: boolean;
}

/** The 4 render stages, in order. */
export const RENDER_STAGE_ROWS: readonly string[] = [
  "Bundled composition",
  "Synthesized narration & music",
  "Encoding video",
  "Upload & finalize share link",
];

/** Frames encoded per tick + the tick interval (ms). Frequent, small steps so
 *  progress visibly climbs while the total render (≈13.5s for the 900-frame demo)
 *  stays comfortably LONGER than the E2E's ~10s "progress increases" poll window —
 *  the render is always still climbing when sampled, never completing mid-sample.
 *  The E2E polls for increasing progress; it never sleeps a fixed time. */
export const RENDER_FRAMES_PER_TICK = 10;
export const RENDER_TICK_MS = 150;

export function initRender(
  totalFrames: number,
  publishedVersion: string,
): RenderState {
  return {
    publishedVersion,
    totalFrames,
    framesDone: 0,
    stages: initLog(RENDER_STAGE_ROWS),
    backgrounded: false,
  };
}

/** The stage cursor implied by the current frame progress: floor(fraction · N)
 *  during the render, N (all complete) once every frame is encoded — monotonic
 *  because `framesDone` only climbs. */
function stageTargetIndex(framesDone: number, totalFrames: number): number {
  if (framesDone >= totalFrames) return RENDER_STAGE_ROWS.length;
  const fraction = totalFrames > 0 ? framesDone / totalFrames : 1;
  return Math.min(
    RENDER_STAGE_ROWS.length - 1,
    Math.floor(fraction * RENDER_STAGE_ROWS.length),
  );
}

/** Advance one tick: climb `framesDone` (clamped at the total) and pull the
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

/** Integer percent complete, `round(framesDone / total · 100)`. */
export function renderPercent(r: RenderState): number {
  if (r.totalFrames <= 0) return 100;
  return Math.round((r.framesDone / r.totalFrames) * 100);
}

/** Every frame encoded (and, by construction, every stage complete). */
export function isRenderComplete(r: RenderState): boolean {
  return r.framesDone >= r.totalFrames && isLogComplete(r.stages);
}

/** The spec line: `1080×1920 · 9:16 · 30fps · H.264`, resolution from the
 *  aspect (× is U+00D7). */
export function renderSpecLine(aspect: Aspect, fps: number): string {
  const { width, height } = aspectDimensions(aspect);
  return `${width}×${height} · ${aspect} · ${fps}fps · H.264`;
}
