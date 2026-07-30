import { describe, expect, it } from "vitest";

import {
  DEFAULT_VERSE_COUNT,
  defaultVerseRange,
  passageRequestId,
  previewMeta,
  toggleVerse,
  versesInRange,
  type VerseRange,
} from "./verse-range";
import type { BibleVerseRef } from "../youversion/contracts";

/**
 * The wizard's verse-range model (user clarification 2026-07-30: "optionally verses,
 * default to first 5 verses").
 *
 * The whole file exists to keep TWO rules mechanical rather than remembered:
 *
 *  1. **"first 5" means `min(5, n)` of the LIVE response.** Verse counts are a property of
 *     the translation, exactly as book counts are, and this platform may not assert
 *     scripture canon. The concrete harm is not a 404 — measured live 2026-07-30,
 *     `GET /v1/bibles/12/passages/PSA.117.1-5` answers **200** for a chapter with two
 *     verses, echoing `reference: "Psalms 117:1-5"`. A hardcoded 5 therefore commits a
 *     FABRICATED reference into the user's git repo, silently, over real text.
 *
 *  2. **Nothing here constructs a USFM.** Every component of a passage request is a
 *     `passageId` the provider handed out. `+`-joining echoed ids is verified live: the
 *     host answers 200 and echoes back a canonical `id` (`PSA.121.1+PSA.121.2` →
 *     `"PSA.121.1-2"`), which is what gets persisted. The "full both sides" form the
 *     earlier decision assumed (`PSA.121.1-PSA.121.4`) is a **404** — which is why the
 *     join form, not a hyphen, is what this module produces.
 */

// A real chapter list shape, projected exactly as `app/api/bible/verses/route.ts` serves it.
const verses = (n: number, book = "PSA", chapter = "121"): BibleVerseRef[] =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i + 1),
    passageId: `${book}.${chapter}.${i + 1}`,
    title: String(i + 1),
  }));

const PSALM_121 = verses(8);
/** Psalm 117 has TWO verses. Measured live, not assumed. */
const PSALM_117 = verses(2, "PSA", "117");
const CHAPTER_PASSAGE_ID = "PSA.121";

describe("defaultVerseRange — 'the first 5 verses' resolved against the live response", () => {
  it("U-VR1: selects the first min(5, n) verses of a chapter that has more than five", () => {
    const range = defaultVerseRange(PSALM_121);
    expect(range).toEqual({ startId: "1", endId: "5" });
    expect(versesInRange(PSALM_121, range)).toHaveLength(DEFAULT_VERSE_COUNT);
  });

  it("U-VR2: a chapter with FEWER verses than the default selects all of them, never five", () => {
    // The rule that stops "Psalms 117:1-5" — a reference for verses that do not exist —
    // being persisted into a user's repo.
    const range = defaultVerseRange(PSALM_117);
    expect(range).toEqual({ startId: "1", endId: "2" });
    expect(versesInRange(PSALM_117, range)).toHaveLength(2);
  });

  it("U-VR3: an empty or unavailable verse list has NO range — the chapter is the passage", () => {
    // `[]` is "asked, and there genuinely are none"; `null` is "we could not ask". Neither
    // may be turned into a verse selection, and neither is an error: the chapter's own
    // echoed passageId is a complete, honest answer.
    expect(defaultVerseRange([])).toBeNull();
    expect(defaultVerseRange(null)).toBeNull();
    expect(defaultVerseRange(undefined)).toBeNull();
  });
});

describe("toggleVerse — 18a's 'tap to select a range'", () => {
  it("U-VR4a: the first tap anchors a one-verse range", () => {
    expect(toggleVerse(null, "3", PSALM_121)).toEqual({ startId: "3", endId: "3" });
  });

  it("U-VR4b: the second tap extends from the anchor — in either direction", () => {
    const anchored: VerseRange = { startId: "3", endId: "3" };
    expect(toggleVerse(anchored, "6", PSALM_121)).toEqual({ startId: "3", endId: "6" });
    // Tapping BACKWARDS must still produce an ordered range, not an inverted one that
    // selects nothing.
    expect(toggleVerse(anchored, "1", PSALM_121)).toEqual({ startId: "1", endId: "3" });
  });

  it("U-VR4c: a tap on a settled multi-verse range starts over", () => {
    const settled: VerseRange = { startId: "2", endId: "5" };
    expect(toggleVerse(settled, "7", PSALM_121)).toEqual({ startId: "7", endId: "7" });
  });

  it("U-VR4d: a verse that is not in the live list is ignored, never anchored", () => {
    // The chips are rendered FROM the live list, so this is unreachable through the UI —
    // but a range whose endpoints are not in the list would silently select nothing and
    // build a request out of ids the provider never issued.
    expect(toggleVerse(null, "99", PSALM_121)).toBeNull();
    const settled: VerseRange = { startId: "2", endId: "5" };
    expect(toggleVerse(settled, "99", PSALM_121)).toEqual(settled);
  });
});

