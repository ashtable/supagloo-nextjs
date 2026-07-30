"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_LANGUAGE_TAG,
  EMPTY_SELECTION,
  defaultTranslation,
  selectBook,
  selectChapter,
  selectLanguage,
  selectTranslation,
  sortTranslationsForDisplay,
  type ScriptureSelection as PickerSelection,
} from "@/lib/studio/scripture-picker";
import {
  fetchBibleBooks,
  fetchBibleChapters,
  fetchBibleLanguages,
  fetchBiblePassage,
  fetchBibleTranslations,
  fetchBibleVerses,
} from "@/lib/studio/scripture-data";
import type {
  BibleBookRef,
  BibleChapterRef,
  BibleLanguage,
  BiblePassage,
  BibleTranslation,
  BibleVerseRef,
} from "@/lib/youversion/contracts";
import type { ScriptureSelection } from "@/lib/project-wizard/new-project-model";
import {
  defaultVerseRange,
  passageRequestId,
  previewMeta,
  toggleVerse,
  versesInRange,
  type VerseRange,
} from "@/lib/project-wizard/verse-range";

/**
 * Figure 18a — the New-project wizard's step 2, "Choose your scripture".
 *
 * ## What is reused, and what is new
 *
 * The PURE selection model (`lib/studio/scripture-picker.ts`) and the six injectable
 * fetchers (`lib/studio/scripture-data.ts`) are reused verbatim — including the cascade
 * reset, the ASV default resolved BY ABBREVIATION from the live collection (never a
 * hardcoded bible id), and the tri-state cache contract where `null` (the fetch failed)
 * is distinct from `[]` (there genuinely are none).
 *
 * The studio's `scripture-picker.tsx` COMPONENT is not reusable: it takes no props, reads
 * `useStudio()`, and its own comment says the wizard's `--sg-*` palette "would look wrong
 * in here". This is the wizard-skinned sibling — `--sg-*` colours used LITERALLY, because
 * 18a is measured as site-skin (80 `--sg-*` token usages, against 0 in 19/20).
 *
 * ## The verse tray — built 2026-07-30, after the live host settled the open question
 *
 * This step originally shipped at CHAPTER granularity, and 18a's verse chips / range /
 * `Whole chapter` were deliberately omitted: a range looked like a CONSTRUCTED usfm
 * (`PSA.121.1-PSA.121.4`), which `contracts.ts` closed as residual risk after task 34-E5
 * priced it (*"`passageId` is ECHOED, never constructed"*), and nothing had verified any
 * range form against the live host.
 *
 * Verifying it split the question in two, and the omission survives in one half:
 *
 *   - `PSA.121.1-PSA.121.4` — the both-sides form that caution was about — is a **404**.
 *   - `PSA.121.1+PSA.121.2` — a `+`-joined list of ids the **verses route itself issued** —
 *     is a **200**, and the host answers `{id:"PSA.121.1-2", reference:"Psalms 121:1-2"}`,
 *     normalising a contiguous list into a canonical range and handing it back.
 *
 * So the request is assembled only from provider-issued ids and what gets PERSISTED is the
 * id and reference the provider echoed for it — the same standing the chapter's own
 * `passageId` already had. See `lib/project-wizard/verse-range.ts`.
 *
 * The DEFAULT is the first `min(5, n)` of the live verses response (the user's requirement:
 * *"optionally verses, default to first 5 verses"*). `min(5, n)`, never 5: verse counts are
 * a property of the translation, and `PSA.117.1-5` does not fail upstream — it answers 200
 * for a two-verse chapter with the reference `"Psalms 117:1-5"`, i.e. it would commit a
 * FABRICATED reference into the user's repo.
 *
 * 18a's `"each verse becomes a scene in the generated storyboard"` is still REFUSED. How
 * many scenes a passage becomes is the model's call, and shipping that sentence would repeat
 * exactly the mistake the ready card's "Redirecting automatically…" caption was.
 *
 * ## What 18a draws that is still NOT built, and why
 *
 * **18b's four searchable popovers.** Searchable filtering, canon grouping, chapter counts,
 * abbreviation badges and a 6-column chapter grid are all new controls, and none of them
 * answers a problem the cascade has. Native `<select>`s express the same four choices, and
 * they are what the shipped picker already uses. Recorded as a deviation.
 *
 * ## The error state
 *
 * NO DESIGN EXISTS for it (flag F4), and the shipped studio copy — *"Couldn't reach
 * YouVersion — type the verse into the script instead."* — is nonsensical here: there is
 * no script yet, and no project to put one in. New copy, and the `null`-vs-`[]` distinction
 * is preserved so "we could not ask" never renders as "there are none".
 */

