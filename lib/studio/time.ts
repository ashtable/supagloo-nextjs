/**
 * Pure time↔frame math for the Wilderness Studio editor (no React/DOM). The
 * deterministic seam behind the transport readout and the Remotion timing.
 */

/** Seconds → whole frames at `fps`, rounded to the nearest frame. */
export function secondsToFrames(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

/** Frames → seconds at `fps`. */
export function framesToSeconds(frames: number, fps: number): number {
  return frames / fps;
}

/** Seconds → `m:ss`, zero-padded, flooring any fraction (never rounds up). */
export function formatTimecode(seconds: number): string {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
