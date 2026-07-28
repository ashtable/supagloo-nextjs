import { z } from "zod";

/**
 * The THIN wire shapes the `app/api/bible/**` BFF routes serve, and the browser reads.
 *
 * These are deliberately NOT mirrors of YouVersion's own payloads. The upstream
 * `GET /v1/bibles/{id}/books` response is **1.59 MB** for a 66-book translation
 * (measured 2026-07-27) because every book carries its full chapter → verse tree, and
 * `fields[]` / `page_size` are ignored on that route. Sending that to a browser to
 * populate a dropdown would be indefensible, so the BFF projects each level down to the
 * two or three fields the picker actually renders.
 *
 * They are also NOT mirrors of any db-lib schema. Nothing here crosses a service
 * boundary other than nextjs → browser, so there is no fourth-mirror problem and no
 * release chain: this file is the single authored home of these shapes.
 *
 * ── `passageId` is ECHOED, never constructed ────────────────────────────────────────
 * Every chapter and verse carries YouVersion's own `passage_id` (`"GEN.1"`, `"GEN.1.1"`),
 * which is exactly the USFM reference the passage endpoint wants. We hand it straight
 * back. Task 34-E5 recorded "producing USFM from a selection is unbuilt residual risk";
 * echoing closes that risk instead of taking it on.
 */

/** A language that ACTUALLY has at least one Bible licensed to our app key. */
export const BibleLanguageSchema = z.object({
  /** The `language_tag` the Bible collection reports (`"en"`, `"zh-Hant-TW"`). */
  tag: z.string().min(1),
  /** English display name, from `/v1/languages[].display_names.en`. */
  name: z.string().min(1),
  /** The endonym, when the provider has one. */
  endonym: z.string().min(1).optional(),
  /** Authoritative text direction. See the client for the resolution order. */
  direction: z.enum(["ltr", "rtl"]),
});
export type BibleLanguage = z.infer<typeof BibleLanguageSchema>;

/** One Bible in a language's collection. `id` is a NUMBER on the wire; we stringify it
 *  because it is both the path segment of every downstream call and a lookup key. */
export const BibleTranslationSchema = z.object({
  id: z.string().min(1),
  abbreviation: z.string().min(1),
  title: z.string().min(1),
});
export type BibleTranslation = z.infer<typeof BibleTranslationSchema>;

/** A book of a PARTICULAR translation. Canon membership is a property of the
 *  translation (measured: 27 books in TCENT, 80 in engWEBUS), so nothing here may be
 *  filled from db-lib's 66-book `scripture-book.ts` table. */
export const BibleBookRefSchema = z.object({
  usfm: z.string().min(1),
  title: z.string().min(1),
  canon: z.string().min(1),
});
export type BibleBookRef = z.infer<typeof BibleBookRefSchema>;

export const BibleChapterRefSchema = z.object({
  id: z.string().min(1),
  passageId: z.string().min(1),
  title: z.string().min(1),
});
export type BibleChapterRef = z.infer<typeof BibleChapterRefSchema>;

export const BibleVerseRefSchema = z.object({
  id: z.string().min(1),
  passageId: z.string().min(1),
  title: z.string().min(1),
});
export type BibleVerseRef = z.infer<typeof BibleVerseRefSchema>;

/** The verse text itself. `reference` is YouVersion's own human string and may carry
 *  embedded bidi control marks (U+200E on Arabic references) — rendered verbatim. */
export const BiblePassageSchema = z.object({
  passageId: z.string().min(1),
  text: z.string(),
  reference: z.string(),
});
export type BiblePassage = z.infer<typeof BiblePassageSchema>;

// ── response envelopes (one per BFF route) ───────────────────────────────────────────

export const BibleLanguagesResponseSchema = z.object({
  languages: z.array(BibleLanguageSchema),
});
export const BibleTranslationsResponseSchema = z.object({
  translations: z.array(BibleTranslationSchema),
});
export const BibleBooksResponseSchema = z.object({
  books: z.array(BibleBookRefSchema),
});
export const BibleChaptersResponseSchema = z.object({
  chapters: z.array(BibleChapterRefSchema),
});
export const BibleVersesResponseSchema = z.object({
  verses: z.array(BibleVerseRefSchema),
});
export const BiblePassageResponseSchema = z.object({
  passage: BiblePassageSchema,
});
