// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, flush, mount } from "./support/render";
import type { Mounted } from "./support/render";

/**
 * The two whole-video descriptor fields — NARRATOR VOICE and MUSIC BED — hold the same
 * kind of value: a freeform sentence describing a track across the whole video. They
 * were built with different controls, and the mismatch was visible in production: MUSIC
 * BED was a single-line `<input>`, so "Cinematic, ethereal, building from a low drone…"
 * rendered clipped to "Cinematic, ethereal, building fr" with no wrap and no scrollbar.
 * The text was still there; the control just refused to show it, which reads as data loss.
 *
 * Pinned as a PAIR rather than as "music is a textarea", because the property that
 * matters is that these two fields agree — the next descriptor field added here should
 * fail this test until it joins the convention.
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

import SceneInspector from "@/app/studio/_components/scene-inspector";
import { StudioProvider } from "@/app/studio/_components/studio-context";
import { DEMO_STORYBOARD } from "@/lib/studio/storyboard";
import type { StudioProject } from "@/lib/studio/project";

/** `aiEnabled = Boolean(project.manifest)` — the AI controls (incl. MUSIC BED) only
 *  render for a REAL project, so the fixture must carry a manifest. */
const realProject = (): StudioProject => ({
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: {
    ...DEMO_STORYBOARD,
    musicMood: "Cinematic, ethereal, building from a low drone to a full swell",
    voiceDescription: "A deep, commanding, yet calm and authoritative male voice",
  },
  manifest: {} as StudioProject["manifest"],
});

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.resetAllMocks();
});

async function openInspector() {
  mounted = await mount(
    <StudioProvider project={realProject()}>
      <SceneInspector />
    </StudioProvider>,
  );
  await flush();
  return mounted.container;
}

describe("whole-video descriptor fields", () => {
  it("renders BOTH descriptors in a multi-line control", async () => {
    const root = await openInspector();
    for (const testId of ["voice-input", "music-input"]) {
      const el = byTestId(root, testId);
      expect(`${testId}: ${el.tagName}`).toBe(`${testId}: TEXTAREA`);
    }
  });

  it("gives both the same visible line budget", async () => {
    // Equal `rows` is what makes them read as one pair of controls rather than two
    // unrelated ones — and is what stops a long mood from being clipped to one line.
    const root = await openInspector();
    const voice = byTestId(root, "voice-input") as HTMLTextAreaElement;
    const music = byTestId(root, "music-input") as HTMLTextAreaElement;
    expect(music.rows).toBe(voice.rows);
    expect(music.rows).toBeGreaterThan(1);
  });

  it("holds the full descriptor text, not a truncation", async () => {
    const root = await openInspector();
    const music = byTestId(root, "music-input") as HTMLTextAreaElement;
    expect(music.value).toBe(
      "Cinematic, ethereal, building from a low drone to a full swell",
    );
  });
});
