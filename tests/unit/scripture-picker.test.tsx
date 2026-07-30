// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, flush, mount, queryTestId, selectOption } from "./support/render";
import type { Mounted } from "./support/render";
import type { ProjectManifest } from "@/lib/api/contracts";

/**
 * Task item 1 — the Inspector scripture picker (language → translation → book →
 * chapter → verse), at the component boundary.
 *
 * Two things here are decisions rather than layout:
 *  - **the picker only exists for a REAL project.** It is gated on `project.manifest`,
 *    the same signal the voice/music AI controls already use. That keeps the 13b mock
 *    inspector byte-for-byte for the mock e2e lane AND guarantees that lane makes zero
 *    network egress — which is the whole point of the mock lane existing.
 *  - **picking a verse writes script + reference + translation in one action**, so the
 *    caption follows automatically (`visibleCaption(scene) === scene.script`) and the
 *    manifest keeps a scripture that matches the text on screen.
 */

const {
  fetchBibleLanguages,
  fetchBibleTranslations,
  fetchBibleBooks,
  fetchBibleChapters,
  fetchBibleVerses,
  fetchBiblePassage,
} = vi.hoisted(() => ({
  fetchBibleLanguages: vi.fn(),
  fetchBibleTranslations: vi.fn(),
  fetchBibleBooks: vi.fn(),
  fetchBibleChapters: vi.fn(),
  fetchBibleVerses: vi.fn(),
  fetchBiblePassage: vi.fn(),
}));

vi.mock("@/lib/studio/scripture-data", () => ({
  fetchBibleLanguages,
  fetchBibleTranslations,
  fetchBibleBooks,
  fetchBibleChapters,
  fetchBibleVerses,
  fetchBiblePassage,
}));
vi.mock("@/lib/studio/studio-data", () => ({
  commitVersion: vi.fn(),
  publishVersion: vi.fn(),
  fetchVersions: vi.fn(async () => null),
}));
vi.mock("@/lib/studio/render-data", () => ({
  startRenderJob: vi.fn(),
  cancelRenderJob: vi.fn(),
  fetchRenderDownloadUrl: vi.fn(),
  pollRenderUntilTerminal: vi.fn(),
}));
vi.mock("@/lib/studio/ai-generation-data", () => ({
  createGeneration: vi.fn(),
  pollGenerationUntilTerminal: vi.fn(),
  presignDownload: vi.fn(),
}));

import SceneInspector from "@/app/studio/_components/scene-inspector";
import { StudioProvider } from "@/app/studio/_components/studio-context";
import { DEMO_STORYBOARD } from "@/lib/studio/storyboard";
import type { StudioProject } from "@/lib/studio/project";

const MANIFEST: ProjectManifest = {
  manifestVersion: 1,
  composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
  narratorVoice: { description: "warm baritone" },
  scenes: DEMO_STORYBOARD.scenes.map((s) => ({
    id: s.id,
    name: s.visualLabel,
    scriptText: s.script,
    reference: "JOHN 1:23",
    translation: "KJV",
    visualPrompt: s.visualPrompt,
    durationSeconds: s.durationSeconds,
    captions: true,
  })),
};

const project = (over: Partial<StudioProject> = {}): StudioProject => ({
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
  manifest: MANIFEST,
  ...over,
});

const LANGUAGES = [
  { tag: "en", name: "English", direction: "ltr" as const },
  { tag: "ar", name: "Arabic", endonym: "العربية", direction: "rtl" as const },
];
const ENGLISH = [
  { id: "12", abbreviation: "ASV", title: "American Standard Version" },
  { id: "3034", abbreviation: "BSB", title: "Berean Standard Bible" },
];
const BOOKS = [
  { usfm: "GEN", title: "Genesis", canon: "old_testament" },
  { usfm: "EXO", title: "Exodus", canon: "old_testament" },
];
const CHAPTERS = [
  { id: "1", passageId: "GEN.1", title: "1" },
  { id: "2", passageId: "GEN.2", title: "2" },
];
const VERSES = [
  { id: "1", passageId: "GEN.1.1", title: "1" },
  { id: "2", passageId: "GEN.1.2", title: "2" },
];

