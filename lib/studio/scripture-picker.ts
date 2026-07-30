/**
 * The pure selection model behind the Inspector's scripture picker
 * (language → translation → book → chapter → verse). No React, no network.
 *
 * ── Cascade reset ───────────────────────────────────────────────────────────────────
 * Every level's identity is scoped to the level above it: chapter "1" of GEN in ASV is a
 * different object from chapter "1" of GEN in NAV, and GEN itself is not guaranteed to
 * exist in every translation (canon is per-translation — measured: 27 books in TCENT, 80
 * in engWEBUS). So changing any level clears every level below it. A stale lower
 * selection would otherwise fetch a passage from a translation the user has left.
 *
 * ── The default is a PREFERENCE, not an id ──────────────────────────────────────────
 * design-delta §9-Q10 forbids hardcoding bible ids: they are "always resolved via the
 * collection endpoint at request time". USER DECISION D1 chooses ASV as the picker's
 * default translation (KJV is measurably not licensed to our app key; ASV is its 1901
 * direct revision and preserves the archaic voice). `defaultTranslation` therefore looks
 * ASV up BY ABBREVIATION in whatever the live collection returned, and falls back to that
 * collection's first entry — so no id in this file ever reaches the network.
 *
 * Note the manifest's own default translation stays **BSB** (db-lib's
 * `ProjectManifestSchema`, design-delta §2.11). D1 changes what the picker pre-selects,
 * not what an existing manifest says; nothing here rewrites a manifest that was not
 * touched by the user.
 */
import type { BiblePassage, BibleTranslation } from "../youversion/contracts";

/** The picker opens on English. Matches the task text and every studio artefact. */
export const DEFAULT_LANGUAGE_TAG = "en";

/** USER DECISION D1. An ABBREVIATION, deliberately — never a numeric bible id. */
export const PREFERRED_TRANSLATION_ABBREVIATION = "ASV";

export interface ScriptureSelection {
  languageTag: string | null;
  /** The numeric bible id, stringified — the path segment of every downstream call. */
  bibleId: string | null;
  /** Carried alongside the id because it is what lands in the manifest's `translation`. */
  translationAbbreviation: string | null;
  /** USFM book code (`"GEN"`). */
  book: string | null;
  /** The chapter's own `id` as the provider reports it. */
  chapter: string | null;
  /** The verse's `passage_id`, ECHOED — this is what the passage route is called with. */
  versePassageId: string | null;
}

export const EMPTY_SELECTION: ScriptureSelection = {
  languageTag: null,
  bibleId: null,
  translationAbbreviation: null,
  book: null,
  chapter: null,
  versePassageId: null,
};

export function selectLanguage(
  _selection: ScriptureSelection,
  languageTag: string | null,
): ScriptureSelection {
  return { ...EMPTY_SELECTION, languageTag };
}

export function selectTranslation(
  selection: ScriptureSelection,
  translation: BibleTranslation | null,
): ScriptureSelection {
  return {
    ...EMPTY_SELECTION,
    languageTag: selection.languageTag,
    bibleId: translation?.id ?? null,
    translationAbbreviation: translation?.abbreviation ?? null,
  };
}

export function selectBook(
  selection: ScriptureSelection,
  book: string | null,
): ScriptureSelection {
  return { ...selection, book, chapter: null, versePassageId: null };
}

export function selectChapter(
  selection: ScriptureSelection,
  chapter: string | null,
): ScriptureSelection {
  return { ...selection, chapter, versePassageId: null };
}

export function selectVerse(
  selection: ScriptureSelection,
  versePassageId: string | null,
): ScriptureSelection {
  return { ...selection, versePassageId };
}

/**
 * The translation to pre-select from a LIVE collection.
 *
 * `preferred` (when given) wins, then ASV, then the collection's own first entry. Null for
 * an empty collection (a language with no Bibles answers 204 upstream, which surfaces here
 * as `[]`).
 *
 * `preferred` exists so a project that ALREADY HAS a translation opens on it. USER DECISION
 * D1 makes ASV the picker's *preference*; a project's own stored abbreviation is not a
 * preference, it is a fact about that project, and it outranks one. §9-Q10 still holds
 * throughout: the match is by ABBREVIATION against whatever the live collection returned, so
 * no bible id is ever hardcoded or assumed to exist. A translation the collection no longer
 * carries (licensing can be withdrawn, and a manifest is a historical record) falls through
 * to the preference rather than leaving the picker unusable.
 */
