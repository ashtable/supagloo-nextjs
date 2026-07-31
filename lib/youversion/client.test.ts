/**
 * Unit proofs for the server-side YouVersion Platform client.
 *
 * Everything here runs against an INJECTED fetch — design-delta §10.6: deterministic
 * provider misbehaviour (a 204, a 401, a malformed page) is by definition a simulation,
 * so it is a unit concern. The LIVE contract is pinned separately in the real e2e lane
 * (`tests/e2e/bible-youversion-live.e2e.ts`), per §11.2.
 *
 * The shapes asserted below are the ones MEASURED against api.youversion.com on
 * 2026-07-27 (scratch/task-genesis1-render-bugs.md §0) — not the ones the docs or the
 * `@youversion/platform-core` SDK claim.
 */
import { describe, expect, it, vi } from "vitest";

import {
  CATALOGUE_ACCEPT_ENCODING,
  YOUVERSION_BASE_URL,
  YouVersionHttpError,
  fetchBooks,
  fetchChapters,
  fetchLanguageCatalogue,
  fetchPassage,
  fetchTranslations,
  fetchVerses,
} from "./client";

const APP_KEY = "test-app-key";

/** A JSON 200. */
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** The real 204 shape: `content-type: text/html`, ZERO bytes of body. */
function noContent(): Response {
  return new Response(null, { status: 204, headers: { "content-type": "text/html" } });
}

/** A fetch stub that answers by URL substring, recording every call. */
function router(routes: Array<[string, () => Response]>) {
  const calls: string[] = [];
  const headers: Array<Record<string, string>> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    headers.push({ ...((init?.headers ?? {}) as Record<string, string>) });
    for (const [needle, make] of routes) if (url.includes(needle)) return make();
    throw new Error(`unrouted fetch: ${url}`);
  });
  return { impl: impl as unknown as typeof fetch, calls, headers };
}

const CATALOGUE = {
  data: [
    { id: 12, abbreviation: "ASV", language_tag: "en" },
    { id: 3034, abbreviation: "BSB", language_tag: "en" },
    { id: 101, abbreviation: "NAV", language_tag: "ar" },
    // a bible whose language has NO /v1/languages record (measured: 12 such tags)
    { id: 999, abbreviation: "XX", language_tag: "es-ES" },
  ],
  total_size: 4,
};

const LANGUAGES = {
  data: [
    { id: "en", text_direction: "ltr", display_names: { en: "English" } },
    { id: "ar", text_direction: "rtl", display_names: { en: "Arabic", ar: "العربية" } },
    // a language with NO bible — must not reach the picker
    { id: "aab", text_direction: "ltr", display_names: { en: "Alumu-Tesu" } },
    // MEASURED disagreement class: the API says ltr, Intl says rtl. The API wins.
    { id: "kby", text_direction: "ltr", display_names: { en: "Kanuri, Manga" } },
  ],
  total_size: 4,
};

function catalogueRouter() {
  return router([
    ["/v1/bibles?language_ranges", () => json(CATALOGUE)],
    ["/v1/languages?", () => json(LANGUAGES)],
  ]);
}

