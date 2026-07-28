"use client";

import { useEffect, useState } from "react";

import { useStudio } from "./studio-context";
import {
  fetchBibleBooks,
  fetchBibleChapters,
  fetchBiblePassage,
  fetchBibleTranslations,
  fetchBibleVerses,
  fetchBibleLanguages,
} from "@/lib/studio/scripture-data";
import {
  DEFAULT_LANGUAGE_TAG,
  EMPTY_SELECTION,
  defaultTranslation,
  scripturePick,
  selectBook,
  selectChapter,
  selectLanguage,
  selectTranslation,
  selectVerse,
  type ScriptureSelection,
} from "@/lib/studio/scripture-picker";
import type {
  BibleBookRef,
  BibleChapterRef,
  BibleLanguage,
  BibleTranslation,
  BibleVerseRef,
} from "@/lib/youversion/contracts";

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";

/** A fetched list tagged with the selection that produced it. `items === null` means the
 *  read FAILED (a disabled select + a message); a key mismatch means the selection has
 *  moved on and the list is stale (a disabled, empty select). The two are deliberately
 *  distinct from `[]`, which means "asked, and there genuinely are none". */
interface Keyed<T> {
  key: string;
  items: T[] | null;
}

const LABEL: React.CSSProperties = {
  fontFamily: SEMI,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: ".16em",
  // Plain dim, NOT gold: the studio reserves gold labels for `→ AI` fields
  // (VISUAL PROMPT, NARRATOR VOICE). Scripture is fetched, not generated.
  color: "#a99b85",
  marginBottom: 5,
};

/** 16b's field geometry translated into the studio's warm-dark skin. The `--sg-*` tokens
 *  the gallery dialog uses are a different palette and would look wrong in here. */
const BOX: React.CSSProperties = {
  width: "100%",
  height: 34,
  border: "1px solid rgba(230,180,120,.24)",
  borderRadius: 9,
  background: "#0f0b07",
  padding: "0 10px",
  color: "#f1e7d6",
  fontSize: 12.5,
  fontWeight: 600,
  outline: "none",
  appearance: "none",
};

