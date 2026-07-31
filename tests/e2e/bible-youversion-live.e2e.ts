import { describe, expect, it } from "vitest";

import {
  CATALOGUE_ACCEPT_ENCODING,
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

/**
 * Every language YouVersion holds a RECORD for — the ~8.5k superset the ~1.2k catalogue is
 * narrowed down from.
 *
 * Fetched here rather than through `lib/youversion/client.ts` because the client
 * deliberately exposes no such reader: nothing in the product wants the thousands of
 * languages we cannot offer a Bible in. This suite is the one place allowed to know a raw
 * route shape (see the header), and this is the only claim that needs the superset.
 */
async function allLanguageTags(): Promise<string[]> {
  const res = await fetch(
    "https://api.youversion.com/v1/languages?page_size=*&fields%5B%5D=id",
    { headers: { accept: "application/json", "x-yvp-app-key": APP_KEY } },
  );
  if (!res.ok) throw new Error(`/v1/languages answered ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  return (body.data ?? []).map((l) => l.id).filter((id): id is string => !!id);
}

/**
 * The `language_ranges[]=*` catalogue index, fetched RAW so the two cache variants can be
 * compared. `extraHeaders` is the whole experiment: sending an explicit `Accept-Encoding`
 * selects a different — fresher — upstream variant (see `CATALOGUE_ACCEPT_ENCODING`).
 *
 * The URL is byte-identical between the two calls on purpose. A comparison whose baseline
 * changes more than one variable measures the wrong thing.
 */
async function rawCatalogueTags(
  extraHeaders: Record<string, string>,
): Promise<Set<string>> {
  const res = await fetch(
    "https://api.youversion.com/v1/bibles?language_ranges%5B%5D=*&page_size=*" +
      "&fields%5B%5D=id&fields%5B%5D=abbreviation&fields%5B%5D=language_tag",
    {
      headers: {
        accept: "application/json",
        "x-yvp-app-key": APP_KEY,
        ...extraHeaders,
      },
    },
  );
  if (!res.ok) throw new Error(`/v1/bibles?language_ranges[]=* answered ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ language_tag?: string }> };
  return new Set(
    (body.data ?? []).map((b) => b.language_tag).filter((t): t is string => !!t),
  );
}

/** The raw status `fetchTranslations` collapses. `[]` is returned for a 204 AND for a
 *  200-with-empty-`data`, so only this can hold E-YV4's actual claim — that the live host
 *  still emits the empty-BODY status `JSON.parse` would throw on. */
