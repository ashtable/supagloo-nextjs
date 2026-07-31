// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byTestId, click, flush, mount } from "./support/render";

/**
 * WHICH SCENE IS THE INSPECTOR SHOWING?
 * ====================================
 *
 * This file exists because of a misdiagnosed real-lane failure on 2026-07-30.
 * `studio-hydration.e2e.ts` E-SH2 ("an edited scene script commits and survives a fresh
 * re-open") ran for the FIRST time in its existence and failed with
 *
 *     expected 'And God saw the light, that it was go…' to contain 'Persisted edit ms8kh8jqapoqqs'
 *
 * which reads exactly like silent data loss: the commit had settled clean, with zero
 * `commit-error`, and the re-opened page showed the ORIGINAL generated script. It was not
 * data loss. The edit reached the repo — `ashtable/supagloo-e2e-delete-me-hydrate-edit-
 * ms8kh9fca9d2d735`, working branch `v0.0.1`, commit `71cb0f5` ("Update scene: The
 * Creation of Light"), whose diff is one line in `supagloo.project.json`:
 * `scenes[0].scriptText` → `"Persisted edit ms8kh8jqapoqqs"`. The string the assertion
 * read is scene `s2`'s untouched script.
 *
 * The spec had simply read a DIFFERENT SCENE, because the studio has two entry points that
 * disagree about which scene is in front of the user, and both are deliberate:
 *
 *   - `STORYBOARD_GENERATED` selects `scenes[0]` — "a (re)planned storyboard replaces the
 *     scenes wholesale; select the first";
 *   - `initialStudioState` selects `scenes[1]` — the 5a wireframe opens on scene 02.
 *
 * So an edit made right after a generation lands on scene 1, and a FRESH re-open of the
 * same project shows scene 2. Neither is wrong; assuming they agree is.
 *
 * What was missing was any way for a test to notice. The inspector renders four
 * attribute-only seams (`data-visual-asset-key`, `data-scene-reference`,
 * `data-scene-translation`, `data-visual-asset-kind`) and `script-input`, but it never
 * said WHICH scene those belong to — so `script-input` was un-attributable by
 * construction, and a spec reading it could only hope. `data-scene-id` closes that, and
 * these tests hold it: the id must name the scene actually RENDERED, which is not always
 * the one merely selected (the inspector falls back to `scenes[0]` for a selection that
 * matches nothing).
 *
 * The fixture is the real failing run's storyboard — Genesis 1:3/1:4/1:5 — so U-SI2
 * reproduces the exact confusion in-process, with no stack and no GitHub.
 */

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
  cancelGeneration: vi.fn(),
}));
vi.mock("@/lib/studio/model-catalogue-data", () => ({
  fetchModelCatalogue: vi.fn(async () => null),
}));

import SceneInspector from "@/app/studio/_components/scene-inspector";
import SceneTree from "@/app/studio/_components/scene-tree";
import { StudioProvider } from "@/app/studio/_components/studio-context";
import { hydrateStoryboard } from "@/lib/studio/manifest-adapter";
import type { StudioProject } from "@/lib/studio/project";
import type { ProjectManifest } from "@/lib/api/contracts";

/** The manifest the failing E-SH2 run actually committed, before its edit. */
const MANIFEST: ProjectManifest = {
  manifestVersion: 1,
  composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
  scenes: [
    {
      id: "s1",
      name: "The Creation of Light",
      scriptText: "And God said, Let there be light: and there was light.",
      reference: "Genesis 1:3",
      translation: "King James Version",
      visualPrompt: "A pitch-black screen suddenly explodes with a warm light flare.",
      durationSeconds: 6,
      captions: true,
    },
    {
      id: "s2",
      name: "Separation of Light and Dark",
      scriptText:
        "And God saw the light, that it was good: and God divided the light from the darkness.",
      reference: "Genesis 1:4",
      translation: "King James Version",
      visualPrompt: "Golden light cleaving a field of darkness.",
      durationSeconds: 7,
      captions: true,
    },
    {
      id: "s3",
      name: "The First Day",
      scriptText:
        "And God called the light Day, and the darkness he called Night. And the evening and the morning were the first day.",
      reference: "Genesis 1:5",
      translation: "King James Version",
      visualPrompt: "Dawn breaking over a formless sea.",
      durationSeconds: 8,
      captions: true,
    },
  ],
  narratorVoice: {
    description: "A deep, authoritative, and warm masculine voice with a slow pace.",
    label: "The Narrator",
  },
  music: { style: "Cinematic, swelling orchestral" },
};

