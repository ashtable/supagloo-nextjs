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
  type ScriptureSelection as PickerSelection,
} from "@/lib/studio/scripture-picker";
import {
  fetchBibleBooks,
  fetchBibleChapters,
  fetchBibleLanguages,
  fetchBiblePassage,
  fetchBibleTranslations,
} from "@/lib/studio/scripture-data";
import type {
  BibleBookRef,
  BibleChapterRef,
  BibleLanguage,
  BiblePassage,
  BibleTranslation,
} from "@/lib/youversion/contracts";
import type { ScriptureSelection } from "@/lib/project-wizard/new-project-model";

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
 * ## What 18a draws that is NOT built, and why
 *
 * **The verse chip tray, the range, and "Whole chapter".** 18a selects verses 1–4 as a
 * contiguous range and heads the preview `"PSALM 121:1–4"`. A range is a CONSTRUCTED usfm
 * (`PSA.121.1-PSA.121.4`), and `contracts.ts` records that constructing one was
 * deliberately closed as residual risk after task 34-E5 priced it: *"`passageId` is
 * ECHOED, never constructed."* Nothing has verified a range form against the live host.
 * Per design-delta §2.7.1 the rule is omit rather than fake, so this ships at CHAPTER
 * granularity, echoing the chapter's own `passageId` exactly as the chapters route handed
 * it out. 18a's `"each verse becomes a scene"` info line goes with it — under the settled
 * scope generation stays in the studio, so the claim would be false here.
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

  // The live passage preview. Keyed on the CHAPTER's echoed `passageId`.
  const chapterId = selection.chapter;
  const chapterRef = chapters?.find((c) => c.id === chapterId) ?? null;
  const chapterPassageId = chapterRef?.passageId ?? null;
  const translationAbbrev = selection.translationAbbreviation;
  useEffect(() => {
    if (!bibleId || !chapterPassageId) {
      // Same synchronization: no chapter ⇒ no passage, and no selection to report. The CTA
      // gate reads that null, so leaving a stale passage here would arm the scaffold
      // against a chapter the user has navigated away from.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPassage(undefined);
      onSelect(null);
      return;
    }
    let active = true;
    setPassage(undefined);
    void fetchBiblePassage(bibleId, chapterPassageId).then((p) => {
      if (!active) return;
      setPassage(p);
      // The selection is reported as soon as the passage RESOLVES, so the CTA cannot be
      // enabled against a reference the provider has not confirmed.
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
  }, [bibleId, chapterPassageId, translationAbbrev, languageTag]);

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
            {(translations ?? []).map((t) => (
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
        {
          "The passage is saved with the project. You'll generate the storyboard from it in the studio."
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
