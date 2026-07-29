// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  byTestId,
  click,
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

vi.mock("@/lib/studio/scripture-data", () => ({
  fetchBibleLanguages: (...a: unknown[]) => fetchBibleLanguages(...a),
  fetchBibleTranslations: (...a: unknown[]) => fetchBibleTranslations(...a),
  fetchBibleBooks: (...a: unknown[]) => fetchBibleBooks(...a),
  fetchBibleChapters: (...a: unknown[]) => fetchBibleChapters(...a),
  fetchBiblePassage: (...a: unknown[]) => fetchBiblePassage(...a),
  fetchBibleVerses: vi.fn(),
}));

import ScriptureStep from "@/app/_components/project-wizard/scripture-step";

const LANGUAGES = [{ tag: "en", name: "English", direction: "ltr" as const }];
const TRANSLATIONS = [
  { id: "12", abbreviation: "ASV", title: "American Standard Version" },
  { id: "1", abbreviation: "KJV", title: "King James Version" },
];
const BOOKS = [{ usfm: "PSA", title: "Psalms", canon: "ot" }];
const CHAPTERS = [
  { id: "PSA.121", passageId: "PSA.121", title: "121" },
  { id: "PSA.122", passageId: "PSA.122", title: "122" },
];
const PASSAGE = {
  passageId: "PSA.121",
  reference: "Psalm 121",
  text: "I will lift up mine eyes unto the hills, from whence cometh my help.",
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
  fetchBiblePassage.mockResolvedValue(PASSAGE);
});

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

/** Walk the cascade to a resolved chapter. */
async function pickPsalm121(root: HTMLElement) {
  await selectOption(byTestId(root, "wizard-picker-book"), "PSA");
  await flush();
  await selectOption(byTestId(root, "wizard-picker-chapter"), "PSA.121");
  await flush();
}

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
    expect(onSelect).toHaveBeenLastCalledWith({
      reference: "Psalm 121",
      translation: "ASV",
      language: "en",
      passageId: "PSA.121",
    });
  });

  it("U-W35: the passageId is ECHOED from the provider, never assembled here", async () => {
    // `contracts.ts` closed constructing a usfm as residual risk. Everything this step
    // reports has to be a value the provider handed out.
    const root = await step();
    await pickPsalm121(root);
    const reported = onSelect.mock.calls.at(-1)![0]!;
    expect(reported.passageId).toBe(PASSAGE.passageId);
    expect(fetchBiblePassage).toHaveBeenCalledWith("12", "PSA.121");
  });

  it("U-W36: renders the live passage preview with the REAL reference", async () => {
    // Flag F5: the figure's header literals ("66", "1,900+", "PSALM 121:1–4") are drawn
    // values, not data. Everything printed is interpolated from the response.
    const root = await step();
    await pickPsalm121(root);
    const header = byTestId(root, "wizard-passage-reference").textContent ?? "";
    expect(header).toContain("Psalm 121");
    expect(header).toContain("ASV");
    expect(byTestId(root, "wizard-passage-preview").textContent).toContain(
      "I will lift up mine eyes",
    );
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

  it("U-W40: the VERSE RANGE the figure draws is genuinely absent, not half-built", async () => {
    // 18a selects verses 1–4 and offers "Whole chapter". A range is a CONSTRUCTED usfm,
    // which `contracts.ts` deliberately closed. Omit rather than fake — and a negative test
    // so a later pass cannot transcribe it back in from the drawing without reopening the
    // decision.
    const root = await step();
    await pickPsalm121(root);
    expect(root.textContent).not.toContain("Whole chapter");
    expect(root.textContent).not.toContain("each verse becomes a scene");
    expect(onSelect.mock.calls.at(-1)![0]!.passageId).not.toContain("-");
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
      expect.objectContaining({ reference: "Psalm 121" }),
    );
    await click(byTestId(root, "wizard-skip-scripture"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
