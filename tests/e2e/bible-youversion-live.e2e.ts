import { describe, expect, it } from "vitest";

import {
  YouVersionHttpError,
  fetchBooks,
  fetchChapters,
  fetchLanguageCatalogue,
  fetchPassage,
  fetchTranslations,
  fetchVerses,
} from "../../lib/youversion/client";
import { DEFAULT_LANGUAGE_TAG } from "../../lib/studio/scripture-picker";

/**
 * The LIVE contract for the Bible read surface (task item 1) — real
 * `api.youversion.com`, real app key, no stub.
 *
 * design-delta §11.2 is uniform across all four providers: *an e2e test either exercises
 * the real provider or does not exercise that provider at all.* §10.4a adds the direction
 * of travel: *if the live routes differ, the client changes, not the tests.* So this
 * suite is the one place the client's route shapes are allowed to be checked, and every
 * assertion below was MEASURED on 2026-07-27 before it was written.
 *
 * Deterministic misbehaviour (a 204 body, a 401, a malformed page) is a SIMULATION and
 * therefore a unit concern (§10.6) — those live in `lib/youversion/client.test.ts`. The
 * one exception is E-YV4: the empty-body 204 is a live behaviour of a real language with
 * no bibles, and it is the single shape most likely to change under us.
 *
 * No browser here, deliberately: the lane's Compose global setup is already paid for by
 * its sibling specs, and a Stagehand session would add minutes to prove nothing this
 * suite does not already prove about the provider.
 *
 * ── The English tag is IMPORTED, not written down ────────────────────────────────────
 * Every English probe below goes through `DEFAULT_LANGUAGE_TAG` — the same constant the
 * picker sends. It used to be the literal `"eng"`, which is NOT what the app asks for:
 * `lib/studio/scripture-picker.ts` opens on `"en"`, and E-YV2 proves the live catalogue's
 * own tags are the two-letter form. A suite that probes a tag the app never sends can go
 * green while the app's actual request 404s, which is the one failure this file exists to
 * catch. All four call sites use the constant, including E-YV4b's where the tag is
 * incidental, so nobody has to work out later which literal was deliberate.
 */

const APP_KEY = process.env.YOUVERSION_APP_KEY ?? process.env.YV_APP_KEY ?? "";

/** §10.8: a required secret THROWS with an actionable message naming the variable.
 *  A gating suite that silently skips its provider tests is a green lie. */
if (!APP_KEY) {
  throw new Error(
    "YOUVERSION_APP_KEY is missing. The Bible live-contract suite calls " +
      "https://api.youversion.com with the real app key. Set YOUVERSION_APP_KEY in the " +
      "ROOT repo's untracked .env (see its .env.example) — the real e2e lane loads it " +
      "into each worker via tests/e2e/load-root-env.ts.",
  );
}

const deps = { appKey: APP_KEY };

/** ASV — USER DECISION D1's default. Resolved from the live collection below, never
 *  assumed; this is only the abbreviation we look for. */
const ASV = "ASV";

