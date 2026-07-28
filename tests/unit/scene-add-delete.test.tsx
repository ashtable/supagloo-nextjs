// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, flush, mount } from "./support/render";
import type { Mounted } from "./support/render";

/**
 * USER DECISION D3 at the component boundary: "spread one verse across several screens"
 * is delivered by REAL scene mutation, not by a delimiter convention. `＋ Add scene` has
 * been an inert `<div>` since the 13b rebuild (`scene-tree.tsx:146-162`); it becomes a
 * button, and the inspector gains the matching delete so the 10-scene ceiling is not a
 * one-way door.
 *
 * The bounds are proven in the MODEL (`lib/studio/scene-mutation.test.ts`); what is
 * proven here is that the controls report them honestly instead of failing silently.
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
}));

import SceneTree from "@/app/studio/_components/scene-tree";
import SceneInspector from "@/app/studio/_components/scene-inspector";
import { StudioProvider } from "@/app/studio/_components/studio-context";
import {
  DEMO_STORYBOARD,
  MAX_SCENES,
  MIN_SCENES,
  type Scene,
  type Storyboard,
} from "@/lib/studio/storyboard";
import type { StudioProject } from "@/lib/studio/project";

function storyboardOf(count: number): Storyboard {
  const scenes: Scene[] = Array.from({ length: count }, (_, i) => ({
    ...DEMO_STORYBOARD.scenes[0],
    id: `s${i + 1}`,
    index: i + 1,
    script: `line ${i + 1}`,
  }));
  return { ...DEMO_STORYBOARD, scenes };
}

function projectOf(count: number): StudioProject {
  return {
    id: "psalm-121",
    projectName: "psalm-121",
    repo: "ashsrinivas/psalm-121",
    versionBranch: "v0.0.1",
    storyboard: storyboardOf(count),
  };
}

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.resetAllMocks();
});

async function open(count: number) {
  mounted = await mount(
    <StudioProvider project={projectOf(count)}>
      <SceneTree />
      <SceneInspector />
    </StudioProvider>,
  );
  await flush();
  return mounted.container;
}

const rows = (root: ParentNode) =>
  root.querySelectorAll('[data-testid="scene-tree-row"]').length;

describe("scene add / delete", () => {
  it("U-SC1: ＋ Add scene is a real button and actually adds a scene", async () => {
    const root = await open(MIN_SCENES);
    const add = byTestId(root, "scene-tree-add");
    expect(add.tagName).toBe("BUTTON");
    expect(rows(root)).toBe(MIN_SCENES);

    await click(add);
    expect(rows(root)).toBe(MIN_SCENES + 1);
    // The new scene becomes the SELECTED one, so the inspector is already editing the
    // screen the user just made — that is the whole "spread a verse across screens" loop.
    // It opens holding a copy of the source line (an empty `scriptText` fails the
    // manifest schema and would make the project uncommittable), ready to be trimmed.
    const script = byTestId(root, "script-input") as HTMLTextAreaElement;
    expect(script.value).toBe("line 2"); // the demo storyboard opens on scene 2
    expect(byTestId(root, "scene-number").textContent).toBe("03");
  });

  it("U-SC2: at MAX_SCENES the add button is disabled and says why", async () => {
    const root = await open(MAX_SCENES);
    const add = byTestId(root, "scene-tree-add") as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(add.getAttribute("title")).toBe(`Maximum ${MAX_SCENES} scenes.`);

    await click(add);
    expect(rows(root)).toBe(MAX_SCENES);
  });

  it("U-SC3: the inspector's delete removes the selected scene", async () => {
    const root = await open(MIN_SCENES + 1);
    const del = byTestId(root, "delete-scene") as HTMLButtonElement;
    expect(del.disabled).toBe(false);

    await click(del);
    expect(rows(root)).toBe(MIN_SCENES);
  });

  it("U-SC4: at MIN_SCENES the delete is disabled and says why", async () => {
    const root = await open(MIN_SCENES);
    const del = byTestId(root, "delete-scene") as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(del.getAttribute("title")).toBe(`Minimum ${MIN_SCENES} scenes.`);

    await click(del);
    expect(rows(root)).toBe(MIN_SCENES);
  });

  it("U-SC5: the tree rows renumber after an add — no duplicate SCENE NN labels", async () => {
    const root = await open(MIN_SCENES);
    await click(byTestId(root, "scene-tree-add"));
    const labels = [...root.querySelectorAll('[data-testid="scene-tree-row"]')].map(
      (el) => (el.textContent ?? "").slice(0, 10),
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});
