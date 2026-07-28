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
