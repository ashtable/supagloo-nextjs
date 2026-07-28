/**
 * The browser-side fetchers for the six `app/api/bible/**` BFF routes.
 *
 * Same contract as every other studio data module (`studio-data.ts`,
 * `render-data.ts`): injected `fetch`, and a non-2xx / malformed body resolves to
 * `null` rather than throwing. The picker renders inside the studio tree, so a
 * throw here would take the whole editor down over a dropdown.
 */
import { describe, expect, it, vi } from "vitest";

import {
  fetchBibleBooks,
  fetchBibleChapters,
  fetchBiblePassage,
  fetchBibleTranslations,
  fetchBibleVerses,
  fetchBibleLanguages,
} from "./scripture-data";

function ok(body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

function status(code: number) {
  return vi.fn(async () => new Response("", { status: code })) as unknown as typeof fetch;
}

describe("scripture-data", () => {
  it("U-SD1: languages — calls /api/bible/languages and unwraps the envelope", async () => {
    const fetchImpl = ok({
      languages: [{ tag: "en", name: "English", direction: "ltr" }],
    });
    const out = await fetchBibleLanguages({ fetchImpl });
    expect(out).toEqual([{ tag: "en", name: "English", direction: "ltr" }]);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe("/api/bible/languages");
  });

  it("U-SD2: translations — the language tag rides the query string, url-encoded", async () => {
    const fetchImpl = ok({
      translations: [{ id: "12", abbreviation: "ASV", title: "American Standard Version" }],
    });
    const out = await fetchBibleTranslations("zh-Hant-TW", { fetchImpl });
    expect(out).toEqual([
      { id: "12", abbreviation: "ASV", title: "American Standard Version" },
    ]);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe(
      "/api/bible/translations?language=zh-Hant-TW",
    );
  });

  it("U-SD3: books", async () => {
    const fetchImpl = ok({
      books: [{ usfm: "GEN", title: "Genesis", canon: "old_testament" }],
    });
    const out = await fetchBibleBooks("12", { fetchImpl });
    expect(out).toEqual([{ usfm: "GEN", title: "Genesis", canon: "old_testament" }]);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe("/api/bible/books?bibleId=12");
  });

  it("U-SD4: chapters", async () => {
    const fetchImpl = ok({ chapters: [{ id: "1", passageId: "GEN.1", title: "1" }] });
    const out = await fetchBibleChapters("12", "GEN", { fetchImpl });
    expect(out).toEqual([{ id: "1", passageId: "GEN.1", title: "1" }]);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe(
      "/api/bible/chapters?bibleId=12&book=GEN",
    );
  });

  it("U-SD5: verses", async () => {
    const fetchImpl = ok({ verses: [{ id: "1", passageId: "GEN.1.1", title: "1" }] });
    const out = await fetchBibleVerses("12", "GEN", "1", { fetchImpl });
    expect(out).toEqual([{ id: "1", passageId: "GEN.1.1", title: "1" }]);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe(
      "/api/bible/verses?bibleId=12&book=GEN&chapter=1",
    );
  });

  it("U-SD6: passage — the USFM ref is ECHOED into the query, never rebuilt from parts", async () => {
    const fetchImpl = ok({
      passage: { passageId: "GEN.1.1", text: "In the beginning", reference: "Genesis 1:1" },
    });
    const out = await fetchBiblePassage("12", "GEN.1.1", { fetchImpl });
    expect(out).toEqual({
      passageId: "GEN.1.1",
      text: "In the beginning",
      reference: "Genesis 1:1",
    });
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe(
      "/api/bible/passage?bibleId=12&usfm=GEN.1.1",
    );
  });

  it("U-SD7: every fetcher resolves NULL on a non-2xx — never a throw into the render tree", async () => {
    for (const code of [401, 404, 500, 502]) {
      const f = status(code);
      await expect(fetchBibleLanguages({ fetchImpl: f })).resolves.toBeNull();
      await expect(fetchBibleTranslations("en", { fetchImpl: f })).resolves.toBeNull();
      await expect(fetchBibleBooks("12", { fetchImpl: f })).resolves.toBeNull();
      await expect(fetchBibleChapters("12", "GEN", { fetchImpl: f })).resolves.toBeNull();
      await expect(fetchBibleVerses("12", "GEN", "1", { fetchImpl: f })).resolves.toBeNull();
      await expect(fetchBiblePassage("12", "GEN.1.1", { fetchImpl: f })).resolves.toBeNull();
    }
  });

  it("U-SD8: a body of the WRONG SHAPE resolves NULL rather than handing junk to the select", async () => {
    const wrong = ok({ languages: [{ nope: true }] });
    await expect(fetchBibleLanguages({ fetchImpl: wrong })).resolves.toBeNull();

    const notJson = vi.fn(async () =>
      new Response("<html>gateway</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ) as unknown as typeof fetch;
    await expect(fetchBibleBooks("12", { fetchImpl: notJson })).resolves.toBeNull();
  });

  it("U-SD9: a rejected fetch (offline) resolves NULL", async () => {
    const dead = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(fetchBibleLanguages({ fetchImpl: dead })).resolves.toBeNull();
  });
});