describe("fetchLanguageCatalogue", () => {
  it("U-YV1: takes exactly two one-shot requests (page_size=* + 1-3 fields[]) and sends the app key", async () => {
    const r = catalogueRouter();
    await fetchLanguageCatalogue({ appKey: APP_KEY, fetchImpl: r.impl });

    expect(r.calls).toHaveLength(2);
    const [bibles, languages] = r.calls;

    expect(bibles.startsWith(`${YOUVERSION_BASE_URL}/v1/bibles?`)).toBe(true);
    const bq = new URL(bibles).searchParams;
    expect(bq.getAll("language_ranges[]")).toEqual(["*"]);
    expect(bq.get("page_size")).toBe("*");
    // page_size=* is only legal with 1..3 fields — assert the bound, not one spelling.
    expect(bq.getAll("fields[]").length).toBeGreaterThanOrEqual(1);
    expect(bq.getAll("fields[]").length).toBeLessThanOrEqual(3);

    const lq = new URL(languages).searchParams;
    expect(lq.get("page_size")).toBe("*");
    expect(lq.getAll("fields[]").length).toBeGreaterThanOrEqual(1);
    expect(lq.getAll("fields[]").length).toBeLessThanOrEqual(3);

    for (const h of r.headers) {
      expect(h["x-yvp-app-key"]).toBe(APP_KEY);
    }
  });

  /**
   * The stale-cache-variant workaround, pinned from BOTH sides.
   *
   * `lib/youversion/client.ts` sends an explicit `Accept-Encoding` on the
   * `language_ranges[]=*` catalogue request because the same URL WITHOUT one lands on a
   * stale upstream cache variant that silently drops ~6 languages (measured 2026-07-31:
   * 1472 rows / 1252 tags vs 1479 / 1258 — see `CATALOGUE_ACCEPT_ENCODING`).
   *
   * Two claims, and the second is the one that stops this from being cargo cult:
   *  1. the catalogue request carries it — so deleting the workaround is RED here, not
   *     merely a quieter picker in production;
   *  2. the other six requests do NOT — the staleness was measured on exactly one index,
   *     and widening a third-party cache workaround to routes nobody probed should cost a
   *     deliberate test edit.
   *
   * The header's live EFFECT cannot be asserted from a unit test (it is a property of
   * YouVersion's cache, not of our code); `E-YV1b` in the real lane holds that half.
   */
  it("U-YV1b: an explicit Accept-Encoding is pinned to the `*` catalogue request AND to nothing else", async () => {
    const r = catalogueRouter();
    await fetchLanguageCatalogue({ appKey: APP_KEY, fetchImpl: r.impl });

    const sent = new Map(r.calls.map((url, i) => [url, r.headers[i]!]));
    const catalogue = r.calls.find((u) => u.includes("/v1/bibles?language_ranges"))!;
    const languages = r.calls.find((u) => u.includes("/v1/languages?"))!;
    expect(catalogue).toBeDefined();
    expect(languages).toBeDefined();

    expect(sent.get(catalogue)?.["accept-encoding"]).toBe(CATALOGUE_ACCEPT_ENCODING);
    // the sibling request in the SAME function — a different index, measured NOT stale
    expect(sent.get(languages)?.["accept-encoding"]).toBeUndefined();

    // …and every other read on the surface. Driven for real rather than asserted about,
    // so a future call added to any of them inherits the check.
    const other = router([
      ["/v1/bibles?language_ranges", () => json({ data: [], total_size: 0 })],
      ["/books/GEN/chapters/1/verses", () => json({ data: [] })],
      ["/books/GEN/chapters", () => json({ data: [] })],
      ["/books", () => json({ data: [] })],
      ["/passages/", () => json({ id: "GEN.1.1", content: "x", reference: "Gen 1:1" })],
    ]);
    const deps = { appKey: APP_KEY, fetchImpl: other.impl };
    await fetchTranslations("en", deps);
    await fetchBooks("12", deps);
    await fetchChapters("12", "GEN", deps);
    await fetchVerses("12", "GEN", "1", deps);
    await fetchPassage("12", "GEN.1.1", deps);

    expect(other.calls).toHaveLength(5);
    for (const h of other.headers) {
      expect(h["accept-encoding"]).toBeUndefined();
      expect(h["x-yvp-app-key"]).toBe(APP_KEY);
    }
  });

  it("U-YV2: only languages that actually HAVE a bible survive; a bible tag with no language record still appears", async () => {
    const r = catalogueRouter();
    const langs = await fetchLanguageCatalogue({ appKey: APP_KEY, fetchImpl: r.impl });
    const tags = langs.map((l) => l.tag);

    expect(tags).toContain("en");
    expect(tags).toContain("ar");
    // has a bible, has no /v1/languages record → still offered (name/direction from Intl)
    expect(tags).toContain("es-ES");
    // has a language record, has NO bible → must never be offered
    expect(tags).not.toContain("aab");

    const es = langs.find((l) => l.tag === "es-ES");
    expect(es?.name.length).toBeGreaterThan(0);
    expect(es?.direction).toBe("ltr");
  });

  it("U-YV3: the API's text_direction WINS over an Intl disagreement", async () => {
    // `kby` is a measured disagreement: /v1/languages says ltr, Intl says rtl.
    const withKby = {
      data: [...CATALOGUE.data, { id: 77, abbreviation: "KB", language_tag: "kby" }],
      total_size: 5,
    };
    const r = router([
      ["/v1/bibles?language_ranges", () => json(withKby)],
      ["/v1/languages?", () => json(LANGUAGES)],
    ]);
    const langs = await fetchLanguageCatalogue({ appKey: APP_KEY, fetchImpl: r.impl });

    expect(langs.find((l) => l.tag === "kby")?.direction).toBe("ltr");
    expect(langs.find((l) => l.tag === "ar")?.direction).toBe("rtl");
    expect(langs.find((l) => l.tag === "en")?.direction).toBe("ltr");
  });

  it("U-YV2b: carries the English name and the endonym off display_names, with no local name table", async () => {
    const r = catalogueRouter();
    const langs = await fetchLanguageCatalogue({ appKey: APP_KEY, fetchImpl: r.impl });
    const ar = langs.find((l) => l.tag === "ar");
    expect(ar?.name).toBe("Arabic");
    expect(ar?.endonym).toBe("العربية");
  });
});