function happyPath() {
  fetchBibleLanguages.mockResolvedValue(LANGUAGES);
  fetchBibleTranslations.mockResolvedValue(ENGLISH);
  fetchBibleBooks.mockResolvedValue(BOOKS);
  fetchBibleChapters.mockResolvedValue(CHAPTERS);
  fetchBibleVerses.mockResolvedValue(VERSES);
  fetchBiblePassage.mockResolvedValue({
    passageId: "GEN.1.1",
    text: "In the beginning God created the heavens and the earth.",
    reference: "Genesis 1:1",
  });
}

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.resetAllMocks();
});

async function open(p: StudioProject = project()) {
  mounted = await mount(
    <StudioProvider project={p}>
      <SceneInspector />
    </StudioProvider>,
  );
  await flush();
  await flush();
  return mounted.container;
}

describe("ScripturePicker", () => {
  // U-PK1 pins the NO-ORIGIN-PASSAGE case, and after 2026-07-30 that is what it means:
  // this fixture's manifest carries no `scripture` block (a project created via the
  // wizard's SKIP control), so there is nothing to bind the cascade to and the designed
  // placeholders are the correct render. The reported "select book / select cha / select
  // ve" symptom was a project that DID have a passage — U-PK8 below.
  it("U-PK1: renders the five cascading selects with the designed placeholders", async () => {
    happyPath();
    const root = await open();
    const picker = byTestId(root, "scripture-picker");

    for (const id of [
      "picker-language",
      "picker-translation",
      "picker-book",
      "picker-chapter",
      "picker-verse",
    ]) {
      expect(byTestId(picker, id).tagName, id).toBe("SELECT");
    }
    expect(byTestId(picker, "picker-book").textContent).toContain("select book");
    expect(byTestId(picker, "picker-chapter").textContent).toContain("select chapter");
  });

  it("U-PK2: the first studio load lazily fetches languages AND the default language's translations — exactly once each", async () => {
    happyPath();
    const root = await open();

    expect(fetchBibleLanguages).toHaveBeenCalledTimes(1);
    expect(fetchBibleTranslations).toHaveBeenCalledTimes(1);
    expect(fetchBibleTranslations.mock.calls[0][0]).toBe("en");

    // USER DECISION D1: the default translation is ASV — chosen from the returned
    // collection, never a hardcoded id.
    expect((byTestId(root, "picker-translation") as HTMLSelectElement).value).toBe("12");
    // books for the default translation are fetched off the back of that selection
    expect(fetchBibleBooks).toHaveBeenCalledWith("12");
  });

  it("U-PK3: choosing a book fetches its chapters and CLEARS any chapter/verse below it", async () => {
    happyPath();
    const root = await open();
    const picker = byTestId(root, "scripture-picker");

    await selectOption(byTestId(picker, "picker-book"), "GEN");
    await flush();
    expect(fetchBibleChapters).toHaveBeenCalledWith("12", "GEN");

    await selectOption(byTestId(picker, "picker-chapter"), "1");
    await flush();
    expect(fetchBibleVerses).toHaveBeenCalledWith("12", "GEN", "1");

    // now switch the book — chapter and verse must reset, not linger
    fetchBibleChapters.mockResolvedValue([{ id: "1", passageId: "EXO.1", title: "1" }]);
    await selectOption(byTestId(picker, "picker-book"), "EXO");
    await flush();
    expect((byTestId(picker, "picker-chapter") as HTMLSelectElement).value).toBe("");
    expect((byTestId(picker, "picker-verse") as HTMLSelectElement).value).toBe("");
  });

  it("U-PK4: picking a verse fills the Script textarea — and therefore the caption — and records the scripture", async () => {
    happyPath();
    const root = await open();
    const picker = byTestId(root, "scripture-picker");

    await selectOption(byTestId(picker, "picker-book"), "GEN");
    await flush();
    await selectOption(byTestId(picker, "picker-chapter"), "1");
    await flush();
    await selectOption(byTestId(picker, "picker-verse"), "GEN.1.1");
    await flush();

    // the passage was requested by the ECHOED passage_id, never a rebuilt ref
    expect(fetchBiblePassage).toHaveBeenCalledWith("12", "GEN.1.1");

    const script = byTestId(root, "script-input") as HTMLTextAreaElement;
    expect(script.value).toBe(
      "In the beginning God created the heavens and the earth.",
    );
    // the scene's own scripture moved with it (the seam task 57 added)
    const inspector = byTestId(root, "scene-inspector");
    expect(inspector.getAttribute("data-scene-reference")).toBe("Genesis 1:1");
    expect(inspector.getAttribute("data-scene-translation")).toBe("ASV");
  });

  it("U-PK5: the Script textarea resolves direction from its own content (dir=auto), so RTL scripture reads correctly", async () => {
    happyPath();
    const root = await open();
    const script = byTestId(root, "script-input");
    // `dir="auto"` is the platform's first-strong-character algorithm. It is used in the
    // preview AND in the generated Remotion source, so the two cannot disagree.
    expect(script.getAttribute("dir")).toBe("auto");
    // the quote rule must be a LOGICAL border, or under RTL it lands on the trailing edge
    const inline = script.getAttribute("style") ?? "";
    expect(inline).toContain("border-inline-start");
    expect(inline).toContain("padding-inline-start");
    expect(inline).not.toContain("border-left");
    expect(inline).not.toContain("padding-left");
  });

  it("U-PK6: a failed catalogue fetch degrades honestly — a disabled select and a message, never a throw", async () => {
    fetchBibleLanguages.mockResolvedValue(null);
    fetchBibleTranslations.mockResolvedValue(null);
    fetchBibleBooks.mockResolvedValue(null);
    const root = await open();
    const picker = byTestId(root, "scripture-picker");

    expect((byTestId(picker, "picker-language") as HTMLSelectElement).disabled).toBe(true);
    expect(byTestId(picker, "picker-error").textContent).toBeTruthy();
    // the rest of the inspector still works
    expect(byTestId(root, "script-input")).toBeTruthy();
  });

  it("U-PK6b: the advisory CLEARS on the next success — last-write-wins, not a session-long latch", async () => {
    // `failed` gates ONLY the advisory line; every select's `disabled` is derived from
    // whether its own options exist. So a transient blip left the message on screen
    // FOREVER while the picker carried on working perfectly — the app telling the user
    // it cannot reach YouVersion at the same moment it is reaching YouVersion.
    fetchBibleLanguages.mockResolvedValue(LANGUAGES);
    fetchBibleTranslations.mockResolvedValue(null); // the default language's collection blips
    const root = await open();
    expect(queryTestId(root, "picker-error")).not.toBeNull();

    // the user's next action is a real one, and it succeeds
    fetchBibleTranslations.mockResolvedValue(ENGLISH);
    fetchBibleBooks.mockResolvedValue(BOOKS);
    await selectOption(byTestId(root, "picker-language"), "ar");
    await flush();
    await flush();

    expect(fetchBibleTranslations).toHaveBeenLastCalledWith("ar");
    expect(queryTestId(root, "picker-error")).toBeNull();
  });

  it("U-PK7: the MOCK catalogue gets NO picker and makes NO request (the mock e2e lane has no egress)", async () => {
    happyPath();
    const mock = project();
    delete mock.manifest;
    const root = await open(mock);

    expect(queryTestId(root, "scripture-picker")).toBeNull();
    expect(fetchBibleLanguages).not.toHaveBeenCalled();
    expect(fetchBibleTranslations).not.toHaveBeenCalled();
  });
});

