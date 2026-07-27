import { describe, expect, it } from "vitest";

/**
 * Turn 16a slice C5 — the WATCH-PAGE PLAYER TRANSPORT MATH (plan §4 slice C5,
 * U-WP1…U-WP6). RED until `./watch-player` ships.
 *
 * `vitest.config.ts` runs this lane in `environment: "node"`, and that is the point:
 * none of this needs a DOM. The transport the design draws (§1.3 — a 4px scrub track
 * with a gradient fill, a knob, and a `0:12 / 0:32` monospace readout) is arithmetic
 * over two numbers a `<video>` element reports. Keeping it here means the component is
 * wiring, and the numbers are provable without a browser.
 *
 * The three things this file exists to stop:
 *
 *  1. **`NaN` reaching the screen.** A `<video>` reports `duration: NaN` and
 *     `currentTime: 0` until metadata loads, so the FIRST frame every viewer sees is
 *     the degenerate one. `"NaN:NaN"` and a `NaN%` fill width are what you get if the
 *     component does the arithmetic inline.
 *  2. **A seek that lands off the track.** A pointer can be released outside the
 *     element it started in, so a click-to-seek that trusts `clientX` blindly seeks to
 *     a negative time or past the end.
 *  3. **A dead player at t+120s.** The stream URL is a 120-second presign
 *     (`GET /v1/gallery/:id/stream-url`), and the watch page is the one surface a
 *     viewer sits on for longer than that. `shouldResignStreamUrl` is the predicate
 *     that decides to re-sign BEFORE the URL dies rather than after — a behaviour,
 *     not a comment.
 */
import {
  RESIGN_SAFETY_MARGIN_SECONDS,
  SEEK_PAGE_SECONDS,
  SEEK_STEP_SECONDS,
  formatPlayerTime,
  keyboardSeekTarget,
  progressPercent,
  seekTargetFromClick,
  shouldResignStreamUrl,
} from "./watch-player";
import { formatTimecode } from "../studio/time";

// ── U-WP1 / U-WP2: formatPlayerTime ──────────────────────────────────────────

describe("U-WP1 formatPlayerTime", () => {
  it("renders m:ss with a zero-padded seconds field", () => {
    expect(formatPlayerTime(0)).toBe("0:00");
    expect(formatPlayerTime(12)).toBe("0:12");
    expect(formatPlayerTime(92)).toBe("1:32");
    // The design's own readout, verbatim: `0:12 / 0:32`.
    expect(formatPlayerTime(32)).toBe("0:32");
  });

  it("REUSES lib/studio/time.ts rather than reimplementing the format", () => {
    // Same argument `galleryDurationLabel` makes: the card badge, the studio transport
    // and the watch-page readout must not drift into three dialects of `m:ss`.
    for (const s of [0, 1, 12, 32, 59, 60, 92, 599, 600, 3599]) {
      expect(formatPlayerTime(s)).toBe(formatTimecode(s));
    }
  });

  it("floors a fractional second (0:59.9 never reads 1:00)", () => {
    expect(formatPlayerTime(59.9)).toBe("0:59");
  });
});

describe("U-WP2 formatPlayerTime degenerates honestly", () => {
  it("renders 0:00 for NaN, Infinity and a negative time", () => {
    // NOT hypothetical: `video.duration` is NaN before `loadedmetadata` fires and
    // `Infinity` for a live/unknown-length source. This is the real first frame.
    expect(formatPlayerTime(Number.NaN)).toBe("0:00");
    expect(formatPlayerTime(Number.POSITIVE_INFINITY)).toBe("0:00");
    expect(formatPlayerTime(Number.NEGATIVE_INFINITY)).toBe("0:00");
    expect(formatPlayerTime(-5)).toBe("0:00");
  });
});

// ── U-WP3: progressPercent ───────────────────────────────────────────────────