describe("fetchTranslations", () => {
  it("U-YV4: a 204 with an EMPTY body yields [] — parsing it would throw", async () => {
    const r = router([["/v1/bibles?", () => noContent()]]);
    await expect(
      fetchTranslations("aab", { appKey: APP_KEY, fetchImpl: r.impl }),
    ).resolves.toEqual([]);
  });

  it("U-YV5: a non-ok status throws YouVersionHttpError carrying the status", async () => {
    for (const status of [401, 404, 422, 500]) {
      const r = router([
        ["/v1/bibles?", () => new Response("nope", { status })],
      ]);
      const err = await fetchTranslations("en", {
        appKey: APP_KEY,
        fetchImpl: r.impl,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(YouVersionHttpError);
      expect((err as YouVersionHttpError).status).toBe(status);
    }
  });

  it("U-YV6: follows next_page_token and stops when it is absent", async () => {
    let call = 0;
    const impl = vi.fn(async (input: RequestInfo | URL) => {
      call += 1;
      const url = new URL(String(input));
      if (call === 1) {
        expect(url.searchParams.get("page_token")).toBeNull();
        return json({
          data: [{ id: 12, abbreviation: "ASV", title: "American Standard Version" }],
          next_page_token: "tok-2",
        });
      }
      expect(url.searchParams.get("page_token")).toBe("tok-2");
      return json({
        data: [{ id: 3034, abbreviation: "BSB", title: "Berean Standard Bible" }],
      });
    });
    const out = await fetchTranslations("en", {
      appKey: APP_KEY,
      fetchImpl: impl as unknown as typeof fetch,
    });
    expect(call).toBe(2);
    expect(out.map((t) => t.abbreviation)).toEqual(["ASV", "BSB"]);
    // the wire id is a NUMBER and must be stringified (34-E5's finding, still true)
    expect(out[0].id).toBe("12");
  });

  it("U-YV6b: sends exactly one language_ranges[] (repeated params do NOT union upstream)", async () => {
    const r = router([["/v1/bibles?", () => json({ data: [] })]]);
    await fetchTranslations("arb", { appKey: APP_KEY, fetchImpl: r.impl });
    const q = new URL(r.calls[0]).searchParams;
    expect(q.getAll("language_ranges[]")).toEqual(["arb"]);
  });
});

describe("fetchBooks", () => {
  const BOOKS = {
    data: [
      {
        id: "GEN",
        title: "Genesis",
        full_title: "The First Book of Moses",
        abbreviation: "Gen.",
        canon: "old_testament",
        chapters: [
          {
            id: "1",
            passage_id: "GEN.1",
            title: "1",
            verses: [{ id: "1", passage_id: "GEN.1.1", title: "1" }],
          },
        ],
      },
      { id: "MAT", title: "Matthew", canon: "new_testament", chapters: [] },
    ],
  };

  it("U-YV7: projects the 1.59 MB tree to {usfm,title,canon} and DROPS the nested chapters", async () => {
    const r = router([["/books", () => json(BOOKS)]]);
    const books = await fetchBooks("12", { appKey: APP_KEY, fetchImpl: r.impl });

    expect(books).toEqual([
      { usfm: "GEN", title: "Genesis", canon: "old_testament" },
      { usfm: "MAT", title: "Matthew", canon: "new_testament" },
    ]);
    // the serialized slice must not carry the tree the browser must never receive
    expect(JSON.stringify(books)).not.toContain("chapters");
    expect(JSON.stringify(books)).not.toContain("GEN.1.1");
  });

  it("U-YV7b: the canon is whatever the translation says — no 66-book assumption", async () => {
    const apocryphal = {
      data: [{ id: "TOB", title: "Tobit", canon: "apocrypha", chapters: [] }],
    };
    const r = router([["/books", () => json(apocryphal)]]);
    const books = await fetchBooks("42", { appKey: APP_KEY, fetchImpl: r.impl });
    expect(books).toEqual([{ usfm: "TOB", title: "Tobit", canon: "apocrypha" }]);
  });
});

describe("fetchChapters / fetchVerses", () => {
  it("U-YV8: ECHOES passage_id — no USFM reference is ever assembled from parts", async () => {
    const chapters = router([
      [
        "/chapters",
        () =>
          json({
            data: [
              // A deliberately NON-derivable passage_id: if the client built the ref
              // from bookUsfm + chapter id it would produce "GEN.1", not this.
              { id: "1", passage_id: "GEN.ONE", title: "1" },
            ],
          }),
      ],
    ]);
    const ch = await fetchChapters("12", "GEN", {
      appKey: APP_KEY,
      fetchImpl: chapters.impl,
    });
    expect(ch).toEqual([{ id: "1", passageId: "GEN.ONE", title: "1" }]);
    expect(chapters.calls[0]).toContain("/v1/bibles/12/books/GEN/chapters");

    const verses = router([
      [
        "/verses",
        () => json({ data: [{ id: "1", passage_id: "GEN.ONE.ALPHA", title: "1" }] }),
      ],
    ]);
    const vs = await fetchVerses("12", "GEN", "1", {
      appKey: APP_KEY,
      fetchImpl: verses.impl,
    });
    expect(vs).toEqual([{ id: "1", passageId: "GEN.ONE.ALPHA", title: "1" }]);
    expect(verses.calls[0]).toContain("/v1/bibles/12/books/GEN/chapters/1/verses");
  });
});

describe("fetchPassage", () => {
  it("U-YV9: returns {passageId,text,reference} and preserves YouVersion's own bidi marks", async () => {
    // The measured Arabic reference carries an embedded U+200E LEFT-TO-RIGHT MARK.
    const reference = "التكوين ‎1:1";
    const r = router([
      [
        "/passages/",
        () =>
          json({
            id: "GEN.1.1",
            content: "فِي الْبَدْءِ خَلَقَ اللهُ",
            reference,
          }),
      ],
    ]);
    const p = await fetchPassage("101", "GEN.1.1", {
      appKey: APP_KEY,
      fetchImpl: r.impl,
    });
    expect(p.passageId).toBe("GEN.1.1");
    expect(p.text).toBe("فِي الْبَدْءِ خَلَقَ اللهُ");
    expect(p.reference).toBe(reference);
    expect(p.reference).toContain("‎");
    expect(r.calls[0]).toBe(`${YOUVERSION_BASE_URL}/v1/bibles/101/passages/GEN.1.1`);
  });

  it("U-YV9b: a 404 on an unknown ref surfaces as a typed error, not an empty passage", async () => {
    const r = router([["/passages/", () => new Response("", { status: 404 })]]);
    const err = await fetchPassage("12", "ZZZ.9.9", {
      appKey: APP_KEY,
      fetchImpl: r.impl,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(YouVersionHttpError);
    expect((err as YouVersionHttpError).status).toBe(404);
  });
});