const LABEL: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: ".06em",
  color: "var(--sg-dim)",
  marginBottom: 5,
};

const FIELD: React.CSSProperties = {
  width: "100%",
  height: 42,
  border: "1px solid var(--sg-line2)",
  borderRadius: 10,
  background: "var(--sg-panel)",
  padding: "0 12px",
  fontSize: 13.5,
  fontWeight: 600,
  color: "var(--sg-fg)",
  appearance: "none",
};

const UNREACHABLE =
  "Couldn't reach YouVersion. Check your connection and try again — you can also pick the passage later in the studio.";

export interface ScriptureStepProps {
  repoFullName: string;
  projectName: string;
  /** 18a's `"Change"` — returns to step 1. */
  onChangeRepo: () => void;
  onSelect: (selection: ScriptureSelection | null) => void;
  /**
   * Leave step 2 with NO passage and scaffold a blank project.
   *
   * `canScaffold` gates the wizard's only forward control on a resolved passage, and step
   * 2 sits between the repo choice and the scaffold — so without this control, a user who
   * cannot reach YouVersion (or does not yet know their passage) has no way to finish
   * creating a NEW project at all. The step's own copy already promises the passage can be
   * picked later in the studio; this is the control that keeps that promise. (The Import
   * wizard is a separate entry point and never passes through here.)
   */
  onSkip: () => void;
}