/**
 * The project's ORIGIN passage in the studio (2026-07-30).
 *
 * The reported symptom was three placeholder selects — "select book", "select cha",
 * "select ve" — on a project the user had just created by choosing NIV11 / Psalms / 23 in
 * the wizard. The picker took no manifest input at all: pure local `useState` seeded with
 * `EMPTY_SELECTION`, pre-selecting a TRANSLATION only.
 *
 * ── Why the picker was BOUND rather than removed ────────────────────────────────────
 * Wireframe turn 18 moved "the pickers" into the New-project wizard and turn 19a's
 * exhaustive Inspector spec contains no scripture controls, so removing this surface was
 * the other defensible reading. It was not chosen, because what turn 18 moved is *choosing
 * the project's origin passage* — which this run completes — while what this component
 * DOES is insert one verse's exact provider text into the SELECTED SCENE's script
 * (`pickScripture` → `PICK_SCRIPTURE`). Nothing in the wizard replaces that, 19a never
 * names it, and deleting a shipped capability on the strength of an omission is a one-way
 * door. Binding touches the cascade SEED only; the write path is still per-scene, so the
 * project passage and per-scene scripture are not conflated.
 */
const ORIGIN_MANIFEST: ProjectManifest = {
  ...MANIFEST,
  scripture: {
    reference: "Psalms 23",
    translation: "BSB",
    language: "en",
    passageId: "PSA.23",
  },
};