async function translationsStatus(languageTag: string): Promise<number> {
  const res = await fetch(
    `https://api.youversion.com/v1/bibles?language_ranges%5B%5D=${encodeURIComponent(languageTag)}&page_size=50`,
    { headers: { accept: "application/json", "x-yvp-app-key": APP_KEY } },
  );
  return res.status;
}

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

    // ── The claim: this is "languages WITH BIBLES", not "languages" ──────────────────
    //
    // It used to be held by `expect(tags).not.toContain("aab")`, and that line rotted
    // twice inside four days (2026-07-31): upstream licensed a Bible for `aab` (the Arum
    // New Testament, id 4443), AND the `language_ranges[]=*` index answers differently
    // depending on which cached variant the request lands on — the shipped client's own
    // request gets 1472 rows and no `aab`, while the identical URL with an explicit
    // `Accept-Encoding` gets 1479 rows and `aab`. So that assertion was green for a
    // reason that had nothing to do with the rule, and would have gone red the moment the
    // cache settled. (The variant split itself is now WORKED AROUND in the client and
    // pinned by `E-YV1b` below — but naming a tag would still be the wrong assertion
    // here, because which tags are licensed is upstream's decision to change daily.)
    //
    // A ratio cannot rot that way, and it fails for exactly the bug the `aab` line
    // existed to catch: re-deriving this list from `/v1/languages` (every language
    // YouVersion knows, thousands of which have a non-null `default_bible_id` that lies)
    // instead of from the bibles index.
    const allTags = await allLanguageTags();
    expect(allTags.length).toBeGreaterThan(languages.length);
    expect(languages.length).toBeLessThan(allTags.length / 2);
    // …and the narrowing is a SUBSET, not a different list — a re-derivation that
    // happened to be small would otherwise satisfy the ratio.
    //
    // Compared on the PRIMARY subtag, because the bibles index carries script/region
    // variants that `/v1/languages` has no record for at all. That is documented in
    // `lib/youversion/client.ts` ("12 catalogue tags (`zh-Hant-TW`, `es-ES`, `pt-PT`, …)
    // have no `/v1/languages` record at all; those, and only those, fall through to
    // `Intl`") — and a first draft of this assertion ignored it and went red on
    // `sus-Arab`, `ur-Deva` and `ur-Latn`. The rule being held is "every language we
    // offer is a language YouVersion knows, possibly in a particular script", which is
    // still falsified by the re-derivation this guards against.
    const all = new Set(allTags);
    const unknown = languages.filter(
      (l) => !all.has(l.tag) && !all.has(l.tag.split("-")[0]!),
    );
    expect(unknown).toEqual([]);
  });

  /**
   * The live half of the stale-cache-variant workaround (`CATALOGUE_ACCEPT_ENCODING`).
   * `U-YV1b` proves the header is SENT; only a live probe can say whether it still helps.
   *
   * The claim is deliberately not "the client returns ≥ 1258 languages". A bare floor rots
   * the moment upstream adds a language to both variants: 1252 → 1262 would clear a 1258
   * floor with the workaround deleted. What is held instead:
   *
   *   the client's catalogue ⊇ (header-free variant ∪ header-carrying variant)
   *
   * — which is red for a REMOVAL for exactly as long as the divergence exists, and which
   * degrades correctly rather than falsely if the variants converge (then the union is the
   * same set either way, and this test is simply reporting that the workaround has become
   * inert and can go).
   *
   * The absolute floor below it is an anti-vacuity control, not the claim: three empty
   * responses would satisfy a superset assertion perfectly.
   *
   * ⚠️ If this goes red with `client < headerFree`, the header has stopped selecting the
   * fresher variant. That is not a reason to weaken the assertion — it is the signal to
   * re-measure and either repoint or delete the workaround.
   */
  it("E-YV1b: the pinned Accept-Encoding still buys the fresher cache variant, and never a smaller one", async () => {
    const [languages, headerFree, headerCarrying] = await Promise.all([
      fetchLanguageCatalogue(deps),
      rawCatalogueTags({}),
      rawCatalogueTags({ "accept-encoding": CATALOGUE_ACCEPT_ENCODING }),
    ]);
    const offered = new Set(languages.map((l) => l.tag));

    // anti-vacuity: all three reads actually returned a catalogue
    expect(offered.size).toBeGreaterThan(1000);
    expect(headerFree.size).toBeGreaterThan(1000);
    expect(headerCarrying.size).toBeGreaterThan(1000);

    // THE CLAIM: nothing any observable variant offers is missing from what we ship.
    const missing = [...headerFree, ...headerCarrying].filter((t) => !offered.has(t));
    expect(missing).toEqual([]);

    // …and the count the user's picker sees is never the smaller of the two.
    expect(offered.size).toBeGreaterThanOrEqual(headerFree.size);

    // Recorded, not asserted: `0` means the variants have converged and
    // `CATALOGUE_ACCEPT_ENCODING` can be deleted (measured 2026-07-31: 6).
    console.log(
      `[E-YV1b] catalogue variant delta: header-free=${headerFree.size} ` +
        `header-carrying=${headerCarrying.size} client=${offered.size}`,
    );
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
    // ── The subject is DERIVED, because a hardcoded one rots ────────────────────────
    //
    // This used to name `aab`. On 2026-07-31 upstream licensed a Bible for it, the case
    // went red, and the honest fix is not a different hardcoded tag — it is to stop
    // asserting a fact about one language that YouVersion may monetise at any time.
    //
    // The derivation cannot be trusted blind either, and that is measured rather than
    // assumed: the catalogue index and the per-language index DISAGREE (`aab` is absent
    // from the client's view of `language_ranges[]=*` while `language_ranges[]=aab`
    // returns a Bible). So candidates are PROBED, not assumed — the first one that really
    // answers 204 is the subject, and if none does within the budget this fails loudly
    // instead of quietly asserting nothing.
    const [allTags, catalogue] = await Promise.all([
      allLanguageTags(),
      fetchLanguageCatalogue(deps),
    ]);
    const listed = new Set(catalogue.map((l) => l.tag));
    const candidates = allTags.filter((t) => !listed.has(t));

    // Anti-vacuity #1: there must BE languages without bibles. If YouVersion ever
    // licensed all ~8.5k, this case has no subject and must say so rather than pass.
    expect(candidates.length).toBeGreaterThan(0);

    let subject: string | null = null;
    for (const tag of candidates.slice(0, 25)) {
      if ((await translationsStatus(tag)) === 204) {
        subject = tag;
        break;
      }
    }
    // Anti-vacuity #2: a 204 was actually OBSERVED. `fetchTranslations` returns `[]` for a
    // 204 AND for a 200-with-empty-`data`, so without this the case could go green while
    // the empty-body status — the only shape that makes `JSON.parse("")` throw, which is
    // this case's whole title — had disappeared upstream.
    expect(
      subject,
      "no unlisted language answered 204 in 25 probes — the empty-body contract this " +
        "case exists to pin may have changed; check the live host before editing this test",
    ).not.toBeNull();

    await expect(fetchTranslations(subject!, deps)).resolves.toEqual([]);

    // Anti-vacuity #3: the probe DISCRIMINATES. A host that answered 204 for everything
    // would satisfy everything above while proving nothing about "zero bibles".
    expect(await translationsStatus(DEFAULT_LANGUAGE_TAG)).toBe(200);
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

/**
 * The VERSE-RANGE contract (2026-07-30) — the one the wizard's new verse selector rests on.
 *
 * Turn 18a draws a verse-chip tray with a range and a "Whole chapter" escape, and it was
 * deliberately NOT built: `contracts.ts` had closed constructing a USFM as residual risk
 * ("`passageId` is ECHOED, never constructed") and no range form had ever been verified.
 *
 * Probing the live host settled it, and it settled it in two directions at once — which is
 * why these three assertions live together. The form the earlier decision assumed is a
 * genuine 404; a different form, built entirely out of ids the provider itself handed out,
 * is a 200 that the provider then NORMALISES and echoes back. So the range can be expressed
 * without this codebase inventing a single character, which is the standing the chapter's
 * own `passageId` already had.
 */
describe("YouVersion live contract — verse ranges", () => {
  it("E-BY7: a `+`-join of ECHOED verse ids is accepted, and the host echoes a canonical range", async () => {
    const english = await fetchTranslations(DEFAULT_LANGUAGE_TAG, deps);
    const asv = english.find((t) => t.abbreviation === ASV)!;
    const chapters = await fetchChapters(asv.id, "PSA", deps);
    // Psalm 121. Located by its own echoed passageId, never by indexing or by assuming
    // the chapter id is the number.
    const chapter = chapters.find((c) => c.passageId === "PSA.121")!;
    expect(chapter).toBeDefined();

    const verses = await fetchVerses(asv.id, "PSA", chapter.id, deps);
    expect(verses.length).toBeGreaterThan(0);

    // The wizard's default: the first min(5, n) of whatever the LIVE response listed.
    const selected = verses.slice(0, Math.min(5, verses.length));
    const request = selected.map((v) => v.passageId).join("+");
    // Every component came out of the response above — nothing was assembled.
    for (const part of request.split("+")) {
      expect(verses.map((v) => v.passageId)).toContain(part);
    }

    const passage = await fetchPassage(asv.id, request, deps);
    expect(passage.text.length).toBeGreaterThan(0);
    // The host collapses a contiguous list into a canonical range id + reference, and THAT
    // is what the manifest persists. Derived from the live endpoints, not written down.
    const first = selected[0].passageId;
    const lastVerse = selected[selected.length - 1].passageId.split(".").pop()!;
    expect(passage.passageId).toBe(`${first}-${lastVerse}`);
    expect(passage.reference).toContain(":");

    // …and the echoed id round-trips: it is what dbos re-fetches at generation time.
    const again = await fetchPassage(asv.id, passage.passageId, deps);
    expect(again.text).toBe(passage.text);
  });

  it("E-BY8: the BOTH-SIDES hyphen form is a 404 — which is why the join form is used", async () => {
    // `PSA.121.1-PSA.121.4` is the shape a naive "start-end" construction produces, and it
    // is precisely what the original decision treated as unverified. It is unverifiable
    // because it does not work.
    const english = await fetchTranslations(DEFAULT_LANGUAGE_TAG, deps);
    const asv = english.find((t) => t.abbreviation === ASV)!;
    const err = await fetchPassage(asv.id, "PSA.121.1-PSA.121.4", deps).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(YouVersionHttpError);
    expect((err as YouVersionHttpError).status).toBe(404);
  });

  it("E-BY9: over-requesting a SHORT chapter succeeds with a fabricated reference — the live case for min(5, n)", async () => {
    // This is the whole reason "the first 5 verses" may never mean the literal number 5.
    // Psalm 117 is the shortest chapter in most translations. Asking for five verses of it
    // does NOT fail — the host answers 200 with the real (short) text under a reference
    // that names verses the chapter does not contain. A hardcoded 5 would therefore commit
    // a reference the translation does not support into the user's git repo, silently, with
    // no error anywhere to notice. The count has to come from the verses response.
    const english = await fetchTranslations(DEFAULT_LANGUAGE_TAG, deps);
    const asv = english.find((t) => t.abbreviation === ASV)!;
    const chapters = await fetchChapters(asv.id, "PSA", deps);
    const short = chapters.find((c) => c.passageId === "PSA.117")!;
    const verses = await fetchVerses(asv.id, "PSA", short.id, deps);

    // The live authority on how many verses this chapter has.
    expect(verses.length).toBeLessThan(5);

    const overRequested = await fetchPassage(asv.id, "PSA.117.1-5", deps);
    expect(overRequested.reference).toContain("1-5"); // a reference for verses 3..5, which do not exist
    // The honest request, built from the live list, names only verses that exist.
    const honest = await fetchPassage(
      asv.id,
      verses.map((v) => v.passageId).join("+"),
      deps,
    );
    expect(honest.reference).not.toContain("-5");
    expect(honest.text).toBe(overRequested.text); // same text; only the CLAIM differed
  });
});
