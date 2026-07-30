/**
 * The wizard step-2 verse selection model (figure 18a's chip tray). Pure — no React, no
 * network.
 *
 * ── Why a range is expressible at all now ───────────────────────────────────────────
 * 18a draws verses 1–4 selected as a contiguous range with a `Whole chapter` escape, and
 * it shipped as chapter-only because `contracts.ts` had closed CONSTRUCTING a USFM as
 * residual risk ("`passageId` is ECHOED, never constructed") and no range form had been
 * verified against the live host.
 *
 * Probing it on 2026-07-30 split that question in two:
 *
 *  - `PSA.121.1-PSA.121.4` — the both-sides form a naive "start-end" construction
 *    produces, and the one the original decision had in mind — is a **404**.
 *  - `PSA.121.1+PSA.121.2` — a `+`-joined LIST of ids the verses route itself handed out —
 *    is a **200**, and the host answers with `{id: "PSA.121.1-2", reference: "Psalms
 *    121:1-2"}`. It normalises a contiguous list into a canonical range and hands that
 *    back. A non-contiguous list stays a list (`PSA.121.1+PSA.121.3` → `"Psalms 121:1,3"`).
 *
 * So the request is assembled only out of provider-issued ids, and what gets PERSISTED is
 * the id and reference the provider echoed for it — exactly the standing the chapter's own
 * `passageId` already had. Nothing here invents a character of USFM.
 *
 * ── Why the default count comes from the response ───────────────────────────────────
 * The requirement is "default to the first 5 verses". Verse counts are a property of the
 * translation, and this platform may not assert scripture canon
 * (`gallery-not-filterable-by-book`, §9-Q10). The concrete harm of hardcoding 5 is not a
 * 404 — measured live, `PSA.117.1-5` answers **200** for a two-verse chapter, returning the
 * real text under the reference `"Psalms 117:1-5"`. A fabricated reference, committed to the
 * user's git repo, with nothing anywhere to notice. So the default is `min(5, n)` over the
 * live list, and `n` is never guessed.
 */
import type { BibleVerseRef } from "../youversion/contracts";

/** How many verses the wizard pre-selects when a chapter has at least that many. */
export const DEFAULT_VERSE_COUNT = 5;

/** A contiguous run of the LIVE verse list, named by the `id`s of its endpoints (which are
 *  provider strings, not numbers — see `versesInRange`). */
export interface VerseRange {
  startId: string;
  endId: string;
}

/** The tri-state the picker's fetchers produce: `undefined` loading, `null` failed, `[]`
 *  genuinely none. Every one of the three means "no verse selection", and none of them is
 *  an error — the chapter's own `passageId` is a complete answer. */
type VerseList = readonly BibleVerseRef[] | null | undefined;

const indexOfVerse = (verses: readonly BibleVerseRef[], id: string): number =>
  verses.findIndex((v) => v.id === id);

/**
 * The pre-selected range for a freshly-loaded chapter: the first `min(5, n)` entries of
 * whatever the provider listed. `null` when there is no list to read — which is the
 * whole-chapter selection, not a failure.
 */
export function defaultVerseRange(verses: VerseList): VerseRange | null {
  if (!verses || verses.length === 0) return null;
  const last = verses[Math.min(DEFAULT_VERSE_COUNT, verses.length) - 1];
  return { startId: verses[0].id, endId: last.id };
}

/**
 * 18a's "tap to select a range": the first tap anchors a single verse, the second extends
 * from that anchor (in either direction), and a tap on an already-settled multi-verse range
 * starts over. A verse the live list does not contain is ignored rather than anchored — an
 * endpoint outside the list would select nothing and put an id the provider never issued
 * into a request.
 */
export function toggleVerse(
  range: VerseRange | null,
  verseId: string,
  verses: VerseList,
): VerseRange | null {
  if (!verses || indexOfVerse(verses, verseId) < 0) return range;
  if (!range) return { startId: verseId, endId: verseId };
  if (range.startId !== range.endId) return { startId: verseId, endId: verseId };

  const anchor = indexOfVerse(verses, range.startId);
  const tapped = indexOfVerse(verses, verseId);
  if (anchor < 0) return { startId: verseId, endId: verseId };
  const [lo, hi] = anchor <= tapped ? [anchor, tapped] : [tapped, anchor];
  return { startId: verses[lo].id, endId: verses[hi].id };
}

/**
 * The verses a range covers, sliced by the response's OWN ORDER.
 *
 * Deliberately not by parsing numbers out of the ids: a verse `id` is a provider string
 * (translations report merged verses as e.g. `"2-3"`), and the order the response came in
 * is the only ordering this platform is entitled to use.
 */
export function versesInRange(
  verses: VerseList,
  range: VerseRange | null,
): BibleVerseRef[] {
  if (!verses || !range) return [];
  const start = indexOfVerse(verses, range.startId);
  const end = indexOfVerse(verses, range.endId);
  if (start < 0 || end < 0) return [];
  const [lo, hi] = start <= end ? [start, end] : [end, start];
  return verses.slice(lo, hi + 1);
}

/**
 * The USFM the passage route is called with.
 *
 * Three cases, and every one of them is an echoed value:
 *  - no range (18a's `Whole chapter`) → the chapter's own `passageId`;
 *  - a range covering EVERY listed verse → the chapter's `passageId` too. That is a
 *    comparison against the live list rather than a claim about how many verses a chapter
 *    has, and it keeps the request short (a 176-verse join is a 2.3 KB URL — which does
 *    work upstream, but there is no reason to send it);
 *  - otherwise → the selected verses' own `passageId`s, `+`-joined.
 *
 * `null` when there is no chapter yet: with nothing echoed there is nothing to ask for, and
 * the alternative would be assembling something.
 */
export function passageRequestId(
  verses: VerseList,
  range: VerseRange | null,
  chapterPassageId: string | null,
): string | null {
  if (!chapterPassageId) return null;
  const selected = versesInRange(verses, range);
  if (selected.length === 0) return chapterPassageId;
  if (verses && selected.length === verses.length) return chapterPassageId;
  return selected.map((v) => v.passageId).join("+");
}

/**
 * 18a's preview meta line — `4 verses · 71 words`.
 *
 * Flag F5: every count printed anywhere is interpolated from the live response. The figure's
 * own numbers are illustrations and appear nowhere in the source. When the verse list is
 * unavailable the word count stands alone rather than being padded with a guessed verse
 * count.
 */
export function previewMeta(input: {
  verses: VerseList;
  range: VerseRange | null;
  text: string;
}): string {
  const words = input.text.trim() === "" ? 0 : input.text.trim().split(/\s+/).length;
  const wordPart = `${words} ${words === 1 ? "word" : "words"}`;

  const selected = versesInRange(input.verses, input.range);
  const count = selected.length > 0 ? selected.length : (input.verses?.length ?? 0);
  if (count === 0) return wordPart;
  return `${count} ${count === 1 ? "verse" : "verses"} · ${wordPart}`;
}