export function defaultTranslation(
  translations: readonly BibleTranslation[],
  preferred?: string | null,
): BibleTranslation | null {
  return (
    (preferred
      ? translations.find((t) => t.abbreviation === preferred)
      : undefined) ??
    translations.find(
      (t) => t.abbreviation === PREFERRED_TRANSLATION_ABBREVIATION,
    ) ??
    translations[0] ??
    null
  );
}

/**
 * The collection in the order a TRANSLATION DROPDOWN should list it: ascending by the name
 * the user sees.
 *
 * The live collection does not arrive alphabetically — the measured English response leads
 * `ASV, CPDV, BSB` — so a dropdown rendering it verbatim gave the user no ordering to scan.
 * With 20 English Bibles today and 1,472 across all languages, that is the difference between
 * looking a translation up and reading the whole list.
 *
 * **The key is the abbreviation then the title, and that is deliberate rather than
 * incidental.** Both dropdowns render `<abbreviation><separator><title>` — the wizard with an
 * em dash, the studio with a middot — so the abbreviation is the first thing the eye lands on
 * and this tuple is exactly the ordering either rendered label induces. Sorting by `title`
 * would produce a list that looks shuffled, because the column the user reads first would be
 * unordered; sorting by the composed label would put this module in the business of knowing a
 * separator it does not render.
 *
 * **Non-mutating, and that is load-bearing.** `defaultTranslation`'s last resort is "that
 * collection's FIRST entry" — the PROVIDER's first, i.e. its own view of which Bible to lead
 * with. Sorting a caller's array in place would silently redefine that as "alphabetically
 * first" for every collection with no ASV, which is most languages. So this returns a copy
 * and callers keep the provider's order for anything that is not display.
 *
 * Collated with the runtime's own locale rather than a pinned one: these are provider strings
 * in the language the user just chose, and "alphabetical" for Arabic or Greek titles is the
 * viewer's question, not ours. `numeric` so `NIV2` precedes `NIV11`. The sort is stable, so
 * two entries the collator cannot separate stay in the order the provider listed them.
 */
export function sortTranslationsForDisplay(
  translations: readonly BibleTranslation[],
): BibleTranslation[] {
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return [...translations].sort(
    (a, b) =>
      collator.compare(a.abbreviation, b.abbreviation) ||
      collator.compare(a.title, b.title),
  );
}

/**
 * The book and chapter a manifest's stored `passageId` refers to.
 *
 * `passageId` is a provider-issued USFM: `"PSA.23"` for a chapter, `"PSA.23.1"` for a verse,
 * `"PSA.23.1-5"` for a range the host normalised. The first segment is the book code and the
 * second locates the chapter — but the value returned for the chapter is a **`chapterPassageId`
 * to MATCH against the live chapters list**, never a chapter `id` to use directly: `id` and
 * `passage_id` are two independent provider strings, and deriving one from the other is
 * exactly the "construct a usfm" move this codebase closed. The caller finds the chapter whose
 * own echoed `passageId` equals this.
 *
 * Null when there is nothing to read (no id, or an id with no chapter segment — a
 * book-level reference has no chapter to select).
 */
export function bookAndChapterOf(
  passageId: string | null | undefined,
): { book: string; chapterPassageId: string } | null {
  if (!passageId) return null;
  const [book, chapter] = passageId.split(".");
  if (!book || !chapter) return null;
  return { book, chapterPassageId: `${book}.${chapter}` };
}

/** The three manifest fields a picked verse produces. Every value is echoed from the
 *  provider: the text verbatim, and the reference exactly as YouVersion formatted it —
 *  including the U+200E marks it embeds in RTL references. */
export function scripturePick(
  passage: BiblePassage,
  translationAbbreviation: string,
): { script: string; reference: string; translation: string } {
  return {
    script: passage.text,
    reference: passage.reference,
    translation: translationAbbreviation,
  };
}
