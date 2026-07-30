/**
 * The pure scripture-picker selection model (language → translation → book →
 * chapter → verse). No React, no network.
 *
 * The two rules that matter most here, and why:
 *  - **Cascade reset.** Every level's identity is scoped to the level above it: chapter
 *    "1" of GEN in ASV is a different thing from chapter "1" of GEN in NAV. A stale
 *    lower selection would silently fetch a passage from a translation the user is no
 *    longer looking at.
 *  - **Echo, never construct.** The picker stores YouVersion's own `passage_id`
 *    strings. It never assembles `GEN.1.1` from parts — that is the "USFM production"
 *    risk 34-E5 recorded, and the enumeration endpoints hand us the exact ref the
 *    passage endpoint wants.
 */
import { describe, expect, it } from "vitest";

import type { BibleTranslation } from "../youversion/contracts";
import {
  DEFAULT_LANGUAGE_TAG,
  EMPTY_SELECTION,
  PREFERRED_TRANSLATION_ABBREVIATION,
  defaultTranslation,
  scripturePick,
  sortTranslationsForDisplay,
  selectBook,
  selectChapter,
  selectLanguage,
  selectTranslation,
  selectVerse,
} from "./scripture-picker";

const t = (id: string, abbreviation: string, title = abbreviation): BibleTranslation => ({
  id,
  abbreviation,
  title,
});

/** The measured English collection, in the order the live API returns it. */
const ENGLISH = [
  t("12", "ASV", "American Standard Version"),
  t("42", "CPDV"),
  t("3034", "BSB", "Berean Standard Bible"),
];

/** A fully-drilled selection. */
const FULL = selectVerse(
  selectChapter(
    selectBook(
      selectTranslation(selectLanguage(EMPTY_SELECTION, "en"), ENGLISH[0]),
      "GEN",
    ),
    "1",
  ),
  "GEN.1.1",
);

describe("defaults", () => {
  it("U-SP1: the picker defaults to English, and prefers ASV (USER DECISION D1)", () => {
    expect(DEFAULT_LANGUAGE_TAG).toBe("en");
    expect(PREFERRED_TRANSLATION_ABBREVIATION).toBe("ASV");
    expect(defaultTranslation(ENGLISH)).toEqual(ENGLISH[0]);
  });

  it("U-SP2: the default is chosen FROM the live collection — a collection without ASV falls back to its first entry, never to a hardcoded id", () => {
    const spanish = [t("128", "RVR1960"), t("149", "NVI")];
    expect(defaultTranslation(spanish)).toEqual(spanish[0]);
    expect(defaultTranslation([])).toBeNull();
  });

  it("U-SP2b: ASV is matched by ABBREVIATION, so the numeric id is never assumed", () => {
    // Same abbreviation, a different id than the one measured today.
    const shuffled = [t("999", "BSB"), t("777", "ASV")];
    expect(defaultTranslation(shuffled)?.id).toBe("777");
  });
});