const project = (): StudioProject => ({
  id: "cuid-genesis",
  slug: "genesis-1",
  projectName: "genesis-1",
  repo: "ashtable/genesis-1",
  versionBranch: "v0.0.1",
  storyboard: hydrateStoryboard(MANIFEST),
  manifest: MANIFEST,
});

let mounted: { container: HTMLElement; unmount: () => void } | null = null;

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

/** Mount the two surfaces that share ONE `selectedSceneId` — the tree selects, the
 *  inspector renders. Both are needed: the whole property under test is that they agree. */
async function openStudio(): Promise<HTMLElement> {
  mounted = await mount(
    <StudioProvider project={project()}>
      <SceneTree />
      <SceneInspector />
    </StudioProvider>,
  );
  await flush();
  return mounted.container;
}

/** The scene the inspector says it is rendering. */
function inspectorSceneId(root: HTMLElement): string | null {
  return byTestId(root, "scene-inspector").getAttribute("data-scene-id");
}

/** The script the inspector is actually offering for edit. */
function scriptValue(root: HTMLElement): string {
  return (byTestId(root, "script-input") as HTMLTextAreaElement).value;
}

function selectSceneRow(root: HTMLElement, sceneId: string): Promise<void> {
  const row = root.querySelector<HTMLElement>(
    `[data-testid="scene-tree-row"][data-scene-id="${sceneId}"]`,
  );
  if (!row) throw new Error(`no scene-tree row for ${sceneId}`);
  return click(row);
}

describe("the inspector names the scene it is rendering", () => {
  it("U-SI1: `script-input` is attributable — the inspector reports the scene whose script it shows", async () => {
    // The seam that did not exist. Without it a test reading `script-input` is reading an
    // anonymous textarea: it can assert the CONTENT and never the SUBJECT, which is
    // precisely how a selection difference gets reported as a lost commit.
    const root = await openStudio();
    const id = inspectorSceneId(root);
    expect(id).toBeTruthy();
    const scene = MANIFEST.scenes.find((s) => s.id === id);
    expect(scene).toBeDefined();
    expect(scriptValue(root)).toBe(scene!.scriptText);
  });

  it("U-SI2: a FRESH open shows scene 2, not scene 1 — the divergence that broke E-SH2", async () => {
    // `initialStudioState` opens on `scenes[1]` (the 5a wireframe's scene 02) while
    // `STORYBOARD_GENERATED` selects `scenes[0]`. So the scene a just-generated storyboard
    // leaves in front of the user is NOT the scene a re-open shows. Pinned here as a fact
    // about the app, deliberately not "fixed": changing either entry point is a product
    // decision, and the mock lane's inspector anchors `SCENE 02` byte-for-byte.
    const root = await openStudio();
    expect(inspectorSceneId(root)).toBe("s2");
    // …and this is verbatim the string the failing assertion read while looking for the
    // edit that had, in fact, been committed to s1.
    expect(scriptValue(root)).toContain("And God saw the light, that it was good");
  });

  it("U-SI3: selecting a scene in the tree moves the inspector to THAT scene — for every scene", async () => {
    // The mechanism the fixed E-SH2 relies on. Driven over the whole storyboard rather
    // than one convenient member, so it cannot pass by landing on the scene that happened
    // to be selected already.
    const root = await openStudio();
    for (const scene of MANIFEST.scenes) {
      await selectSceneRow(root, scene.id);
      expect(inspectorSceneId(root)).toBe(scene.id);
      expect(scriptValue(root)).toBe(scene.scriptText);
    }
  });

  it("U-SI4: the tree's selected row and the inspector's scene id are the SAME scene", async () => {
    // Two surfaces over one `selectedSceneId` (D-SCENE-TREE-SELECTION). An e2e that clicks
    // a row and then reads the inspector is trusting this; the inspector's own fallback
    // (`?? scenes[0]`) means the two CAN differ, so it is asserted rather than assumed.
    const root = await openStudio();
    await selectSceneRow(root, "s3");
    const selectedRow = root.querySelector<HTMLElement>(
      '[data-testid="scene-tree-row"][data-selected="true"]',
    );
    expect(selectedRow?.getAttribute("data-scene-id")).toBe("s3");
    expect(inspectorSceneId(root)).toBe("s3");
  });
});
