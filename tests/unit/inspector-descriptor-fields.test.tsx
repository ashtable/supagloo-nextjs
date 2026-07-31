// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, flush, mount, queryTestId } from "./support/render";
import type { Mounted } from "./support/render";

/**
 * MUSIC BED holds a freeform sentence describing a track across the whole video, and it
 * was built as a single-line `<input>`: "Cinematic, ethereal, building from a low drone…"
 * rendered clipped to "Cinematic, ethereal, building fr" with no wrap and no scrollbar.
 * The text was still there; the control just refused to show it, which reads as data loss.
 *
 * ## Why this is no longer a PAIR
 *
 * It used to pin NARRATOR VOICE and MUSIC BED together — same kind of value, so the same
 * control — and that was the right property while both were freeform descriptors. Figure
 * 19b removes the narrator one on purpose: OpenRouter speech models take a NAMED voice,
 * the request body is exactly `{model, input, voice, response_format}`, and the typed
 * descriptor reached no provider-facing code at all. It has been replaced by the curated
 * voice list (`voice-list.test.tsx`), so there is no longer a second freeform descriptor
 * for this one to agree with.
 *
 * The multi-line rule still stands for any descriptor field that IS freeform — that is
 * what the surviving assertions hold.
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
  it("renders the music descriptor in a multi-line control", async () => {
    const root = await openInspector();
    const el = byTestId(root, "music-input");
    expect(el.tagName).toBe("TEXTAREA");
  });

  it("gives it more than one visible line", async () => {
    // The original defect: one line, no wrap, no scrollbar, so a long mood looked
    // truncated to the user even though the value was intact.
    const root = await openInspector();
    const music = byTestId(root, "music-input") as HTMLTextAreaElement;
    expect(music.rows).toBeGreaterThan(1);
  });

  it("U-DSC1: the real narration card carries NO stale voice descriptor (R9c)", async () => {
    // FLIPPED 2026-07-31. This case used to require `voice-description` to be PRESENT: the
    // descriptor survived 19b as "read-only context" for the voice choice.
    //
    // The user's screenshot showed why that was wrong. `VOICE` read **Michael** while the
    // box beneath it read *"Warm, wise, and resonant FEMALE voice with a calm pace"* — the
    // storyboard LLM's sentence, written before any voice existed to choose, sitting under a
    // control that had since chosen a different one. It is not context; it is a second
    // answer to the same question, and it contradicts the first. The contradiction needs
    // both a chosen voice AND a generated sentence, so it can only exist in THIS card.
    //
    // `storyboard.voiceDescription` itself is NOT removed and is NOT dead: db-lib's
    // `VoiceDescriptorSchema.description` is required, `manifest-adapter` round-trips it
    // both ways, the storyboard workflow produces it, `studio-context` sends it with every
    // narration request, and the mock (non-`aiEnabled`) card still displays it — which
    // `U-I11` holds, and which is now the ONLY place it renders.
    const root = await openInspector();
    expect(queryTestId(root, "voice-input")).toBeNull();
    expect(queryTestId(root, "voice-list")).not.toBeNull();
    expect(queryTestId(root, "voice-description")).toBeNull();
    // The card is still a card — the deletion must not take the regenerate control with it.
    expect(queryTestId(root, "narration-card")).not.toBeNull();
    expect(queryTestId(root, "regenerate-narration")).not.toBeNull();
  });

  it("holds the full descriptor text, not a truncation", async () => {
    const root = await openInspector();
    const music = byTestId(root, "music-input") as HTMLTextAreaElement;
    expect(music.value).toBe(
      "Cinematic, ethereal, building from a low drone to a full swell",
    );
  });
});
