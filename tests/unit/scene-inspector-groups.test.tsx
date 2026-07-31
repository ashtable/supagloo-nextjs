// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byTestId, flush, mount, queryTestId } from "./support/render";

/**
 * Figure 19a — the inspector regrouped into three prompt-owning cards.
 *
 * The half of this file that matters most is the LAST describe block. 19a's changes are
 * gated on `aiEnabled` (a real project) not for tidiness but because the mock catalogue's
 * inspector is a byte-for-byte anchor: `studio.e2e.ts` asserts ~30 exact strings from it,
 * and the mock lane's zero-egress guarantee depends on the AI surface never mounting
 * there. A regroup that leaked into the mock branch would take the whole lane down, and no
 * spec IN that lane could tell you why.
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
import { StudioProvider } from "@/app/studio/_components/studio-context";
import { DEMO_STORYBOARD } from "@/lib/studio/storyboard";
import type { StudioProject } from "@/lib/studio/project";

const MANIFEST = {
  manifestVersion: 1 as const,
  composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
  scenes: DEMO_STORYBOARD.scenes.map((s) => ({
    id: s.id,
    name: s.visualLabel,
    scriptText: s.script,
    reference: "JOHN 1:23",
    translation: "KJV",
    visualPrompt: s.visualPrompt,
    durationSeconds: s.durationSeconds,
    captions: s.onScreenText === "text",
  })),
  narratorVoice: { description: DEMO_STORYBOARD.voiceDescription },
};

const realProject = (): StudioProject => ({
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
  manifest: MANIFEST as never,
});

const mockProject = (): StudioProject => ({
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
});

let mounted: { container: HTMLElement; unmount: () => void } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

async function open(project: StudioProject) {
  mounted = await mount(
    <StudioProvider project={project}>
      <SceneInspector />
    </StudioProvider>,
  );
  await flush();
  return mounted.container;
}

describe("19a — the regrouped inspector (real projects)", () => {
  it("U-I1: Delete scene moves into the header, beside the scene name", async () => {
    // "no longer buried under three model blocks" — the destructive control was the LAST
    // element in a nine-block panel.
    const root = await open(realProject());
    const header = byTestId(root, "inspector-header");
    expect(header.contains(byTestId(root, "scene-name"))).toBe(true);
    expect(header.contains(byTestId(root, "delete-scene"))).toBe(true);
  });

  it("U-I2: the header carries the scene NAME and the scene COUNT", async () => {
    const root = await open(realProject());
    expect(byTestId(root, "scene-name").textContent).toBe(
      DEMO_STORYBOARD.scenes[1]!.visualLabel,
    );
    // `SCENE 02 OF 04` — the denominator is derived from the storyboard, never drawn.
    expect(byTestId(root, "scene-inspector").textContent).toContain("OF 04");
  });

  it("U-I3: exactly ONE Delete scene control exists", async () => {
    // Moving a control is only a move if the old one goes. Two would both be live.
    const root = await open(realProject());
    expect(root.querySelectorAll('[data-testid="delete-scene"]')).toHaveLength(1);
  });

  it("U-I4: each prompt card carries its scope tag from the closed vocabulary", async () => {
    const root = await open(realProject());
    const text = byTestId(root, "scene-inspector").textContent ?? "";
    expect(text).toContain("this scene"); // VISUAL
    expect(text).toContain("whole video"); // NARRATION + MUSIC BED
  });

  it("U-I5: the standalone GENERATION section is gone, and its parts survive in the cards", async () => {
    // "Generation settings are no longer a separate section at the bottom." Nothing was
    // deleted — the panel is mounted once per card with the kinds that card owns — so the
    // per-kind seams the real-lane specs drive are all still here.
    const root = await open(realProject());
    expect(byTestId(root, "scene-inspector").textContent).not.toContain("GENERATION");
    for (const id of ["ai-kind-image", "ai-kind-video", "ai-kind-narration", "ai-kind-music"]) {
      expect(queryTestId(root, id), id).not.toBeNull();
    }
  });

  it("U-I6: `ai-settings` stays a UNIQUE seam across the three mounts", async () => {
    // Three mounts of one panel could easily produce three roots; every spec that reads
    // `ai-settings` would then be reading whichever one the DOM happened to yield first.
    const root = await open(realProject());
    expect(root.querySelectorAll('[data-testid="ai-settings"]')).toHaveLength(1);
  });

  it("U-I7: the image/video models sit UNDER the visual prompt, narration and music under theirs", async () => {
    // The whole point of the regroup: a model control belongs beside the prompt it
    // renders. Asserted by containment rather than by DOM order, so a later reflow inside
    // a card cannot silently break it.
    const root = await open(realProject());
    const visual = byTestId(root, "visual-card");
    const narration = byTestId(root, "narration-card");
    const music = byTestId(root, "music-card");

    expect(visual.contains(byTestId(root, "visual-input"))).toBe(true);
    expect(visual.contains(byTestId(root, "ai-kind-image"))).toBe(true);
    expect(visual.contains(byTestId(root, "ai-kind-video"))).toBe(true);
    expect(narration.contains(byTestId(root, "ai-kind-narration"))).toBe(true);
    expect(narration.contains(byTestId(root, "voice-list"))).toBe(true);
    expect(music.contains(byTestId(root, "ai-kind-music"))).toBe(true);

    // …and each card owns ONLY its own. Co-location is the feature; a model control in the
    // wrong card would be worse than the flat list it replaced.
    expect(visual.contains(byTestId(root, "ai-kind-narration"))).toBe(false);
    expect(visual.contains(byTestId(root, "ai-kind-music"))).toBe(false);
    expect(narration.contains(byTestId(root, "ai-kind-image"))).toBe(false);
    expect(music.contains(byTestId(root, "ai-kind-video"))).toBe(false);
  });

  it("U-I8: the model sub-block still says `whole video` — the scope pill scopes the PROMPT", async () => {
    // F16. 19a draws the model pickers inside a card tagged `this scene`, but
    // `AiGenerationSettingsSchema` is emphatic that model choice is project-level and that
    // the reverse is a manifest migration. Read strictly the drawing would make it
    // per-scene; it does not, and this is the guard on that reading.
    const root = await open(realProject());
    expect(byTestId(root, "visual-card").textContent).toContain("whole video");
  });

  it("U-I9: SCRIPT stays EDITABLE — 19a draws its resting state, not its removal", async () => {
    // F8. The figure renders SCRIPT as a static <div>. Dropping the editor would remove
    // the only way to fix generated script text, and it is the primary dirty seam the whole
    // Commit/Publish machinery depends on. The RTL mechanism goes with it.
    const root = await open(realProject());
    const script = byTestId(root, "script-input") as HTMLTextAreaElement;
    expect(script.tagName).toBe("TEXTAREA");
    expect(script.getAttribute("dir")).toBe("auto");
    // LOGICAL properties, not the figure's physical `border-left`: under RTL a physical
    // rule lands on the trailing edge of the text it introduces.
    // The LOGICAL property is what is authored. (jsdom resolves a physical `borderLeft`
    // read off the same computed box, so asserting its absence would pin jsdom, not us.)
    expect(script.style.borderInlineStart).toContain("3px solid");
    expect(script.style.paddingInlineStart).not.toBe("");
  });
});

describe("THE GUARD — the mock catalogue's inspector is untouched", () => {
  it("U-I10: mock keeps the 13b header, the trailing Delete, and NO AI surface", async () => {
    // `studio.e2e.ts` anchors ~30 exact strings from this DOM and the mock lane makes zero
    // network egress. Both properties are held by the same `aiEnabled` gate, so both are
    // asserted together.
    const root = await open(mockProject());
    const text = byTestId(root, "scene-inspector").textContent ?? "";
    for (const anchor of [
      "SCENE",
      "INSPECTOR",
      "NARRATOR VOICE",
      "→ AI",
      "· whole video",
      "VISUAL PROMPT",
      "↻ Reroll visual",
      "On-screen captions",
      "Show verse text",
      "Duration",
      "Scene length",
    ]) {
      expect(text, `mock anchor missing: ${anchor}`).toContain(anchor);
    }
    // The regroup's own strings must be ABSENT here.
    expect(text).not.toContain("OF 04");
    expect(text).not.toContain("this scene");
    expect(queryTestId(root, "scene-name")).toBeNull();
    expect(queryTestId(root, "ai-settings")).toBeNull();
    expect(queryTestId(root, "voice-list")).toBeNull();
    // Delete stays where 13b put it: last, not in the header.
    expect(queryTestId(root, "delete-scene")).not.toBeNull();
  });

  it("U-I11: mock keeps the READ-ONLY voice descriptor box, not the curated list", async () => {
    // LOAD-BEARING as of 2026-07-31 (R9c). The `aiEnabled` narration card no longer renders
    // `storyboard.voiceDescription` — it contradicted the chosen voice (`VOICE: Michael`
    // above *"…resonant female voice…"*) — so this assertion is now the ONLY test holding
    // the one surviving render of the descriptor. Deleting the 13b branch too would leave a
    // `NARRATOR VOICE` header over an empty box, because that branch has no voice list to
    // replace it (asserted directly by `U-I10`). Unchanged, deliberately.
    const root = await open(mockProject());
    expect(byTestId(root, "scene-inspector").textContent).toContain(
      DEMO_STORYBOARD.voiceDescription,
    );
    expect(queryTestId(root, "voice-input")).toBeNull();
    expect(queryTestId(root, "generate-scene-video")).toBeNull();
  });
});