function psalmsPath() {
  fetchBibleLanguages.mockResolvedValue(LANGUAGES);
  fetchBibleTranslations.mockResolvedValue(ENGLISH);
  fetchBibleBooks.mockResolvedValue([
    { usfm: "GEN", title: "Genesis", canon: "old_testament" },
    { usfm: "PSA", title: "Psalms", canon: "old_testament" },
  ]);
  // The LIVE chapter shape: `id` is the bare number, `passageId` is the USFM. Verified
  // 2026-07-30 across four bible/book combinations.
  fetchBibleChapters.mockResolvedValue([
    { id: "22", passageId: "PSA.22", title: "22" },
    { id: "23", passageId: "PSA.23", title: "23" },
  ]);
  fetchBibleVerses.mockResolvedValue([
    { id: "1", passageId: "PSA.23.1", title: "1" },
    { id: "2", passageId: "PSA.23.2", title: "2" },
  ]);
  fetchBiblePassage.mockResolvedValue({
    passageId: "PSA.23.1",
    text: "The LORD is my shepherd; I shall not want.",
    reference: "Psalms 23:1",
  });
}

describe("ScripturePicker — bound to the project's origin passage", () => {
  it("U-PK8: opens on the project's language / translation / book / chapter — no empty selects", async () => {
    psalmsPath();
    const root = await open(project({ manifest: ORIGIN_MANIFEST }));
    await flush();
    const picker = byTestId(root, "scripture-picker");

    expect((byTestId(picker, "picker-language") as HTMLSelectElement).value).toBe("en");
    expect((byTestId(picker, "picker-translation") as HTMLSelectElement).value).toBe("3034");
    expect((byTestId(picker, "picker-book") as HTMLSelectElement).value).toBe("PSA");
    expect((byTestId(picker, "picker-chapter") as HTMLSelectElement).value).toBe("23");
  });

  it("U-PK9: the manifest's translation is resolved BY ABBREVIATION and outranks the ASV default", async () => {
    // USER DECISION D1 keeps ASV as the picker's PREFERENCE (KJV is measurably not
    // licensed to our app key). A project that already has a translation is not a
    // preference — it is a fact, and it wins. §9-Q10 still holds: the id is looked up in
    // whatever the live collection returned, never hardcoded.
    psalmsPath();
    const root = await open(project({ manifest: ORIGIN_MANIFEST }));
    await flush();
    expect((byTestId(root, "picker-translation") as HTMLSelectElement).value).toBe("3034");
    expect(fetchBibleBooks).toHaveBeenCalledWith("3034");
  });

  it("U-PK9b: a translation the live collection does NOT have falls back to the ASV preference", async () => {
    // Licensing can be withdrawn, and the manifest is a historical record. Refusing to
    // render a picker over it would be worse than opening on the default.
    psalmsPath();
    const root = await open(
      project({
        manifest: {
          ...MANIFEST,
          scripture: { reference: "Psalms 23", translation: "NIV11", passageId: "PSA.23" },
        },
      }),
    );
    await flush();
    expect((byTestId(root, "picker-translation") as HTMLSelectElement).value).toBe("12");
  });

  it("U-PK10: the chapter is matched by its ECHOED passageId, not by parsing a number out of it", async () => {
    // A chapter's `id` and its `passageId` are two separate provider strings. Deriving one
    // from the other would be exactly the "construct a usfm" move this codebase closed.
    psalmsPath();
    fetchBibleChapters.mockResolvedValue([
      { id: "ch-a", passageId: "PSA.22", title: "22" },
      { id: "ch-b", passageId: "PSA.23", title: "23" },
    ]);
    const root = await open(project({ manifest: ORIGIN_MANIFEST }));
    await flush();
    expect((byTestId(root, "picker-chapter") as HTMLSelectElement).value).toBe("ch-b");
  });

  it("U-PK11: the read-only project passage line renders the reference and translation", async () => {
    // The wireframe's ONE in-studio reference display (13b's burned-in caption,
    // `PSALM 23:1 · KJV`). Read-only: the studio does not edit the project's origin.
    psalmsPath();
    const root = await open(project({ manifest: ORIGIN_MANIFEST }));
    await flush();
    const line = byTestId(root, "project-passage").textContent ?? "";
    expect(line).toContain("Psalms 23");
    expect(line).toContain("BSB");
  });

  it("U-PK11b: a project with NO origin passage shows no passage line at all", async () => {
    psalmsPath();
    const root = await open();
    await flush();
    expect(queryTestId(root, "project-passage")).toBeNull();
  });

  it("U-PK12: binding is ONE-SHOT — a later user choice is not overwritten by the manifest", async () => {
    // The failure this guards is a re-render (or a late list arrival) snapping the user's
    // selection back to the project's origin while they are browsing somewhere else.
    psalmsPath();
    const root = await open(project({ manifest: ORIGIN_MANIFEST }));
    await flush();
    const picker = byTestId(root, "scripture-picker");
    expect((byTestId(picker, "picker-book") as HTMLSelectElement).value).toBe("PSA");

    fetchBibleChapters.mockResolvedValue([{ id: "1", passageId: "GEN.1", title: "1" }]);
    await selectOption(byTestId(picker, "picker-book"), "GEN");
    await flush();
    await flush();

    expect((byTestId(picker, "picker-book") as HTMLSelectElement).value).toBe("GEN");
    expect((byTestId(picker, "picker-chapter") as HTMLSelectElement).value).toBe("");
  });

  it("U-PK13: a VERSE-RANGE passageId still binds book + chapter, and leaves VERSE unset", async () => {
    // The wizard now persists ranges (`PSA.23.1-5`). A range is not a single verse, so
    // pre-selecting one would be an invention; the VERSE select stays honestly empty.
    psalmsPath();
    const root = await open(
      project({
        manifest: {
          ...MANIFEST,
          scripture: {
            reference: "Psalms 23:1-5",
            translation: "BSB",
            language: "en",
            passageId: "PSA.23.1-5",
          },
        },
      }),
    );
    await flush();
    const picker = byTestId(root, "scripture-picker");
    expect((byTestId(picker, "picker-book") as HTMLSelectElement).value).toBe("PSA");
    expect((byTestId(picker, "picker-chapter") as HTMLSelectElement).value).toBe("23");
    expect((byTestId(picker, "picker-verse") as HTMLSelectElement).value).toBe("");
  });

  it("U-PK14: an origin passage with no passageId binds what it can and invents no book", async () => {
    psalmsPath();
    const root = await open(
      project({
        manifest: {
          ...MANIFEST,
          scripture: { reference: "Psalms 23", translation: "BSB", language: "en" },
        },
      }),
    );
    await flush();
    const picker = byTestId(root, "scripture-picker");
    expect((byTestId(picker, "picker-translation") as HTMLSelectElement).value).toBe("3034");
    expect((byTestId(picker, "picker-book") as HTMLSelectElement).value).toBe("");
    expect(byTestId(root, "project-passage").textContent).toContain("Psalms 23");
  });
});
