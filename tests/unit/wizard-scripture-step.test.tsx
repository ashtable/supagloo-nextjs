// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  byTestId,
  click,
  deferred,
  flush,
  mount,
  queryTestId,
  selectOption,
} from "./support/render";

/**
 * Feature 2 / figure 18a — the wizard's new step 2.
 *
 * The assertions here are the ones the figure cannot settle on its own: that the tri-state
 * cache contract survives the move out of the studio, that the CTA cannot be armed against
 * a passage the provider has not confirmed, and that the verse RANGE the figure draws is
 * genuinely absent rather than half-built.
 */

const fetchBibleLanguages = vi.fn();
const fetchBibleTranslations = vi.fn();
const fetchBibleBooks = vi.fn();
const fetchBibleChapters = vi.fn();
const fetchBiblePassage = vi.fn();
const fetchBibleVerses = vi.fn();

vi.mock("@/lib/studio/scripture-data", () => ({
  fetchBibleLanguages: (...a: unknown[]) => fetchBibleLanguages(...a),
  fetchBibleTranslations: (...a: unknown[]) => fetchBibleTranslations(...a),
  fetchBibleBooks: (...a: unknown[]) => fetchBibleBooks(...a),
  fetchBibleChapters: (...a: unknown[]) => fetchBibleChapters(...a),
  fetchBiblePassage: (...a: unknown[]) => fetchBiblePassage(...a),
  fetchBibleVerses: (...a: unknown[]) => fetchBibleVerses(...a),
}));

import ScriptureStep from "@/app/_components/project-wizard/scripture-step";

const LANGUAGES = [{ tag: "en", name: "English", direction: "ltr" as const }];
const TRANSLATIONS = [
  { id: "12", abbreviation: "ASV", title: "American Standard Version" },
  { id: "1", abbreviation: "KJV", title: "King James Version" },
];
const BOOKS = [{ usfm: "PSA", title: "Psalms", canon: "ot" }];
/**
 * The chapters shape the LIVE host reports, and the reason it is spelled out here.
 *
 * `GET /v1/bibles/12/books/PSA/chapters` answers `{id: "23", passage_id: "PSA.23",
 * title: "23"}` — the `id` is the BARE NUMBER and the `passage_id` is the USFM. They are two
 * independent provider strings, and the verses route takes the `id` (`/chapters/23/verses`;
 * `/chapters/PSA.23/verses` is a 404).
 *
 * This fixture used to set `id` to the USFM as well, so the whole suite ran against a shape
 * the provider never returns. It hid nothing today — the production code is id-agnostic, it
 * matches `chapters.find(c => c.id === chapterId)` and reads `chapterRef.passageId` — but the
 * confusion it would let through later is exactly the one this run exists to fix, one level
 * up (a human reference travelling where a USFM was required). The sibling fixture in
 * `tests/unit/scripture-picker.test.tsx` already had it right.
 *
 * Psalm 117 is here because `U-W45` drives it: it is the two-verse chapter whose live
 * behaviour is the whole argument for `min(5, n)`.
 */
const CHAPTERS = [
  { id: "117", passageId: "PSA.117", title: "117" },
  { id: "121", passageId: "PSA.121", title: "121" },
  { id: "122", passageId: "PSA.122", title: "122" },
];
const PASSAGE = {
  passageId: "PSA.121",
  reference: "Psalm 121",
  text: "I will lift up mine eyes unto the hills, from whence cometh my help.",
};
/** The two-verse chapter U-W45 drives, answered at CHAPTER granularity — which is what the
 *  step asks for once the default range covers the whole live list. */
const PSALM_117 = {
  passageId: "PSA.117",
  reference: "Psalms 117",
  text: "O praise Jehovah, all ye nations; Laud him, all ye peoples.",
};
/** Psalm 121 has EIGHT verses. Shaped exactly as `app/api/bible/verses/route.ts` serves
 *  them, `passageId` provider-issued. */
const VERSES = Array.from({ length: 8 }, (_, i) => ({
  id: String(i + 1),
  passageId: `PSA.121.${i + 1}`,
  title: String(i + 1),
}));
/** The default range's echoed answer: joining verses 1..5 and letting the host normalise.
 *  Measured live 2026-07-30 — `PSA.121.1+…+PSA.121.5` → `{id:"PSA.121.1-5"}`. */