describe("versesInRange", () => {
  it("U-VR8: slices by LIST ORDER, never by parsing numbers out of the ids", () => {
    // Verse ids are provider strings. A translation may report them in a form that does
    // not sort or parse numerically, and the response's own order is the only ordering
    // this platform is entitled to use.
    const odd: BibleVerseRef[] = [
      { id: "1", passageId: "PSA.121.1", title: "1" },
      { id: "2-3", passageId: "PSA.121.2-3", title: "2-3" },
      { id: "4", passageId: "PSA.121.4", title: "4" },
    ];
    expect(versesInRange(odd, { startId: "1", endId: "2-3" }).map((v) => v.id)).toEqual([
      "1",
      "2-3",
    ]);
    expect(versesInRange(odd, { startId: "2-3", endId: "4" }).map((v) => v.id)).toEqual([
      "2-3",
      "4",
    ]);
  });

  it("U-VR8b: a null range selects nothing (the chapter is the passage, not every verse)", () => {
    expect(versesInRange(PSALM_121, null)).toEqual([]);
  });
});

describe("passageRequestId — what actually goes on the wire", () => {
  it("U-VR5: joins the ECHOED per-verse passageIds; every component came from the response", () => {
    const id = passageRequestId(PSALM_121, { startId: "2", endId: "4" }, CHAPTER_PASSAGE_ID);
    const echoed = new Set(PSALM_121.map((v) => v.passageId));
    expect(id).toBeTruthy();
    for (const component of id!.split("+")) {
      expect(echoed, `"${component}" was not handed out by the provider`).toContain(
        component,
      );
    }
    expect(id).toBe("PSA.121.2+PSA.121.3+PSA.121.4");
  });

  it("U-VR6: a range covering EVERY live verse collapses to the chapter's own passageId", () => {
    // Not an optimisation for its own sake: it keeps the request short (a 176-verse join
    // is a 2.3 KB URL) and the comparison is against the live list, so it is never a claim
    // about how many verses a chapter has.
    expect(
      passageRequestId(PSALM_121, { startId: "1", endId: "8" }, CHAPTER_PASSAGE_ID),
    ).toBe(CHAPTER_PASSAGE_ID);
    expect(
      passageRequestId(PSALM_117, { startId: "1", endId: "2" }, "PSA.117"),
    ).toBe("PSA.117");
  });

  it("U-VR7: 'Whole chapter' (a null range) is the chapter's own echoed passageId", () => {
    expect(passageRequestId(PSALM_121, null, CHAPTER_PASSAGE_ID)).toBe(CHAPTER_PASSAGE_ID);
    expect(passageRequestId(null, null, CHAPTER_PASSAGE_ID)).toBe(CHAPTER_PASSAGE_ID);
  });

  it("U-VR7b: no chapter passageId means no request at all — nothing is assembled", () => {
    expect(passageRequestId(PSALM_121, { startId: "1", endId: "2" }, null)).toBeNull();
    expect(passageRequestId(PSALM_121, null, null)).toBeNull();
  });

  it("U-VR5b: a range whose endpoints are unknown falls back to the chapter, never to a guess", () => {
    expect(
      passageRequestId(PSALM_121, { startId: "40", endId: "44" }, CHAPTER_PASSAGE_ID),
    ).toBe(CHAPTER_PASSAGE_ID);
  });
});

describe("previewMeta — 18a's '4 verses · 71 words'", () => {
  it("U-VR9: both counts are interpolated from the live response, never drawn values", () => {
    // Flag F5: the figure's numbers are illustrations. 18a happens to draw "4 verses ·
    // 71 words"; neither number may appear in the source.
    const meta = previewMeta({
      verses: PSALM_121,
      range: { startId: "1", endId: "4" },
      text: "one two three four five",
    });
    expect(meta).toBe("4 verses · 5 words");
  });

  it("U-VR9b: 'whole chapter' counts every verse the response listed", () => {
    expect(
      previewMeta({ verses: PSALM_117, range: null, text: "a b c" }),
    ).toBe("2 verses · 3 words");
  });

  it("U-VR9c: one verse is singular", () => {
    expect(
      previewMeta({ verses: PSALM_121, range: { startId: "1", endId: "1" }, text: "a b" }),
    ).toBe("1 verse · 2 words");
  });

  it("U-VR9d: an unavailable verse list prints the word count ALONE, never a guessed count", () => {
    expect(previewMeta({ verses: null, range: null, text: "a b c" })).toBe("3 words");
    expect(previewMeta({ verses: [], range: null, text: "a b c" })).toBe("3 words");
  });

  it("U-VR9e: empty text is zero words, not a crash and not a blank meta", () => {
    expect(previewMeta({ verses: PSALM_117, range: null, text: "   " })).toBe(
      "2 verses · 0 words",
    );
  });
});