function Field({
  testid,
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: {
  testid: string;
  label: string;
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={LABEL}>{label}</div>
      <select
        data-testid={testid}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...BOX, opacity: disabled ? 0.5 : 1 }}
      >
        {/* Placeholders are the dim colour — the design's rule for an unmade choice. */}
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Task item 1 — the Inspector's scripture picker.
 *
 * ── Why it fetches lazily, on mount ─────────────────────────────────────────────────
 * The task asks to "lazily query the YouVersion API the first time the studio loads to
 * get/cache available languages and the available translations for the default (English)
 * language". This effect is that. Nothing here blocks first paint: the selects render
 * immediately with their placeholders and fill in as the reads land. The BFF caches
 * server-side for the process TTL, so the second studio open costs nothing upstream.
 *
 * ── Why every failure is silent-but-visible ─────────────────────────────────────────
 * Each fetcher resolves `null` on any failure rather than throwing, so a dead upstream
 * can never take the editor down. `null` (couldn't ask) and `[]` (asked; genuinely none)
 * are kept distinct: the first disables the select and shows a message, the second shows
 * an honestly empty list.
 *
 * ── Where the picked verse goes ─────────────────────────────────────────────────────
 * One `PICK_SCRIPTURE` action writes the script, the reference and the translation onto
 * the selected scene together. The caption needs no separate wiring at all —
 * `visibleCaption(scene) === scene.script`, which is also what makes item 2 work.
 */
export default function ScripturePicker() {
  const { state, pickScripture } = useStudio();
  const { selectedSceneId } = state;

  const [selection, setSelection] = useState<ScriptureSelection>({
    ...EMPTY_SELECTION,
    languageTag: DEFAULT_LANGUAGE_TAG,
  });
  const [languages, setLanguages] = useState<BibleLanguage[] | null>(null);
  const [translations, setTranslations] = useState<Keyed<BibleTranslation> | null>(null);
  const [failed, setFailed] = useState(false);

  // The three dependent lists are stored KEYED by the selection that produced them, and
  // read back only when the key still matches. That is what makes the cascade reset free:
  // changing the book instantly invalidates the chapter list because its key no longer
  // matches, with no synchronous `setState(null)` inside an effect (which React's
  // `set-state-in-effect` rule flags, correctly — it triggers a cascading render, and it
  // also leaves a one-frame window where a stale list is still on screen).
  const [books, setBooks] = useState<Keyed<BibleBookRef> | null>(null);
  const [chapters, setChapters] = useState<Keyed<BibleChapterRef> | null>(null);
  const [verses, setVerses] = useState<Keyed<BibleVerseRef> | null>(null);

  // First load: the language catalogue. This is the "lazily query the first time the
  // studio loads" the task asks for; the selects paint immediately with placeholders and
  // fill in behind it, so nothing here blocks first paint.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const langs = await fetchBibleLanguages();
      if (!alive) return;
      setLanguages(langs);
      if (!langs) setFailed(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // The chosen language's collection, and the ASV pre-selection (USER DECISION D1) made
  // FROM it. Keyed like the lists below, which is what makes a slow answer for a language
  // the user has already left unable to overwrite a newer one — the classic dropdown race.
  const languageTag = selection.languageTag ?? "";
  useEffect(() => {
    if (!languageTag) return;
    let alive = true;
    void (async () => {
      const items = await fetchBibleTranslations(languageTag);
      if (!alive) return;
      setTranslations({ key: languageTag, items });
      if (!items) {
        setFailed(true);
        return;
      }
      const preferred = defaultTranslation(items);
      // Guard again inside the updater: the user may have moved on between the await
      // resolving and React applying this.
      if (preferred) {
        setSelection((s) =>
          s.languageTag === languageTag ? selectTranslation(s, preferred) : s,
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [languageTag]);

  // Books follow the chosen translation; chapters follow the book; verses follow the
  // chapter. Each effect only ever writes AFTER its await, so nothing here sets state
  // synchronously in an effect body.
  const bibleId = selection.bibleId;
  const book = selection.book;
  const chapter = selection.chapter;

  const booksKey = bibleId ?? "";
  const chaptersKey = bibleId && book ? `${bibleId}|${book}` : "";
  const versesKey = bibleId && book && chapter ? `${bibleId}|${book}|${chapter}` : "";

  useEffect(() => {
    if (!booksKey) return;
    let alive = true;
    void (async () => {
      const items = await fetchBibleBooks(booksKey);
      if (alive) setBooks({ key: booksKey, items });
    })();
    return () => {
      alive = false;
    };
  }, [booksKey]);

  useEffect(() => {
    if (!chaptersKey) return;
    const [id, usfm] = chaptersKey.split("|");
    let alive = true;
    void (async () => {
      const items = await fetchBibleChapters(id, usfm);
      if (alive) setChapters({ key: chaptersKey, items });
    })();
    return () => {
      alive = false;
    };
  }, [chaptersKey]);

  useEffect(() => {
    if (!versesKey) return;
    const [id, usfm, ch] = versesKey.split("|");
    let alive = true;
    void (async () => {
      const items = await fetchBibleVerses(id, usfm, ch);
      if (alive) setVerses({ key: versesKey, items });
    })();
    return () => {
      alive = false;
    };
  }, [versesKey]);

  const translationOptions =
    translations?.key === languageTag ? translations.items : null;
  const bookOptions = books?.key === booksKey ? books.items : null;
  const chapterOptions = chapters?.key === chaptersKey ? chapters.items : null;
  const verseOptions = verses?.key === versesKey ? verses.items : null;

  const onVerse = (passageId: string) => {
    setSelection(selectVerse(selection, passageId || null));
    if (!passageId || !selection.bibleId || !selection.translationAbbreviation) return;
    // The passage is requested with the verse's OWN `passage_id`, handed to us by the
    // verses route. No USFM reference is ever assembled here.
    void (async () => {
      const passage = await fetchBiblePassage(selection.bibleId!, passageId);
      if (!passage) {
        setFailed(true);
        return;
      }
      pickScripture(scripturePick(passage, selection.translationAbbreviation!));
    })();
  };

  return (
    <div data-testid="scripture-picker" data-scene={selectedSceneId}>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <Field
          testid="picker-language"
          label="LANGUAGE"
          value={selection.languageTag ?? ""}
          placeholder="select language"
          disabled={!languages}
          options={(languages ?? []).map((l) => ({
            value: l.tag,
            label: l.endonym && l.endonym !== l.name ? `${l.name} · ${l.endonym}` : l.name,
          }))}
          onChange={(tag) => setSelection(selectLanguage(selection, tag || null))}
        />
        <Field
          testid="picker-translation"
          label="TRANSLATION"
          value={selection.bibleId ?? ""}
          placeholder="select translation"
          disabled={!translationOptions}
          options={(translationOptions ?? []).map((t) => ({
            value: t.id,
            label: `${t.abbreviation} · ${t.title}`,
          }))}
          onChange={(id) =>
            setSelection(
              selectTranslation(
                selection,
                (translationOptions ?? []).find((t) => t.id === id) ?? null,
              ),
            )
          }
        />
        <div style={{ display: "flex", gap: 9 }}>
          <Field
            testid="picker-book"
            label="BOOK"
            value={selection.book ?? ""}
            placeholder="select book"
            disabled={!bookOptions}
            options={(bookOptions ?? []).map((b) => ({ value: b.usfm, label: b.title }))}
            onChange={(usfm) => setSelection(selectBook(selection, usfm || null))}
          />
          <Field
            testid="picker-chapter"
            label="CHAPTER"
            value={selection.chapter ?? ""}
            placeholder="select chapter"
            disabled={!chapterOptions}
            options={(chapterOptions ?? []).map((c) => ({ value: c.id, label: c.title }))}
            onChange={(id) => setSelection(selectChapter(selection, id || null))}
          />
          <Field
            testid="picker-verse"
            label="VERSE"
            value={selection.versePassageId ?? ""}
            placeholder="select verse"
            disabled={!verseOptions}
            options={(verseOptions ?? []).map((v) => ({ value: v.passageId, label: v.title }))}
            onChange={onVerse}
          />
        </div>
        {failed ? (
          <div data-testid="picker-error" style={{ fontSize: 11, color: "#e0745a" }}>
            {"Couldn't reach YouVersion — type the verse into the script instead."}
          </div>
        ) : null}
      </div>
    </div>
  );
}
