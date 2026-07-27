/**
 * The pure "Your videos" model (Row 41, plan §5.2) — no React, no DOM.
 *
 * `/your-videos` has no wireframe (design-delta §2.7 / §9-Q3 put it out of scope — NOT
 * "§5", which is "System architecture (target)" and declares nothing out of scope;
 * miscitation corrected 2026-07-26, and Turns 16/17 still do not draw this screen), so
 * the page adapts 10a's `recent-projects.tsx` grid. What deserves a model rather than JSX is the
 * mapping from a wire `RenderJobDto` to what a card actually renders — and one rule in
 * particular:
 *
 *   **`framesTotal === 0` means INDETERMINATE, so there is NO duration badge.**
 *
 * 0 is what a `RenderJob` carries from creation until the worker's `bundleComposition`
 * resolves the composition. Rendering `"0:00"` there would state that the video is zero
 * seconds long, which is the same class of lie the 14c overlay had to be corrected for
 * in task 38.
 */
import { formatTimecode } from "../studio/time";
import { renderSpecLineFromSpec } from "../studio/render-model";
import type { RenderJobDto, RenderStatus } from "../api/contracts";

export type RenderChip = "RENDERING" | "RENDERED" | "FAILED" | "CANCELED";

/** How each chip is drawn. `tone` selects the card's colour pair, reusing the tokens
 *  10a's `recent-projects.tsx` already established:
 *   - `done`     → `#160f14` on `rgba(255,232,168,.94)` (its RENDERED chip),
 *   - `progress` → `#fff` on `rgba(201,154,63,.9)` (its DRAFT chip),
 *   - `error`    → `#fff` on `rgba(192,57,43,.9)` (`--sg-red`). */
export const RENDER_CHIPS: Record<RenderChip, { tone: "done" | "progress" | "error" }> = {
  RENDERING: { tone: "progress" },
  RENDERED: { tone: "done" },
  FAILED: { tone: "error" },
  CANCELED: { tone: "error" },
};

/**
 * `RenderStatus` → chip.
 *
 * DEVIATION FROM THE PLAN, deliberate: §5.2 named three chips
 * (`RENDERED`/`DRAFT`/`FAILED`). "DRAFT" is a PROJECT concept — a queued render is not a
 * draft, it is a render that has not finished — and collapsing `canceled` into `FAILED`
 * would report a deliberate stop as a defect. So the five in-flight statuses share one
 * `RENDERING` chip and `canceled` keeps its own.
 */
export function chipForStatus(status: RenderStatus): RenderChip {
  switch (status) {
    case "completed":
      return "RENDERED";
    case "failed":
      return "FAILED";
    case "canceled":
      return "CANCELED";
    case "queued":
    case "synthesizing":
    case "bundling":
    case "encoding":
    case "uploading":
      return "RENDERING";
  }
}

/**
 * Can this render be published to the gallery?
 *
 * These are the API's OWN three preconditions (`GalleryService.publish`): completed,
 * both asset keys present, and a resolved frame total. Mirroring all three — the plan
 * named only the first two — is what keeps the "Share to gallery" affordance ABSENT
 * rather than present-and-409ing, which is the better affordance.
 */
export function isPublishable(dto: RenderJobDto): boolean {
  return (
    dto.status === "completed" &&
    dto.outputAssetKey !== null &&
    dto.thumbnailAssetKey !== null &&
    dto.framesTotal > 0
  );
}

export interface VideoCard {
  id: string;
  projectId: string;
  status: RenderStatus;
  chip: RenderChip;
  tone: "done" | "progress" | "error";
  /** `m:ss`, or null when the frame total is indeterminate (no badge is rendered). */
  durationLabel: string | null;
  /** `1080×1920 · 9:16 · 30fps · H.264`, from the SERVER's echoed spec. */
  specLine: string;
  /** e.g. `3h ago`. Derived from the injected clock, never a real one. */
  createdLabel: string;
  error: string | null;
  isPublishable: boolean;
}

/** Map a wire `RenderJobDto` onto its card. `now` is injected so this stays pure. */
export function renderToVideoCard(
  dto: RenderJobDto,
  now: Date | number = Date.now(),
): VideoCard {
  const chip = chipForStatus(dto.status);
  return {
    id: dto.id,
    projectId: dto.projectId,
    status: dto.status,
    chip,
    tone: RENDER_CHIPS[chip].tone,
    durationLabel: durationLabelFor(dto.framesTotal, dto.outputSpec.fps),
    specLine: renderSpecLineFromSpec(dto.outputSpec),
    createdLabel: relativeTimeLabel(dto.createdAt, now),
    error: dto.error,
    isPublishable: isPublishable(dto),
  };
}

/** `framesTotal / fps` as `m:ss`, or null when either number makes the answer a lie. */
function durationLabelFor(framesTotal: number, fps: number): string | null {
  if (!Number.isFinite(framesTotal) || framesTotal <= 0) return null;
  if (!Number.isFinite(fps) || fps <= 0) return null;
  return formatTimecode(framesTotal / fps);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Past this, a relative age stops being useful and a date is more informative. */
const RELATIVE_LIMIT_MS = 30 * DAY_MS;

/**
 * `just now` / `13m ago` / `3h ago` / `2d ago`, falling back to `YYYY-MM-DD` past 30
 * days. A future timestamp (clock skew between the API host and the browser) reads
 * `just now` rather than a negative age; an unparseable one reads empty rather than
 * `NaN`.
 */
export function relativeTimeLabel(iso: string, now: Date | number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const nowMs = typeof now === "number" ? now : now.getTime();
  const delta = nowMs - then;
  if (delta < MINUTE_MS) return "just now";
  if (delta < HOUR_MS) return `${Math.floor(delta / MINUTE_MS)}m ago`;
  if (delta < DAY_MS) return `${Math.floor(delta / HOUR_MS)}h ago`;
  if (delta < RELATIVE_LIMIT_MS) return `${Math.floor(delta / DAY_MS)}d ago`;
  return new Date(then).toISOString().slice(0, 10);
}