export default function ScriptureStep({
  repoFullName,
  projectName,
  onChangeRepo,
  onSelect,
  onSkip,
}: ScriptureStepProps) {
  const [selection, setSelection] = useState<PickerSelection>({
    ...EMPTY_SELECTION,
    languageTag: DEFAULT_LANGUAGE_TAG,
  });
  // `null` = the fetch FAILED (disable + advise). `[]` = there genuinely are none. The
  // studio picker documents this distinction and it is preserved verbatim: collapsing
  // them would render "we could not ask" as "there are none".
  const [languages, setLanguages] = useState<BibleLanguage[] | null | undefined>();
  const [translations, setTranslations] = useState<
    BibleTranslation[] | null | undefined
  >();
  const [books, setBooks] = useState<BibleBookRef[] | null | undefined>();
  const [chapters, setChapters] = useState<BibleChapterRef[] | null | undefined>();
  const [passage, setPassage] = useState<BiblePassage | null | undefined>();
  // The chapter's verses, KEYED by the chapter that produced them. The same technique the
  // studio picker uses for its dependent lists: a key mismatch invalidates the list without
  // a synchronous `setState(null)` in an effect body (which React's `set-state-in-effect`
  // rule flags, correctly) and without a frame in which the previous chapter's verses are on
  // screen as if they were this one's.
  const [verses, setVerses] = useState<{
    key: string;
    items: BibleVerseRef[] | null;
  } | null>(null);
  // `null` = the WHOLE CHAPTER (18a's `Whole chapter` button, and the honest state whenever
  // there is no verse list to select from). A range is only ever endpoints of the live list.
  const [range, setRange] = useState<VerseRange | null>(null);

  useEffect(() => {
    let active = true;
    void fetchBibleLanguages().then((l) => {
      if (active) setLanguages(l);
    });
    return () => void (active = false);
  }, []);

  const languageTag = selection.languageTag;
  useEffect(() => {
    if (!languageTag) return;
    let active = true;
    // Intentional synchronization, the documented `workspace-home.tsx` /
    // `session-provider.tsx` pattern: the INPUT above changed, so the previous answer is
    // no longer an answer about this input. Clearing to `undefined` (loading) is what
    // stops the previous language's translations being shown as if they were this one's —
    // and it is precisely the distinction the tri-state contract exists to keep.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTranslations(undefined);
    void fetchBibleTranslations(languageTag).then((t) => {
      if (!active) return;
      setTranslations(t);
      // The default is resolved from whatever the LIVE collection returned — ASV by
      // abbreviation, else the collection's own first entry. No bible id is ever
      // hardcoded (§9-Q10).
      const preferred = t ? defaultTranslation(t) : null;
      if (preferred) {
        setSelection((s) => selectTranslation(s, preferred));
      }
    });
    return () => void (active = false);
  }, [languageTag]);

  const bibleId = selection.bibleId;
  useEffect(() => {
    if (!bibleId) return;
    let active = true;
    // Intentional synchronization, the documented `workspace-home.tsx` /
    // `session-provider.tsx` pattern: the INPUT above changed, so the previous answer is
    // no longer an answer about this input. Clearing to `undefined` (loading) is what
    // stops the previous language's translations being shown as if they were this one's —
    // and it is precisely the distinction the tri-state contract exists to keep.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBooks(undefined);
    void fetchBibleBooks(bibleId).then((b) => {
      if (active) setBooks(b);
    });
    return () => void (active = false);
  }, [bibleId]);

  const book = selection.book;
  useEffect(() => {
    if (!bibleId || !book) return;
    let active = true;
    // Intentional synchronization, the documented `workspace-home.tsx` /
    // `session-provider.tsx` pattern: the INPUT above changed, so the previous answer is
    // no longer an answer about this input. Clearing to `undefined` (loading) is what
    // stops the previous language's translations being shown as if they were this one's —
    // and it is precisely the distinction the tri-state contract exists to keep.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChapters(undefined);
    void fetchBibleChapters(bibleId, book).then((c) => {
      if (active) setChapters(c);
    });
    return () => void (active = false);
  }, [bibleId, book]);

  const chapterId = selection.chapter;
  const chapterRef = chapters?.find((c) => c.id === chapterId) ?? null;
  const chapterPassageId = chapterRef?.passageId ?? null;
  const translationAbbrev = selection.translationAbbreviation;

  // The chapter's verses. Fetched for the DEFAULT selection as much as for the tray: "the
  // first 5 verses" is only answerable from this response.
  const versesKey = bibleId && chapterId ? `${bibleId}|${selection.book}|${chapterId}` : "";
  useEffect(() => {
    if (!versesKey) return;
    const [id, book, chapter] = versesKey.split("|");
    let active = true;
    void fetchBibleVerses(id, book, chapter).then((v) => {
      if (!active) return;
      setVerses({ key: versesKey, items: v });
      // The default range is derived from the response, so it can only ever name verses the
      // provider listed. A failed or empty read yields `null` — the whole chapter — which is
      // a complete answer rather than an error.
      setRange(defaultVerseRange(v));
    });
    return () => void (active = false);
  }, [versesKey]);

  const verseOptions = verses?.key === versesKey ? verses.items : undefined;
  // Every request is echoed values only: the chapter's own `passageId`, or the selected
  // verses' own `passageId`s joined.
  const requestPassageId = passageRequestId(verseOptions, range, chapterPassageId);

  // The live passage preview + the reported selection, keyed on the ECHOED usfm being asked
  // for — so changing the verse range re-asks, exactly as changing the chapter does.
  useEffect(() => {
    // THE RE-RUN RULE, and it belongs here rather than in any one handler. This effect's
    // inputs are the whole of what the reported selection is a statement ABOUT, so the
    // moment any of them changes the previous report is stale — it names a passage the
    // user has navigated away from. The wizard's only forward gate (`canScaffold` →
    // `new-project-model.ts`) reads that reported value, so a stale report is a Create
    // button armed against the wrong scripture, and there is nothing else to guard it
    // with: the parent holds no pending flag and the chip tray has no `disabled`.
    //
    // Clearing UNCONDITIONALLY, before the branch below, is what makes book, chapter and
    // verse changes covered by CONSTRUCTION rather than by enumeration. The clear used to
    // sit inside the early return, which only fires when `requestPassageId` becomes
    // falsy — true of a BOOK change (`setChapters(undefined)` drives `chapterPassageId`
    // to null) and false of a chapter or verse change, where one non-null echoed id is
    // replaced by another and the guarded branch is never entered.
    onSelect(null);
    if (!bibleId || !requestPassageId) {
      // Same synchronization: no chapter ⇒ no passage. The CTA gate reads the null
      // reported above, so leaving a stale passage here would arm the scaffold against a
      // chapter the user has navigated away from.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPassage(undefined);
      return;
    }
    let active = true;
    setPassage(undefined);
    void fetchBiblePassage(bibleId, requestPassageId).then((p) => {
      if (!active) return;
      setPassage(p);
      // The selection is reported only once the passage RESOLVES. Paired with the
      // unconditional clear at the top of this effect, that makes the invariant hold on
      // EVERY run and not merely the first: between any input change and the provider's
      // answer about the new input, the reported selection is `null`. On its own this
      // resolve-then-report was true of the first resolve only — the CTA stayed armed on
      // the previously confirmed reference while the new one was in flight.
      // Both values reported are the provider's OWN answer about the request, not the
      // request itself: for a contiguous verse range the host normalises the join into
      // `PSA.121.1-5` and `"Psalms 121:1-5"`, and those are what get persisted.
      onSelect(
        p && translationAbbrev
          ? {
              reference: p.reference,
              translation: translationAbbrev,
              ...(languageTag ? { language: languageTag } : {}),
              // ECHOED, never constructed — see the file docblock.
              passageId: p.passageId,
            }
          : null,
      );
    });
    return () => void (active = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bibleId, requestPassageId, translationAbbrev, languageTag]);

  const failed = (v: unknown[] | null | undefined) => v === null;
  const anyFailure =
    failed(languages) || failed(translations) || failed(books) || failed(chapters);

  // Clear FIRST, then hand back to the wizard. A user who picked a chapter, changed their
  // mind and skipped must not scaffold `createdFrom: "passage"` carrying the passage they
  // backed out of. `onSelect(null)` is called directly rather than left to the cascade
  // effect so the wizard's state is already clear by the time `onSkip` scaffolds.
  const skipPassage = () => {
    setPassage(undefined);
    setSelection((s) => selectChapter(s, null));
    // The verse selection has to go with the chapter, or a re-entry into step 2 would show
    // a range over a chapter that is no longer selected.
    setVerses(null);
    setRange(null);
    onSelect(null);
    onSkip();
  };

  return (
    <div data-testid="wizard-scripture-step">
      <div
        style={{
          fontFamily: "var(--font-anton), sans-serif",
          fontSize: 26,
          lineHeight: 1.05,
        }}
      >
        {"CHOOSE YOUR SCRIPTURE"}
      </div>
      <div
        style={{
          fontFamily: "var(--font-zilla), 'Zilla Slab', Georgia, serif",
          fontSize: 14,
          color: "var(--sg-dim)",
          marginTop: 8,
          lineHeight: 1.5,
        }}
      >
        {
          "Pulled live from the YouVersion Bible API. This passage is saved with your project and seeds the storyboard you generate in the studio."
        }
      </div>

      {/* 18a's repo recap strip */}
      <div
        data-testid="wizard-repo-recap"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginTop: 16,
          padding: "10px 13px",
          border: "1px solid var(--sg-line)",
          borderRadius: 10,
          background: "var(--sg-panel)",
          fontSize: 12.5,
          color: "var(--sg-dim)",
        }}
      >
        <b style={{ color: "var(--sg-fg)", fontWeight: 700 }}>{repoFullName}</b>
        {" · project "}
        <b style={{ color: "var(--sg-fg)", fontWeight: 700 }}>{projectName}</b>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          data-testid="wizard-change-repo"
          onClick={onChangeRepo}
          style={{
            fontWeight: 700,
            color: "var(--sg-red)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          {"Change"}
        </button>
      </div>

      {/* The four cascading pickers, 18a's `1fr 1fr` grid at gap 11. */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 11,
        }}
      >
        <div>
          <div style={LABEL}>{"LANGUAGE"}</div>
          <select
            data-testid="wizard-picker-language"
            aria-label="Language"
            style={FIELD}
            disabled={!languages || languages.length === 0}
            value={selection.languageTag ?? ""}
            onChange={(e) => {
              setSelection(selectLanguage(selection, e.target.value || null));
              setPassage(undefined);
            }}
          >
            <option value="">{"select language"}</option>
            {(languages ?? []).map((l) => (
              <option key={l.tag} value={l.tag}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={LABEL}>{"TRANSLATION"}</div>
          <select
            data-testid="wizard-picker-translation"
            aria-label="Translation"
            style={FIELD}
            disabled={!translations || translations.length === 0}
            value={selection.bibleId ?? ""}
            onChange={(e) => {
              const t = (translations ?? []).find((x) => x.id === e.target.value);
              setSelection(selectTranslation(selection, t ?? null));
            }}
          >
            <option value="">{"select translation"}</option>
            {/* Sorted for DISPLAY only — the live collection arrives in the provider's own
                order (measured: `ASV, CPDV, BSB`), which gives a user scanning 20 English
                Bibles nothing to scan by. `translations` itself stays in provider order
                because `defaultTranslation`'s last-resort `[0]` means the provider's first
                entry; see `sortTranslationsForDisplay`. */}
            {sortTranslationsForDisplay(translations ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {`${t.abbreviation} — ${t.title}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={LABEL}>{"BOOK"}</div>
          <select
            data-testid="wizard-picker-book"
            aria-label="Book"
            style={FIELD}
            disabled={!books || books.length === 0}
            value={selection.book ?? ""}
            onChange={(e) => setSelection(selectBook(selection, e.target.value || null))}
          >
            <option value="">{"select book"}</option>
            {(books ?? []).map((b) => (
              <option key={b.usfm} value={b.usfm}>
                {b.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={LABEL}>{"CHAPTER"}</div>
          <select
            data-testid="wizard-picker-chapter"
            aria-label="Chapter"
            style={FIELD}
            disabled={!chapters || chapters.length === 0}
            value={selection.chapter ?? ""}
            onChange={(e) =>
              setSelection(selectChapter(selection, e.target.value || null))
            }
          >
            <option value="">{"select chapter"}</option>
            {(chapters ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 18a's verse tray. Rendered only once the provider has LISTED verses for this
          chapter — a `null` (failed) or `[]` (none) read leaves the whole chapter selected,
          which is a complete answer, so there is nothing to draw. */}
      {verseOptions && verseOptions.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              ...LABEL,
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              marginBottom: 7,
            }}
          >
            {"VERSES"}
            <span
              style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}
            >
              {"— tap to select a range, or use the whole chapter"}
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              data-testid="wizard-whole-chapter"
              onClick={() => setRange(null)}
              style={{
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: ".04em",
                color: range === null ? "var(--sg-gold)" : "var(--sg-dim)",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textTransform: "none",
              }}
            >
              {"Whole chapter"}
            </button>
          </div>
          <div
            data-testid="wizard-verse-chips"
            style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
          >
            {verseOptions.map((v) => {
              const selected = versesInRange(verseOptions, range).some(
                (s) => s.id === v.id,
              );
              return (
                <button
                  key={v.id}
                  type="button"
                  data-testid="wizard-verse-chip"
                  data-verse-id={v.id}
                  data-selected={selected ? "true" : "false"}
                  aria-pressed={selected}
                  onClick={() => setRange((r) => toggleVerse(r, v.id, verseOptions))}
                  style={{
                    minWidth: 32,
                    height: 32,
                    padding: "0 7px",
                    borderRadius: 8,
                    border: `1px solid ${selected ? "var(--sg-gold)" : "var(--sg-line2)"}`,
                    background: selected ? "rgba(201,154,63,.16)" : "var(--sg-panel)",
                    color: selected ? "var(--sg-fg)" : "var(--sg-dim)",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {/* The provider's own verse label — never a re-derived number. */}
                  {v.title}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 18a's live passage preview. Header values are INTERPOLATED from the response —
          never the figure's "66" / "1,900+" / a hardcoded range (flag F5). */}
      {passage ? (
        <div
          data-testid="wizard-passage-preview"
          style={{
            marginTop: 16,
            border: "1px solid rgba(201,154,63,.4)",
            borderRadius: 11,
            background: "rgba(201,154,63,.06)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderBottom: "1px solid rgba(201,154,63,.28)",
              fontFamily: "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: ".14em",
              color: "#a5772a",
            }}
          >
            <span data-testid="wizard-passage-reference">
              {`${passage.reference} · ${selection.translationAbbreviation ?? ""} · FROM YOUVERSION`}
            </span>
            <span style={{ flex: 1 }} />
            {/* 18a's `4 verses · 71 words`. Both counts come from the live response — the
                verse count from the verses route, the word count from the passage text.
                Neither of the figure's own numbers appears in the source (flag F5). */}
            <span
              data-testid="wizard-passage-meta"
              style={{ letterSpacing: ".08em", fontWeight: 600 }}
            >
              {previewMeta({ verses: verseOptions, range, text: passage.text })}
            </span>
          </div>
          <div
            // `dir="auto"` is the same first-strong algorithm the studio editor, the
            // preview caption and the generated Remotion source use, so an RTL passage
            // reads correctly here with no language field and no script detector.
            dir="auto"
            style={{
              padding: "13px 15px",
              fontFamily: "var(--font-zilla), 'Zilla Slab', Georgia, serif",
              fontSize: 14.5,
              lineHeight: 1.6,
              color: "var(--sg-fg)",
              maxHeight: 104,
              overflow: "hidden",
            }}
          >
            {passage.text}
          </div>
        </div>
      ) : null}

      {anyFailure ? (
        <div
          data-testid="wizard-scripture-error"
          style={{ marginTop: 12, fontSize: 12.5, color: "var(--sg-red)" }}
        >
          {UNREACHABLE}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 13,
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          fontSize: 12,
          color: "var(--sg-dim)",
        }}
      >
        <span style={{ color: "var(--sg-gold)" }}>{"ⓘ"}</span>
        {/* 18a reads "These verses seed the script — each one becomes a scene in the
            generated storyboard." The first clause is true and kept verbatim. The second is
            a promise the contract cannot keep: how many scenes a passage becomes is the
            model's decision, and this run exists partly because a caption promised
            behaviour the code did not perform. */}
        {
          "These verses seed the script — you'll generate the storyboard from them in the studio."
        }
      </div>

      {/* The way out. Secondary by role — a link-weight button, not a second CTA — because
          picking a passage is still the intended path. Deliberately NOT disabled by
          `anyFailure`: an unreachable YouVersion is exactly when it is the only way
          forward. */}
      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          data-testid="wizard-skip-scripture"
          onClick={skipPassage}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: ".06em",
            color: "var(--sg-dim)",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          {"SKIP — PICK THE PASSAGE LATER IN THE STUDIO"}
        </button>
      </div>
    </div>
  );
}