describe("U-WP3 progressPercent", () => {
  it("is the fraction of the duration elapsed, as a percentage", () => {
    expect(progressPercent(0, 32)).toBe(0);
    expect(progressPercent(16, 32)).toBe(50);
    expect(progressPercent(32, 32)).toBe(100);
    // The design draws the fill at exactly 38% of a 0:32 item (12.16s).
    expect(progressPercent(12.16, 32)).toBeCloseTo(38, 6);
  });

  it("clamps to 0..100 — a currentTime past the duration never overflows the track", () => {
    expect(progressPercent(40, 32)).toBe(100);
    expect(progressPercent(-3, 32)).toBe(0);
  });

  it("returns 0 for a zero, negative, NaN or Infinite duration", () => {
    // A zero-width fill is honest about "we don't know how long this is"; NaN% is a
    // CSS parse failure that renders the fill at its previous width.
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressPercent(5, -1)).toBe(0);
    expect(progressPercent(5, Number.NaN)).toBe(0);
    expect(progressPercent(5, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("returns 0 for a NaN currentTime against a good duration", () => {
    expect(progressPercent(Number.NaN, 32)).toBe(0);
  });
});

// ── U-WP4: seekTargetFromClick ───────────────────────────────────────────────

describe("U-WP4 seekTargetFromClick", () => {
  const track = { left: 100, width: 400 };

  it("maps the left edge to 0 and the right edge to the duration", () => {
    expect(seekTargetFromClick(100, track, 32)).toBe(0);
    expect(seekTargetFromClick(500, track, 32)).toBe(32);
    expect(seekTargetFromClick(300, track, 32)).toBe(16);
  });

  it("clamps a click outside the track to the nearest end", () => {
    // A pointer released outside the element it started in is ordinary, not exotic.
    expect(seekTargetFromClick(0, track, 32)).toBe(0);
    expect(seekTargetFromClick(9_999, track, 32)).toBe(32);
  });

  it("returns 0 for a zero-width track or a duration that is not a positive number", () => {
    expect(seekTargetFromClick(300, { left: 100, width: 0 }, 32)).toBe(0);
    expect(seekTargetFromClick(300, track, 0)).toBe(0);
    expect(seekTargetFromClick(300, track, Number.NaN)).toBe(0);
  });
});

// ── U-WP5 / U-WP6: shouldResignStreamUrl ─────────────────────────────────────

describe("U-WP5 shouldResignStreamUrl", () => {
  const TTL = 120; // the API's presign TTL for `GET /v1/gallery/:id/stream-url`

  it("is FALSE inside the TTL and TRUE once the age passes the safety margin", () => {
    const signedAt = 1_000_000;
    const at = (ageSeconds: number) => signedAt + ageSeconds * 1000;

    expect(
      shouldResignStreamUrl({ signedAt, now: at(0), ttlSeconds: TTL }),
    ).toBe(false);
    expect(
      shouldResignStreamUrl({ signedAt, now: at(60), ttlSeconds: TTL }),
    ).toBe(false);
    // The margin exists so the re-sign completes BEFORE the URL dies: the boundary is
    // ttl - margin, not ttl.
    const boundary = TTL - RESIGN_SAFETY_MARGIN_SECONDS;
    expect(
      shouldResignStreamUrl({ signedAt, now: at(boundary - 1), ttlSeconds: TTL }),
    ).toBe(false);
    expect(
      shouldResignStreamUrl({ signedAt, now: at(boundary), ttlSeconds: TTL }),
    ).toBe(true);
    expect(
      shouldResignStreamUrl({ signedAt, now: at(TTL + 30), ttlSeconds: TTL }),
    ).toBe(true);
  });

  it("re-signs BEFORE expiry — the margin is a real number of seconds, not zero", () => {
    expect(RESIGN_SAFETY_MARGIN_SECONDS).toBeGreaterThan(0);
    expect(RESIGN_SAFETY_MARGIN_SECONDS).toBeLessThan(120);
  });

  it("is TRUE for a TTL at or under the margin — such a URL is never fresh enough to trust", () => {
    const signedAt = 1_000_000;
    expect(
      shouldResignStreamUrl({
        signedAt,
        now: signedAt,
        ttlSeconds: RESIGN_SAFETY_MARGIN_SECONDS,
      }),
    ).toBe(true);
  });
});

describe("U-WP6 shouldResignStreamUrl with nothing signed yet", () => {
  it("is TRUE when signedAt is null", () => {
    expect(
      shouldResignStreamUrl({ signedAt: null, now: 1_000_000, ttlSeconds: 120 }),
    ).toBe(true);
  });

  it("is TRUE when freshness cannot be proven (a NaN clock or TTL)", () => {
    // One needless re-sign costs a request; a stale URL costs a dead player. When the
    // inputs cannot answer the question, answer it the cheap way.
    expect(
      shouldResignStreamUrl({ signedAt: Number.NaN, now: 1, ttlSeconds: 120 }),
    ).toBe(true);
    expect(
      shouldResignStreamUrl({ signedAt: 1, now: Number.NaN, ttlSeconds: 120 }),
    ).toBe(true);
    expect(
      shouldResignStreamUrl({ signedAt: 1, now: 2, ttlSeconds: Number.NaN }),
    ).toBe(true);
  });

  it("is FALSE for a signedAt in the future (clock skew never forces a re-sign loop)", () => {
    expect(
      shouldResignStreamUrl({ signedAt: 2_000_000, now: 1_000_000, ttlSeconds: 120 }),
    ).toBe(false);
  });
});

// ── U-WP7: keyboardSeekTarget ────────────────────────────────────────────────

/**
 * The scrub track claims `role="slider"` and takes focus. That is a PROMISE to a
 * keyboard and to a screen reader: a slider is operable with the arrow keys. Until
 * this function existed the track had no key handler at all, so the role was a lie —
 * a sighted mouse user could seek and nobody else could.
 *
 * The map lives here rather than in the component for the same reason the rest of this
 * module does: it is arithmetic over two numbers a `<video>` reports, and it is the
 * part that can be wrong.
 */
describe("U-WP7 keyboardSeekTarget", () => {
  const DURATION = 32;

  it("steps forward and back by SEEK_STEP_SECONDS on the arrow keys", () => {
    expect(keyboardSeekTarget("ArrowRight", 10, DURATION)).toBe(10 + SEEK_STEP_SECONDS);
    expect(keyboardSeekTarget("ArrowLeft", 10, DURATION)).toBe(10 - SEEK_STEP_SECONDS);
    // ARIA's rule for a horizontal slider: Up increases with Right, Down with Left.
    expect(keyboardSeekTarget("ArrowUp", 10, DURATION)).toBe(10 + SEEK_STEP_SECONDS);
    expect(keyboardSeekTarget("ArrowDown", 10, DURATION)).toBe(10 - SEEK_STEP_SECONDS);
  });

  it("jumps by the larger SEEK_PAGE_SECONDS on PageUp/PageDown", () => {
    expect(SEEK_PAGE_SECONDS).toBeGreaterThan(SEEK_STEP_SECONDS);
    expect(keyboardSeekTarget("PageUp", 12, DURATION)).toBe(12 + SEEK_PAGE_SECONDS);
    expect(keyboardSeekTarget("PageDown", 12, DURATION)).toBe(12 - SEEK_PAGE_SECONDS);
  });

  it("Home is the start and End is the very end", () => {
    expect(keyboardSeekTarget("Home", 20, DURATION)).toBe(0);
    expect(keyboardSeekTarget("End", 2, DURATION)).toBe(DURATION);
  });

  it("clamps at both ends rather than seeking outside the clip", () => {
    // Held-down arrows at either end are ordinary input, not an edge case.
    expect(keyboardSeekTarget("ArrowLeft", 1, DURATION)).toBe(0);
    expect(keyboardSeekTarget("ArrowRight", DURATION - 1, DURATION)).toBe(DURATION);
    expect(keyboardSeekTarget("PageDown", 3, DURATION)).toBe(0);
    expect(keyboardSeekTarget("PageUp", DURATION - 2, DURATION)).toBe(DURATION);
  });

  it("returns null for a key it does not own, so the browser keeps its default", () => {
    // The component only calls `preventDefault` when this answers a number. A slider
    // that swallowed Tab, or space, or a page-scrolling key it does nothing with, would
    // be a worse trap for a keyboard user than no handler at all.
    for (const key of ["Tab", "Enter", " ", "a", "Escape", "ArrowRightRight"]) {
      expect(keyboardSeekTarget(key, 10, DURATION), key).toBeNull();
    }
  });

  it("returns null while the duration is unknown — there is nothing to seek within", () => {
    // `duration` is NaN until `loadedmetadata`, and `Infinity` for an unknown-length
    // source. Answering 0 would silently rewind a viewer who pressed → too early.
    expect(keyboardSeekTarget("ArrowRight", 0, Number.NaN)).toBeNull();
    expect(keyboardSeekTarget("ArrowRight", 0, Number.POSITIVE_INFINITY)).toBeNull();
    expect(keyboardSeekTarget("End", 0, 0)).toBeNull();
  });

  it("treats a nonsense currentTime as the start rather than propagating it", () => {
    expect(keyboardSeekTarget("ArrowRight", Number.NaN, DURATION)).toBe(
      SEEK_STEP_SECONDS,
    );
    expect(keyboardSeekTarget("ArrowRight", -4, DURATION)).toBe(SEEK_STEP_SECONDS);
  });
});