describe("YouVersion live contract — catalogue", () => {
  it("E-YV1: the language catalogue is non-trivial and every entry actually has a bible", async () => {
    const languages = await fetchLanguageCatalogue(deps);

    expect(languages.length).toBeGreaterThan(1000);
    // no duplicates — the join must not fan out
    expect(new Set(languages.map((l) => l.tag)).size).toBe(languages.length);
    for (const l of languages) {
      expect(l.tag.length).toBeGreaterThan(0);
      expect(l.name.length).toBeGreaterThan(0);
      expect(["ltr", "rtl"]).toContain(l.direction);
    }

    // `aab` has a language record AND a non-null default_bible_id, but its bible query
    // returns 204 — so it must NOT be in a list that claims "languages with bibles".
    expect(languages.map((l) => l.tag)).not.toContain("aab");
  });

  it("E-YV2: direction comes from the provider — English ltr, Hebrew/Arabic rtl", async () => {
    const languages = await fetchLanguageCatalogue(deps);
    const by = new Map(languages.map((l) => [l.tag, l]));

    expect(by.get("en")?.direction).toBe("ltr");
    const rtl = languages.filter((l) => l.direction === "rtl").map((l) => l.tag);
    expect(rtl.length).toBeGreaterThan(0);
    expect(rtl).toContain("ar");
    expect(rtl).toContain("he");
  });

  it("E-YV3: the app's English grant contains ASV and BSB and does NOT contain KJV (the premise of USER DECISION D1)", async () => {
    const english = await fetchTranslations(DEFAULT_LANGUAGE_TAG, deps);
    const abbreviations = english.map((t) => t.abbreviation);

    expect(abbreviations).toContain(ASV);
    expect(abbreviations).toContain("BSB");
    // If this ever fails, KJV became licensed to our app key and D1's rationale
    // ("KJV is not licensed to us") should be revisited — it is not a client bug.
    expect(abbreviations).not.toContain("KJV");

    // ids are numeric on the wire and must survive as strings
    for (const t of english) expect(t.id).toMatch(/^\d+$/);
  });

  it("E-YV4: a language with ZERO bibles answers 204 with an empty body — and yields [], not a parse crash", async () => {
    await expect(fetchTranslations("aab", deps)).resolves.toEqual([]);
  });

  it("E-YV4b: a bad app key is a distinguishable 401, not a silent empty list", async () => {
    const err = await fetchTranslations(DEFAULT_LANGUAGE_TAG, {
      appKey: "definitely-not-a-real-key",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(YouVersionHttpError);
    expect((err as YouVersionHttpError).status).toBe(401);
  });
});

describe("YouVersion live contract — the picker's walk", () => {
  it("E-YV5: ASV → books → chapters → verses → passage, entirely by ECHOED passage_id", async () => {
    const english = await fetchTranslations(DEFAULT_LANGUAGE_TAG, deps);
    const asv = english.find((t) => t.abbreviation === ASV);
    expect(asv, "ASV must be in the live English collection").toBeTruthy();

    const books = await fetchBooks(asv!.id, deps);
    // canon is a property of the TRANSLATION, never a hardcoded 66-book table
    expect(books.length).toBeGreaterThan(0);
    const genesis = books.find((b) => b.usfm === "GEN");
    expect(genesis?.title).toBe("Genesis");
    expect(genesis?.canon).toBe("old_testament");
    // the thin slice must not be carrying the 1.59 MB tree
    expect(JSON.stringify(books).length).toBeLessThan(20_000);

    const chapters = await fetchChapters(asv!.id, "GEN", deps);
    expect(chapters.length).toBe(50);
    expect(chapters[0].passageId).toBe("GEN.1");

    const verses = await fetchVerses(asv!.id, "GEN", chapters[0].id, deps);
    expect(verses.length).toBe(31);
    expect(verses[0].passageId).toBe("GEN.1.1");

    const passage = await fetchPassage(asv!.id, verses[0].passageId, deps);
    expect(passage.passageId).toBe("GEN.1.1");
    expect(passage.reference).toBe("Genesis 1:1");
    expect(passage.text).toBe(
      "In the beginning God created the heavens and the earth.",
    );
  });

  it("E-YV6: the same walk on an RTL translation returns RTL content and keeps YouVersion's own bidi mark", async () => {
    const arabic = await fetchTranslations("ar", deps);
    expect(arabic.length).toBeGreaterThan(0);

    const bible = arabic[0];
    const books = await fetchBooks(bible.id, deps);
    // book titles come back in the translation's own script
    expect(books.find((b) => b.usfm === "GEN")?.title).toMatch(/[؀-ۿ]/);

    const verses = await fetchVerses(bible.id, "GEN", "1", deps);
    const passage = await fetchPassage(bible.id, verses[0].passageId, deps);

    expect(passage.text).toMatch(/[؀-ۿ]/);
    // U+200E LEFT-TO-RIGHT MARK, emitted by YouVersion around the numerals. We must not
    // strip or re-format it — the reference is rendered verbatim.
    expect(passage.reference).toContain("‎");
  });

  it("E-YV6b: an unknown USFM ref is a typed 404, never an empty passage", async () => {
    const english = await fetchTranslations(DEFAULT_LANGUAGE_TAG, deps);
    const asv = english.find((t) => t.abbreviation === ASV)!;
    const err = await fetchPassage(asv.id, "GEN.999.999", deps).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(YouVersionHttpError);
    expect((err as YouVersionHttpError).status).toBe(404);
  });
});