const RANGE_PASSAGE = {
  passageId: "PSA.121.1-5",
  reference: "Psalms 121:1-5",
  text: "one two three four five six seven",
};
/** The chapter-granularity answers, keyed by the request. A chapter's `passage_id` is what
 *  the step asks for whenever the selection covers the whole live verse list (or there is no
 *  list), so every chapter this suite drives needs one. */
const CHAPTER_PASSAGES: Record<string, typeof PASSAGE> = {
  [PASSAGE.passageId]: PASSAGE,
  [PSALM_117.passageId]: PSALM_117,
};

let mounted: { container: HTMLElement; unmount: () => void } | null = null;
type Reported = { reference: string; translation: string; passageId?: string } | null;
let onSelect: ReturnType<typeof vi.fn<(s: Reported) => void>>;
let onSkip: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  vi.resetAllMocks();
  onSelect = vi.fn<(s: Reported) => void>();
  onSkip = vi.fn<() => void>();
  fetchBibleLanguages.mockResolvedValue(LANGUAGES);
  fetchBibleTranslations.mockResolvedValue(TRANSLATIONS);
  fetchBibleBooks.mockResolvedValue(BOOKS);
  fetchBibleChapters.mockResolvedValue(CHAPTERS);
  fetchBibleVerses.mockResolvedValue(VERSES);
  // The host answers about whatever id it was asked for. Keyed rather than fixed because
  // the step has two granularities — a chapter's own echoed id, and the `+`-join of echoed
  // per-verse ids that the host normalises into a range. The chapter answers are looked up;
  // anything else is a join, and `RANGE_PASSAGE` is the measured answer for the join the
  // DEFAULT produces. (Tests that drive a non-default range assert the REQUEST, never this
  // fallback's values — normalising an arbitrary join here would mean re-implementing
  // YouVersion's own canonicalisation in a fixture, i.e. inventing provider behaviour.)
  fetchBiblePassage.mockImplementation(
    async (_bibleId: string, usfm: string) => CHAPTER_PASSAGES[usfm] ?? RANGE_PASSAGE,
  );
});

/** The `+`-join the default range produces: verses 1..5 of the live list, echoed. */
const DEFAULT_RANGE_REQUEST = VERSES.slice(0, 5)
  .map((v) => v.passageId)
  .join("+");

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

async function step() {
  mounted = await mount(
    <ScriptureStep
      repoFullName="ashsrinivas/psalm-121"
      projectName="psalm-121"
      onChangeRepo={() => {}}
      onSelect={onSelect}
      onSkip={onSkip}
    />,
  );
  await flush();
  return mounted.container;
}

/**
 * Walk the cascade to a resolved chapter.
 *
 * `chapterId` is the chapter's `id` — the BARE NUMBER the live host reports — because that is
 * what the `<option value>`s carry and what `selection.chapter` holds. It is deliberately NOT
 * the `passageId`; see `CHAPTERS`.
 */
async function pickChapter(root: HTMLElement, chapterId: string) {
  await selectOption(byTestId(root, "wizard-picker-book"), "PSA");
  await flush();
  await selectOption(byTestId(root, "wizard-picker-chapter"), chapterId);
  await flush();
}

/** The eight-verse chapter most of this suite drives, so the `min(5, n)` default is a real
 *  subset of the live list rather than the whole of it. */
const pickPsalm121 = (root: HTMLElement) => pickChapter(root, "121");

