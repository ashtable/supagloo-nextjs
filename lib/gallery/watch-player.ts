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

/**
 * One arrow press, in seconds. Five is the convention every video player on the web
 * uses for an arrow key, and at this product's scale (a seeded clip is seconds long,
 * a real one tens of seconds) it is a step you can actually land on a phrase with.
 */
export const SEEK_STEP_SECONDS = 5;

/**
 * One Page press. Deliberately only twice the arrow step rather than the 30–60 s a
 * feature-length player would use: these are short-form 9:16 videos, and a page key
 * that always lands on 0:00 or the end is Home and End wearing a different hat.
 */
export const SEEK_PAGE_SECONDS = 10;

/**
 * Where a KEY press on the scrub track should seek to, in seconds — or `null` when the
 * key is not one this control owns.
 *
 * The scrub track carries `role="slider"` and `tabIndex={0}`. Both are promises: a
 * slider is operable from the keyboard, and a focusable thing does something when you
 * type at it. Until this existed the track had a click handler and nothing else, so a
 * screen-reader user was told they had a seek control they could not move — the role
 * was announcing a capability the component did not have.
 *
 * `null` is as load-bearing as the numbers. The component calls `preventDefault` only
 * when this answers, so every key this control does not own keeps its browser default:
 * Tab still leaves, Escape still closes, and the page still scrolls. A slider that ate
 * unrelated keys would be a worse trap than no handler at all.
 *
 * An unusable duration (NaN before `loadedmetadata`, `Infinity` for an unknown-length
 * source, zero) also answers `null` rather than 0 — there is no interval to seek
 * within yet, and rewinding a viewer who pressed `→` a moment too early is a wrong
 * answer, not a safe default. A nonsense `currentTime` is read as the start, which is
 * the same thing the element itself reports before it knows better.
 */
export function keyboardSeekTarget(
  key: string,
  currentTime: number,
  duration: number,
): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const from = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  let target: number;
  switch (key) {
    // ARIA's rule for a horizontal slider: Up increases along with Right.
    case "ArrowRight":
    case "ArrowUp":
      target = from + SEEK_STEP_SECONDS;
      break;
    case "ArrowLeft":
    case "ArrowDown":
      target = from - SEEK_STEP_SECONDS;
      break;
    case "PageUp":
      target = from + SEEK_PAGE_SECONDS;
      break;
    case "PageDown":
      target = from - SEEK_PAGE_SECONDS;
      break;
    case "Home":
      target = 0;
      break;
    case "End":
      target = duration;
      break;
    default:
      return null;
  }

  return Math.min(Math.max(target, 0), duration);
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
