/**
 * The BROWSER-side fetchers for the six `app/api/bible/**` BFF routes.
 *
 * Same contract as `studio-data.ts` / `render-data.ts`: an injectable `fetch`, and every
 * failure path — non-2xx, a body of the wrong shape, an offline `fetch` rejection —
 * resolves to `null` rather than throwing. The picker renders inside the studio tree, and
 * a throw here would take the whole editor down over a dropdown.
 *
 * `null` is deliberately distinct from `[]`: an empty array is "this language genuinely
 * has no Bibles", which the picker renders as an honest empty select. `null` is "we could
 * not ask", which the picker renders as a disabled select with a message.
 */
import {
  BibleBooksResponseSchema,
  BibleChaptersResponseSchema,
  BibleLanguagesResponseSchema,
  BiblePassageResponseSchema,
  BibleTranslationsResponseSchema,
  BibleVersesResponseSchema,
  type BibleBookRef,
  type BibleChapterRef,
  type BibleLanguage,
  type BiblePassage,
  type BibleTranslation,
  type BibleVerseRef,
} from "../youversion/contracts";

interface FetchDep {
  fetchImpl?: typeof fetch;
}

async function read<T>(
  url: string,
  parse: (body: unknown) => T | null,
  deps: FetchDep,
): Promise<T | null> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return parse(await res.json());
  } catch {
    return null;
  }
}

export function fetchBibleLanguages(
  deps: FetchDep = {},
): Promise<BibleLanguage[] | null> {
  return read("/api/bible/languages", (body) => {
    const parsed = BibleLanguagesResponseSchema.safeParse(body);
    return parsed.success ? parsed.data.languages : null;
  }, deps);
}

export function fetchBibleTranslations(
  languageTag: string,
  deps: FetchDep = {},
): Promise<BibleTranslation[] | null> {
  return read(
    `/api/bible/translations?language=${encodeURIComponent(languageTag)}`,
    (body) => {
      const parsed = BibleTranslationsResponseSchema.safeParse(body);
      return parsed.success ? parsed.data.translations : null;
    },
    deps,
  );
}

export function fetchBibleBooks(
  bibleId: string,
  deps: FetchDep = {},
): Promise<BibleBookRef[] | null> {
  return read(
    `/api/bible/books?bibleId=${encodeURIComponent(bibleId)}`,
    (body) => {
      const parsed = BibleBooksResponseSchema.safeParse(body);
      return parsed.success ? parsed.data.books : null;
    },
    deps,
  );
}

export function fetchBibleChapters(
  bibleId: string,
  book: string,
  deps: FetchDep = {},
): Promise<BibleChapterRef[] | null> {
  return read(
    `/api/bible/chapters?bibleId=${encodeURIComponent(bibleId)}&book=${encodeURIComponent(book)}`,
    (body) => {
      const parsed = BibleChaptersResponseSchema.safeParse(body);
      return parsed.success ? parsed.data.chapters : null;
    },
    deps,
  );
}

export function fetchBibleVerses(
  bibleId: string,
  book: string,
  chapter: string,
  deps: FetchDep = {},
): Promise<BibleVerseRef[] | null> {
  return read(
    `/api/bible/verses?bibleId=${encodeURIComponent(bibleId)}` +
      `&book=${encodeURIComponent(book)}&chapter=${encodeURIComponent(chapter)}`,
    (body) => {
      const parsed = BibleVersesResponseSchema.safeParse(body);
      return parsed.success ? parsed.data.verses : null;
    },
    deps,
  );
}

/** `usfm` is a `passage_id` handed out by the verses route — echoed, never rebuilt. */
export function fetchBiblePassage(
  bibleId: string,
  usfm: string,
  deps: FetchDep = {},
): Promise<BiblePassage | null> {
  return read(
    `/api/bible/passage?bibleId=${encodeURIComponent(bibleId)}&usfm=${encodeURIComponent(usfm)}`,
    (body) => {
      const parsed = BiblePassageResponseSchema.safeParse(body);
      return parsed.success ? parsed.data.passage : null;
    },
    deps,
  );
}