describe("sortTranslationsForDisplay", () => {
  it("U-SP5: orders the collection by the name shown, which the provider's order is not", () => {
    // `ENGLISH` is the order the live API actually returns — ASV, CPDV, BSB — so the
    // provider's own ordering is demonstrably not alphabetical, and a user scanning the
    // dropdown for a translation had no ordering to scan by.
    expect(ENGLISH.map((x) => x.abbreviation)).toEqual(["ASV", "CPDV", "BSB"]);
    expect(sortTranslationsForDisplay(ENGLISH).map((x) => x.abbreviation)).toEqual([
      "ASV",
      "BSB",
      "CPDV",
    ]);
  });

  it("U-SP5b: it does NOT reorder the caller's array — the default's [0] fallback still reads the provider's order", () => {
    // Load-bearing, not hygiene. `defaultTranslation` documents its last resort as "that
    // collection's FIRST entry", meaning the provider's first — its notion of which Bible
    // to lead with. Sorting in place would silently redefine that as "alphabetically
    // first" for every language whose collection has no ASV, which is most of them.
    const input = [...ENGLISH];
    const sorted = sortTranslationsForDisplay(input);
    expect(input).toEqual(ENGLISH);
    expect(sorted).not.toBe(input);
    expect(defaultTranslation(input)).toEqual(ENGLISH[0]);
  });

  it("U-SP5c: equal abbreviations fall back to the title, and equal labels keep the provider's order", () => {
    // Both components render `<abbreviation><separator><title>`, so the abbreviation is the
    // primary key and the title is the tiebreak — that is what makes this function's
    // ordering the same one the rendered label induces, without this module having to know
    // either component's separator (the wizard uses an em dash, the studio a middot).
    const dupes = [
      t("2", "NIV", "New International Version (Anglicised)"),
      t("1", "NIV", "New International Version"),
      t("3", "ESV", "English Standard Version"),
    ];
    expect(sortTranslationsForDisplay(dupes).map((x) => x.id)).toEqual(["3", "1", "2"]);

    // A stable sort, so two entries the comparator cannot separate stay as the provider
    // listed them rather than swapping on an engine's whim.
    const identical = [t("9", "KJV", "King James Version"), t("8", "KJV", "King James Version")];
    expect(sortTranslationsForDisplay(identical).map((x) => x.id)).toEqual(["9", "8"]);
  });

  it("U-SP5d: an empty or single-entry collection is returned as a copy, not an error", () => {
    expect(sortTranslationsForDisplay([])).toEqual([]);
    expect(sortTranslationsForDisplay([ENGLISH[1]])).toEqual([ENGLISH[1]]);
  });
});

describe("cascade", () => {
  it("U-SP3a: changing the LANGUAGE clears translation, book, chapter and verse", () => {
    const next = selectLanguage(FULL, "ar");
    expect(next).toEqual({
      ...EMPTY_SELECTION,
      languageTag: "ar",
    });
  });

  it("U-SP3b: changing the TRANSLATION clears book, chapter and verse but keeps the language", () => {
    const next = selectTranslation(FULL, ENGLISH[2]);
    expect(next.languageTag).toBe("en");
    expect(next.bibleId).toBe("3034");
    expect(next.translationAbbreviation).toBe("BSB");
    expect(next.book).toBeNull();
    expect(next.chapter).toBeNull();
    expect(next.versePassageId).toBeNull();
  });

  it("U-SP3c: changing the BOOK clears chapter and verse", () => {
    const next = selectBook(FULL, "EXO");
    expect(next.book).toBe("EXO");
    expect(next.chapter).toBeNull();
    expect(next.versePassageId).toBeNull();
    expect(next.bibleId).toBe("12");
  });

  it("U-SP3d: changing the CHAPTER clears the verse", () => {
    const next = selectChapter(FULL, "2");
    expect(next.chapter).toBe("2");
    expect(next.versePassageId).toBeNull();
    expect(next.book).toBe("GEN");
  });

  it("U-SP3e: clearing a level (null) clears everything below it too", () => {
    const next = selectBook(FULL, null);
    expect(next.book).toBeNull();
    expect(next.chapter).toBeNull();
    expect(next.versePassageId).toBeNull();
  });

  it("U-SP3f: every transform is immutable — the input selection is never mutated", () => {
    const before = { ...FULL };
    selectLanguage(FULL, "he");
    selectTranslation(FULL, ENGLISH[1]);
    selectBook(FULL, "PSA");
    selectChapter(FULL, "23");
    selectVerse(FULL, "PSA.23.1");
    expect(FULL).toEqual(before);
  });
});

describe("scripturePick", () => {
  it("U-SP4: a picked verse yields the three manifest fields, all ECHOED from the API", () => {
    const pick = scripturePick(
      {
        passageId: "GEN.1.1",
        text: "In the beginning God created the heavens and the earth.",
        reference: "Genesis 1:1",
      },
      "ASV",
    );
    expect(pick).toEqual({
      script: "In the beginning God created the heavens and the earth.",
      reference: "Genesis 1:1",
      translation: "ASV",
    });
  });

  it("U-SP4b: an RTL reference keeps YouVersion's own bidi mark — we never re-format the reference", () => {
    const reference = "التكوين ‎1:1";
    const pick = scripturePick(
      { passageId: "GEN.1.1", text: "فِي الْبَدْءِ", reference },
      "NAV",
    );
    expect(pick.reference).toBe(reference);
    expect(pick.script).toBe("فِي الْبَدْءِ");
  });
});