describe("the wizard's scripture step", () => {
  it("U-W32: renders the four cascading pickers and the repo recap", async () => {
    const root = await step();
    for (const id of [
      "wizard-picker-language",
      "wizard-picker-translation",
      "wizard-picker-book",
      "wizard-picker-chapter",
      "wizard-repo-recap",
    ]) {
      expect(queryTestId(root, id), id).not.toBeNull();
    }
    expect(byTestId(root, "wizard-repo-recap").textContent).toContain(
      "ashsrinivas/psalm-121",
    );
  });

  it("U-W33: pre-selects ASV BY ABBREVIATION from the live collection", async () => {
    // §9-Q10 forbids hardcoding bible ids: the default is a PREFERENCE resolved against
    // whatever the collection returned. KJV is measurably not licensed to our app key,
    // which is why the preference is ASV.
    const root = await step();
    expect(
      (byTestId(root, "wizard-picker-translation") as HTMLSelectElement).value,
    ).toBe("12");
  });

  it("U-W34: reports the passage only once the PROVIDER has confirmed it", async () => {
    const root = await step();
    expect(onSelect).not.toHaveBeenCalledWith(
      expect.objectContaining({ reference: expect.anything() }),
    );
    await pickPsalm121(root);
    // The DEFAULT is now the first min(5, n) verses (user clarification 2026-07-30), so
    // both values reported are the host's own answer about that range.
    expect(onSelect).toHaveBeenLastCalledWith({
      reference: "Psalms 121:1-5",
      translation: "ASV",
      language: "en",
      passageId: "PSA.121.1-5",
    });
  });

  it("U-W35: the passageId is ECHOED from the provider, never assembled here", async () => {
    // `contracts.ts` closed CONSTRUCTING a usfm as residual risk, and that is respected:
    // the request is a join of ids the verses route handed out, and the id that gets
    // PERSISTED is the one the host echoed back for it. Measured live 2026-07-30 —
    // `PSA.121.1+…+PSA.121.5` → `{id:"PSA.121.1-5"}`; the hyphenated both-sides form
    // `PSA.121.1-PSA.121.5` is a 404, which is why nothing here builds one.
    const root = await step();
    await pickPsalm121(root);
    const reported = onSelect.mock.calls.at(-1)![0]!;
    expect(reported.passageId).toBe(RANGE_PASSAGE.passageId);
    expect(fetchBiblePassage).toHaveBeenCalledWith("12", DEFAULT_RANGE_REQUEST);

    // Every component of every request came out of the provider. Iterated over what the STEP
    // ASKED FOR — not over `DEFAULT_RANGE_REQUEST`, which this file builds by mapping over
    // `VERSES`, so checking its parts against `VERSES` was a statement about the test's own
    // arithmetic and could not fail whatever the component did. The chapter's own `passageId`
    // is in the allow-list because the step legitimately asks for it first, before the verses
    // response has arrived to default a range from.
    const echoed = new Set([PASSAGE.passageId, ...VERSES.map((v) => v.passageId)]);
    const requested = fetchBiblePassage.mock.calls.map(([, usfm]) => usfm as string);
    expect(requested.length, "the step asked the provider for nothing").toBeGreaterThan(0);
    for (const usfm of requested) {
      for (const part of usfm.split("+")) {
        expect(echoed, `"${part}" was never handed out by the provider`).toContain(part);
      }
    }
  });

  it("U-W36: renders the live passage preview with the REAL reference", async () => {
    // Flag F5: the figure's header literals ("66", "1,900+", "PSALM 121:1–4") are drawn
    // values, not data. Everything printed is interpolated from the response.
    const root = await step();
    await pickPsalm121(root);
    const header = byTestId(root, "wizard-passage-reference").textContent ?? "";
    expect(header).toContain("Psalms 121:1-5");
    expect(header).toContain("ASV");
    expect(byTestId(root, "wizard-passage-preview").textContent).toContain("one two three");
  });

  it("U-W37: a FAILED fetch disables the cascade and advises — not 'there are none'", async () => {
    // The tri-state contract the studio picker documents: `null` (the fetch failed) is a
    // different state from `[]` (there genuinely are none), and collapsing them renders
    // "we could not ask" as a confident empty answer.
    fetchBibleLanguages.mockResolvedValue(null);
    const root = await step();
    expect(queryTestId(root, "wizard-scripture-error")).not.toBeNull();
    expect(
      (byTestId(root, "wizard-picker-language") as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(onSelect).not.toHaveBeenCalledWith(expect.objectContaining({ reference: "Psalm 121" }));
  });

  it("U-W38: the wizard's failure copy does NOT tell the user to type into a script", async () => {
    // The shipped studio string is "Couldn't reach YouVersion — type the verse into the
    // script instead." There is no script here, and no project to put one in.
    fetchBibleLanguages.mockResolvedValue(null);
    const root = await step();
    const copy = byTestId(root, "wizard-scripture-error").textContent ?? "";
    expect(copy).toContain("YouVersion");
    expect(copy).not.toContain("into the script");
  });

  it("U-W39: an EMPTY collection is not an error", async () => {
    // A language with no Bibles answers 204 upstream and surfaces as `[]`. That is a real,
    // correct answer and must not render the unreachable advisory.
    fetchBibleTranslations.mockResolvedValue([]);
    const root = await step();
    expect(queryTestId(root, "wizard-scripture-error")).toBeNull();
  });

  // U-W40 was INVERTED on 2026-07-30. It used to pin the verse range as deliberately
  // absent, on the grounds that a range is a constructed usfm and `contracts.ts` closed
  // constructing one. That reasoning was tested against the live host before this change
  // and only HALF of it held:
  //   - `PSA.121.1-PSA.121.4` (the both-sides form the decision assumed) → 404. Correct.
  //   - `PSA.121.1+PSA.121.2` (a join of ids the verses route ISSUED) → 200, and the host
  //     echoes back `{id:"PSA.121.1-2", reference:"Psalms 121:1-2"}`.
  // So a range can be expressed without constructing anything: every character sent came
  // from the provider, and every character stored came from the provider. That is the same
  // standing the chapter's own `passageId` already has, which is what re-opened this.
  //
  // The "each verse becomes a scene" clause of 18a's footnote stays REFUSED: how many
  // scenes a passage becomes is the model's call, and shipping that promise would repeat
  // the exact mistake the redirect caption is being fixed for.
  it("U-W40: the verse tray IS built — a range of echoed ids, and the whole-chapter escape", async () => {
    const root = await step();
    await pickPsalm121(root);

    expect(queryTestId(root, "wizard-verse-chips")).not.toBeNull();
    expect(root.textContent).toContain("Whole chapter");
    expect(root.textContent).not.toContain("each verse becomes a scene");
    expect(onSelect.mock.calls.at(-1)![0]!.passageId).toBe("PSA.121.1-5");
  });

  it("U-W44: the chapter's verses default to the first min(5, n), selected on arrival", async () => {
    const root = await step();
    await pickPsalm121(root);

    // The chapter's `id`, not its `passageId`: the live verses route is
    // `/chapters/{id}/verses` and `/chapters/PSA.121/verses` is a 404.
    expect(fetchBibleVerses).toHaveBeenCalledWith("12", "PSA", "121");
    const chips = root.querySelectorAll('[data-testid="wizard-verse-chip"]');
    expect(chips).toHaveLength(VERSES.length);
    const selected = [...chips]
      .filter((c) => c.getAttribute("data-selected") === "true")
      .map((c) => c.getAttribute("data-verse-id"));
    expect(selected).toEqual(["1", "2", "3", "4", "5"]);
  });

  // U-W45's echoed-id claim was REWRITTEN on 2026-07-30, because the loop it used to make
  // executed zero assertions. It drove chapter 121 while feeding it `PSA.117.*` verses, so
  // `chapterPassageId` was `"PSA.121"`, the whole-list selection made that the only request
  // there was, and the loop's `continue` skipped it. Proved by substituting an impossible
  // expectation into the body: the test still passed.
  //
  // Two things had to change. The fixture now drives the chapter the verses belong to, so it
  // states one coherent situation. And the claim is asserted as an EQUALITY over every request
  // the step made rather than as a filtered loop — because with the whole live list selected
  // the request is, correctly, the chapter's own echoed id and nothing else, so any assertion
  // shaped as "every join component was issued" has nothing to iterate over by construction.
  // U-W35 carries the join-components form, where a join actually exists.
  it("U-W45: a TWO-verse chapter defaults to two — the live response is the authority", async () => {
    // Psalm 117 has two verses. `PSA.117.1-5` does not 404 upstream (measured: 200, with
    // `reference:"Psalms 117:1-5"` over the real two-verse text), so a hardcoded 5 would
    // persist a FABRICATED reference into the user's repo with nothing to notice.
    const short = [
      { id: "1", passageId: "PSA.117.1", title: "1" },
      { id: "2", passageId: "PSA.117.2", title: "2" },
    ];
    fetchBibleVerses.mockResolvedValue(short);
    const root = await step();
    await pickChapter(root, "117");

    expect(fetchBibleVerses).toHaveBeenCalledWith("12", "PSA", "117");

    // Both of the chapter's verses are selected — min(5, 2) — so every chip is on…
    const chips = [...root.querySelectorAll('[data-testid="wizard-verse-chip"]')];
    expect(chips).toHaveLength(2);
    expect(chips.every((c) => c.getAttribute("data-selected") === "true")).toBe(true);
    expect(byTestId(root, "wizard-passage-meta").textContent).toContain("2 verses");

    // …and the whole of what the step asked the provider for, exhaustively. A hardcoded 5
    // would have asked for five verses of a two-verse chapter — which upstream answers 200
    // with the reference "Psalms 117:1-5", silently persisting a claim about verses this
    // chapter does not have. Because the default here covers the whole live list, the one
    // legitimate request is the chapter's own echoed `passageId`; asserting the exact set is
    // what makes "nothing was asked for that the provider did not issue" a claim that can
    // fail, rather than a loop with no iterations.
    expect(fetchBiblePassage.mock.calls.map(([, usfm]) => usfm)).toEqual([
      PSALM_117.passageId,
    ]);
    // The reported selection is the provider's answer about that request, so nothing about
    // verse five reaches the manifest either.
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ passageId: "PSA.117", reference: "Psalms 117" }),
    );
  });

  it("U-W46: 'Whole chapter' reverts to the chapter's OWN echoed passageId", async () => {
    const root = await step();
    await pickPsalm121(root);
    await click(byTestId(root, "wizard-whole-chapter"));
    await flush();

    expect(fetchBiblePassage).toHaveBeenLastCalledWith("12", "PSA.121");
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ passageId: "PSA.121", reference: "Psalm 121" }),
    );
    const chips = root.querySelectorAll('[data-testid="wizard-verse-chip"]');
    expect([...chips].every((c) => c.getAttribute("data-selected") !== "true")).toBe(true);
  });

  it("U-W47: tapping selects a RANGE, and the request is still only echoed ids", async () => {
    const root = await step();
    await pickPsalm121(root);
    const chip = (id: string) =>
      byTestId(root, "wizard-verse-chips").querySelector<HTMLElement>(
        `[data-verse-id="${id}"]`,
      )!;

    await click(chip("3"));
    await flush();
    await click(chip("6"));
    await flush();

    expect(fetchBiblePassage).toHaveBeenLastCalledWith(
      "12",
      "PSA.121.3+PSA.121.4+PSA.121.5+PSA.121.6",
    );
  });

  it("U-W48: the preview meta interpolates BOTH counts from the live response", async () => {
    const root = await step();
    await pickPsalm121(root);
    // RANGE_PASSAGE.text is seven words; the default range is five verses. Neither number
    // is 18a's drawn "4 verses · 71 words".
    expect(byTestId(root, "wizard-passage-meta").textContent).toBe("5 verses · 7 words");
  });

  it("U-W49: an unavailable verse list degrades to the whole chapter, never blocking the CTA", async () => {
    // The tri-state contract again: `null` is "we could not ask". The chapter's own
    // passageId is a complete answer, so a failed verses read must not stop the user
    // creating a project.
    fetchBibleVerses.mockResolvedValue(null);
    const root = await step();
    await pickPsalm121(root);

    expect(fetchBiblePassage).toHaveBeenLastCalledWith("12", "PSA.121");
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ passageId: "PSA.121" }),
    );
    expect(queryTestId(root, "wizard-verse-chips")).toBeNull();
  });

  it("U-W50: an EMPTY verse list is not an error, and is not a failed one either", async () => {
    fetchBibleVerses.mockResolvedValue([]);
    const root = await step();
    await pickPsalm121(root);
    expect(queryTestId(root, "wizard-scripture-error")).toBeNull();
    expect(fetchBiblePassage).toHaveBeenLastCalledWith("12", "PSA.121");
  });

  // -------------------------------------------------------------------------
  // The re-run rule: while a NEW passage is in flight, the reported selection is null
  // -------------------------------------------------------------------------
  //
  // The step's `onSelect` is the wizard's ONLY forward gate (`new-project-wizard.tsx` →
  // `canScaffold` in `new-project-model.ts`), and nothing else can guard it: the parent
  // holds no pending flag and the chip tray has no `disabled`. So between an input change
  // and the provider's answer about the NEW input, the report must be `null` — otherwise
  // Create is armed on the passage the user has navigated away from and the manifest
  // commits it.
  //
  // Both cases below hold `fetchBiblePassage` open for every call after the change, which
  // is the only way the window is observable: it is a real BFF round trip, so React
  // batching does not close it. Before the clear moved onto the effect's re-run path this
  // was covered for a BOOK change only — `setChapters(undefined)` drives
  // `chapterPassageId` to null, so the `if (!bibleId || !requestPassageId)` early return
  // fired and cleared. A chapter or verse change replaces one non-null echoed id with
  // another and never enters that branch.
  it("U-W51: a CHAPTER change clears the reported selection until the new passage resolves", async () => {
    const root = await step();
    await pickPsalm121(root);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ passageId: "PSA.121.1-5" }),
    );

    // Held open for every subsequent call, not just the next one: a chapter change re-asks
    // twice (the chapter's own id while the verses list is still loading, then the join the
    // freshly-defaulted range produces), and the claim is about the whole window.
    const held = deferred<typeof RANGE_PASSAGE>();
    fetchBiblePassage.mockImplementation(() => held.promise);

    await selectOption(byTestId(root, "wizard-picker-chapter"), "122");
    await flush();

    expect(fetchBiblePassage).toHaveBeenCalled();
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("U-W52: a verse-chip tap clears the reported selection until the new range resolves", async () => {
    const root = await step();
    await pickPsalm121(root);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ passageId: "PSA.121.1-5" }),
    );

    const held = deferred<typeof RANGE_PASSAGE>();
    fetchBiblePassage.mockImplementation(() => held.promise);

    await click(
      byTestId(root, "wizard-verse-chips").querySelector<HTMLElement>(
        '[data-verse-id="3"]',
      )!,
    );
    await flush();

    // The tap restarted the range at verse 3 (U-W47's model), so a genuinely different
    // passage is in flight…
    expect(fetchBiblePassage).toHaveBeenLastCalledWith("12", "PSA.121.3");
    // …and until it answers, the wizard holds no passage at all.
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// The way out of step 2
// ---------------------------------------------------------------------------
//
// `canScaffold` gates the ONLY forward control in the wizard on a resolved passage, and
// step 2 sits between the repo choice and the scaffold. So with YouVersion unreachable —
// or simply with a user who does not yet know their passage — new-project creation was
// dead-ended: no forward control, and the step's own copy promising "you can also pick the
// passage later in the studio" was a promise nothing on screen could keep. (The Import
// wizard is a separate entry point and is unaffected; this is new-project creation only.)
describe("the wizard's scripture step — skipping the passage", () => {
  it("U-W41: offers a skip control that leaves the step without a passage", async () => {
    const root = await step();
    const skip = byTestId(root, "wizard-skip-scripture");
    await click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("U-W42: the skip control is LIVE when YouVersion is unreachable — the dead end it exists to open", async () => {
    // This is the case the step's own copy promises and the forward gate refuses: every
    // cascade is disabled, `canScaffold` can never become true, and without this control
    // the only remaining action is closing the wizard.
    fetchBibleLanguages.mockResolvedValue(null);
    const root = await step();
    expect(queryTestId(root, "wizard-scripture-error")).not.toBeNull();
    const skip = byTestId(root, "wizard-skip-scripture") as HTMLButtonElement;
    expect(skip.disabled).toBe(false);
    await click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("U-W43: skipping CLEARS a partly-made selection so no half-chosen passage is scaffolded", async () => {
    // Without the clear, a user who picked a chapter, changed their mind and skipped
    // would still scaffold `createdFrom: "passage"` carrying the passage they backed out
    // of — the payload and the user's intent silently disagreeing.
    const root = await step();
    await pickPsalm121(root);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ reference: "Psalms 121:1-5" }),
    );
    await click(byTestId(root, "wizard-skip-scripture"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
