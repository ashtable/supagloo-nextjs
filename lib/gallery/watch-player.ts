/**
 * The watch page's PLAYER TRANSPORT MATH (Turn 16a §1.3). No React, no DOM.
 *
 * Everything the overlaid transport needs — the `0:12 / 0:32` readout, the scrub fill's
 * width, where a click on the track seeks to — is arithmetic over two numbers a
 * `<video>` element reports, plus one predicate about the presigned URL feeding it.
 * Keeping it here means the component is wiring and the numbers are provable in the
 * `environment: "node"` lane, without a browser.
 *
 * The three things this module exists to make impossible are all first-frame problems,
 * not edge cases:
 *
 *  - A `<video>` reports `duration: NaN` before `loadedmetadata` fires, so the very
 *    first render every viewer sees is the degenerate one. Inline arithmetic puts
 *    `NaN:NaN` on screen and `width: NaN%` in the fill (which CSS drops, leaving the
 *    fill at whatever it was).
 *  - A pointer can be released outside the element it was pressed in, so click-to-seek
 *    has to clamp or it seeks to a negative time.
 *  - The stream URL is a **120-second presign** (`GET /v1/gallery/:id/stream-url`), and
 *    the watch page is the one surface a viewer sits on for longer than that. Deciding
 *    to re-sign has to happen BEFORE the URL dies, which is what the safety margin is.
 */
import { formatTimecode } from "../studio/time";

/**
 * How long before a presigned stream URL expires we re-sign it.
 *
 * The re-sign is itself a round trip (BFF → API → presign), and the swap costs a
 * `<video>` `src` change plus a `currentTime` restore. Doing that at T-0 means doing it
 * after the URL is already dead — the player stalls first and recovers second. Fifteen
 * seconds is comfortably more than the round trip and comfortably less than the 120 s
 * TTL, so a re-sign is invisible rather than a stall.
 */
export const RESIGN_SAFETY_MARGIN_SECONDS = 15;

/** The transport's `m:ss` readout — `0` → `"0:00"`, `92` → `"1:32"`.
 *
 *  Delegates to `lib/studio/time.ts` rather than reimplementing the format, exactly as
 *  the card badge does, so the three surfaces that print a timecode cannot drift into
 *  three dialects of it.
 *
 *  A non-finite or negative input reads `"0:00"`. That is not defensive padding: it is
 *  the literal first frame (`video.duration` is NaN until metadata loads, and `Infinity`
 *  for an unknown-length source), and `"0:00"` is the honest thing to show while the
 *  real number is unknown. */
export function formatPlayerTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return formatTimecode(seconds);
}

/** The scrub fill's width as a percentage, clamped to `0..100`.
 *
 *  Returns `0` — never `NaN`, never a negative — whenever the duration is not a usable
 *  positive number. A zero-width fill says "we don't know how far in we are"; a `NaN%`
 *  width is a CSS parse failure that leaves the fill frozen at its previous value, which
 *  is the same pixels saying something false. */
export function progressPercent(current: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!Number.isFinite(current) || current <= 0) return 0;
  return Math.min(100, (current / duration) * 100);
}

/** The track geometry a seek needs — the `left`/`width` subset of a `DOMRect`, taken as
 *  a plain object so this stays pure and testable without a DOM. */
export interface TrackRect {
  left: number;
  width: number;
}

/** Where a click at `clientX` on the scrub track should seek to, in seconds.
 *
 *  The left edge is 0 and the right edge is the full duration; anything outside clamps
 *  to the nearer end, because a pointer released outside the element it was pressed in
 *  is ordinary behaviour, not an exotic input. */
export function seekTargetFromClick(
  clientX: number,
  rect: TrackRect,
  duration: number,
): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!Number.isFinite(rect.width) || rect.width <= 0) return 0;
  if (!Number.isFinite(clientX) || !Number.isFinite(rect.left)) return 0;

  const fraction = (clientX - rect.left) / rect.width;
  return Math.min(Math.max(fraction, 0), 1) * duration;
}

export interface ResignDecision {
  /** Epoch milliseconds at which the current URL was signed; `null` if nothing is
   *  signed yet. */
  signedAt: number | null;
  /** Epoch milliseconds now. */
  now: number;
  /** The presign's TTL in seconds (120 for `GET /v1/gallery/:id/stream-url`). */
  ttlSeconds: number;
}

/**
 * Should the stream URL be re-signed?
 *
 * `true` when nothing is signed yet, when the URL is within
 * {@link RESIGN_SAFETY_MARGIN_SECONDS} of expiry, or when the inputs cannot answer the
 * question at all. That last case is a deliberate asymmetry: one needless re-sign costs
 * a request, and a stale URL costs a dead player, so an unanswerable question is
 * answered the cheap way.
 *
 * A `signedAt` in the FUTURE reads as fresh rather than as an immediate re-sign — it can
 * only arise from clock movement on this same client, and treating it as expired would
 * spin the player through a re-sign on every frame.
 */
export function shouldResignStreamUrl(decision: ResignDecision): boolean {
  const { signedAt, now, ttlSeconds } = decision;
  if (signedAt === null) return true;
  if (
    !Number.isFinite(signedAt) ||
    !Number.isFinite(now) ||
    !Number.isFinite(ttlSeconds)
  ) {
    return true;
  }

  const threshold = ttlSeconds - RESIGN_SAFETY_MARGIN_SECONDS;
  // A TTL at or under the margin can never be trusted long enough to be worth keeping.
  if (threshold <= 0) return true;

  const ageSeconds = (now - signedAt) / 1000;
  return ageSeconds >= threshold;
}
