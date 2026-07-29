// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byTestId, click, deferred, flush, mount, queryTestId } from "./support/render";

/**
 * Figures 20a and 20b — the two frame-level surfaces, MOUNTED.
 *
 * ## Why this file exists
 *
 * `StudioLock` and `VideoWarningGate` mount only under `StudioFrame`
 * (`studio-app.tsx`), which is referenced in exactly two places repo-wide and was
 * imported by no test file. `lib/studio/studio-lock.test.ts` drives the reducer and
 * `tests/unit/video-warning-dialog.test.tsx` drives the dialog as a pure component — both
 * genuinely useful, and neither of them can tell you that either component EVER RENDERS.
 * Every assertion below therefore starts from a click on a real control and ends at the
 * DOM, through the real provider and the real reducer.
 *
 * ## What it pins that the pure tests cannot
 *
 * The Cancel control's two disabled windows are the sharp end. Cancel is disabled while
 * `generationId` is null — the gap between the click and `POST /api/ai/generations`
 * returning — and re-disabled after a 409, with the lock deliberately left UP. Both are
 * properties of the rendered button, not of the reducer.
 */

const createGeneration = vi.fn();
const pollGenerationUntilTerminal = vi.fn();
const presignDownload = vi.fn();
const cancelGeneration = vi.fn();

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
  createGeneration: (...a: unknown[]) => createGeneration(...a),
  pollGenerationUntilTerminal: (...a: unknown[]) => pollGenerationUntilTerminal(...a),
  presignDownload: (...a: unknown[]) => presignDownload(...a),
  cancelGeneration: (...a: unknown[]) => cancelGeneration(...a),
}));
vi.mock("@/lib/studio/model-catalogue-data", () => ({
  fetchModelCatalogue: vi.fn(async () => null),
}));

import SceneInspector from "@/app/studio/_components/scene-inspector";
import StudioLock from "@/app/studio/_components/studio-lock";
import { VideoWarningGate } from "@/app/studio/_components/studio-app";
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

/** A REAL project — `aiEnabled` keys off `project.manifest`, and every control this
 *  file drives is behind that gate. */
const realProject = (): StudioProject => ({
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
  manifest: MANIFEST as never,
});

let mounted: { container: HTMLElement; unmount: () => void } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // The default: never settles, so a generation stays "running" for the whole test and
  // the lock stays mounted while we assert about it.
  pollGenerationUntilTerminal.mockReturnValue(new Promise(() => {}));
  presignDownload.mockResolvedValue(null);
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  window.localStorage.clear();
});

/** `initialStudioState` selects `scenes[1]`, so this is the scene every control below
 *  acts on. Read from the storyboard rather than hardcoded, so a fixture change cannot
 *  quietly make these assertions be about a different scene. */
const SELECTED = DEMO_STORYBOARD.scenes[1];

async function studio() {
  mounted = await mount(
    <StudioProvider project={realProject()}>
      <SceneInspector />
      <StudioLock />
      <VideoWarningGate />
    </StudioProvider>,
  );
  await flush();
  // `document.body`, not the container: the mount helper attaches the container to the
  // body, AND the 20b dialog goes through the shared `Modal`, which portals to the body.
  // Querying the container would find the lock and silently miss every dialog assertion.
  return document.body;
}

// ---------------------------------------------------------------------------
// 20a — the lock
// ---------------------------------------------------------------------------

describe("StudioLock — figure 20a, mounted", () => {
  it("U-L20: is ABSENT while the studio is idle", async () => {
    const root = await studio();
    expect(queryTestId(root, "studio-lock")).toBeNull();
  });

  it("U-L21: mounts as soon as a generation begins, and names the kind + scene", async () => {
    createGeneration.mockReturnValue(new Promise(() => {}));
    const root = await studio();
    await click(byTestId(root, "reroll-visual"));

    const lock = byTestId(root, "studio-lock");
    expect(lock.dataset.generationKind).toBe("image");
    expect(lock.dataset.generationScene).toBe(SELECTED.id);
    expect(byTestId(root, "studio-lock-headline").textContent).toContain(
      "RENDERING SCENE",
    );
    expect(byTestId(root, "studio-lock-target").textContent).toContain("Scene image");
    // Nothing invisible rides along. The lock briefly carried a `display:none` span
    // holding the project name — a rendered string no user or spec could ever read, and a
    // `useStudio().project` subscription taken solely to produce it.
    expect(lock.querySelector('[style*="display: none"]')).toBeNull();
    expect(lock.textContent).not.toContain("psalm-121");
  });

  it("U-L22: Cancel is DISABLED in the window before the create POST returns", async () => {
    // `activeGeneration.generationId` is null between `GENERATION_BEGIN` and
    // `GENERATION_STARTED`. There is nothing to cancel yet, and an enabled control that
    // silently no-ops is worse than a visibly disabled one.
    const create = deferred<string | null>();
    createGeneration.mockReturnValue(create.promise);
    const root = await studio();
    await click(byTestId(root, "reroll-visual"));

    const cancel = byTestId(root, "studio-lock-cancel") as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    // Clicking a disabled button must reach nothing — this is why `click()` dispatches a
    // real DOM event rather than calling the handler.
    await click(cancel);
    expect(cancelGeneration).not.toHaveBeenCalled();

    create.resolve("gen_1");
    await flush();
    expect((byTestId(root, "studio-lock-cancel") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("U-L23: a granted cancel takes the lock down", async () => {
    createGeneration.mockResolvedValue("gen_1");
    cancelGeneration.mockResolvedValue("canceled");
    const root = await studio();
    await click(byTestId(root, "reroll-visual"));
    await flush();

    await click(byTestId(root, "studio-lock-cancel"));
    await flush();
    expect(cancelGeneration).toHaveBeenCalledWith("gen_1");
    expect(queryTestId(root, "studio-lock")).toBeNull();
  });

  it("U-L24: a REFUSED cancel (409) leaves the lock up, shows the refusal line, and re-disables Cancel", async () => {
    // The invented copy for a state no figure draws. Dropping the scrim here would hand
    // the editor back seconds before the result lands into it — the exact race the lock
    // exists to prevent — so the refusal is a message, not a dismissal.
    createGeneration.mockResolvedValue("gen_1");
    cancelGeneration.mockResolvedValue("refused");
    const root = await studio();
    await click(byTestId(root, "reroll-visual"));
    await flush();

    await click(byTestId(root, "studio-lock-cancel"));
    await flush();

    const lock = byTestId(root, "studio-lock");
    expect(lock.textContent).toContain("Too late to cancel — finishing up.");
    expect((byTestId(root, "studio-lock-cancel") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("U-L25: a FAILED cancel is treated like a refusal — the lock never comes down on an unknown outcome", async () => {
    createGeneration.mockResolvedValue("gen_1");
    cancelGeneration.mockResolvedValue("failed");
    const root = await studio();
    await click(byTestId(root, "reroll-visual"));
    await flush();

    await click(byTestId(root, "studio-lock-cancel"));
    await flush();
    expect(queryTestId(root, "studio-lock")).not.toBeNull();
    expect((byTestId(root, "studio-lock-cancel") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("U-L26: the duration hint is derived per kind — video says minutes, an image does not", async () => {
    // 20a hardcodes "Usually 10–20s.", which is wrong for video by an order of magnitude.
    createGeneration.mockReturnValue(new Promise(() => {}));
    const root = await studio();
    await click(byTestId(root, "reroll-visual"));
    expect(byTestId(root, "studio-lock").textContent).toContain(
      "Usually a few seconds.",
    );
  });
});

// ---------------------------------------------------------------------------
// 20b — the gate that decides whether the dialog is ever seen
// ---------------------------------------------------------------------------

describe("VideoWarningGate — figure 20b, mounted", () => {
  it("U-D20: `▶ Generate video` opens the dialog INSTEAD of starting a generation", async () => {
    const root = await studio();
    expect(queryTestId(root, "video-warning-scene")).toBeNull();

    await click(byTestId(root, "generate-scene-video"));
    await flush();

    // The gate rendered the dialog…
    expect(byTestId(root, "video-warning-scene").textContent).toContain(
      `Scene ${String(SELECTED.index).padStart(2, "0")}`,
    );
    // …and nothing was spent.
    expect(createGeneration).not.toHaveBeenCalled();
    expect(queryTestId(root, "studio-lock")).toBeNull();
  });

  it("U-D21: confirming starts the VIDEO generation and the lock follows", async () => {
    createGeneration.mockReturnValue(new Promise(() => {}));
    const root = await studio();
    await click(byTestId(root, "generate-scene-video"));
    await flush();
    await click(byTestId(root, "video-warning-confirm"));
    await flush();

    expect(createGeneration).toHaveBeenCalledTimes(1);
    expect(createGeneration.mock.calls[0][0]).toMatchObject({ kind: "video" });
    expect(byTestId(root, "studio-lock").dataset.generationKind).toBe("video");
  });

  it("U-D22: the recommended path runs the IMAGE generation — 20b's cheap option needs no new endpoint", async () => {
    createGeneration.mockReturnValue(new Promise(() => {}));
    const root = await studio();
    await click(byTestId(root, "generate-scene-video"));
    await flush();
    await click(byTestId(root, "video-warning-use-still"));
    await flush();

    expect(createGeneration.mock.calls[0][0]).toMatchObject({ kind: "image" });
    expect(byTestId(root, "studio-lock").dataset.generationKind).toBe("image");
  });

  it("U-D23: dismissing starts nothing at all", async () => {
    const root = await studio();
    await click(byTestId(root, "generate-scene-video"));
    await flush();
    await click(byTestId(root, "modal-close"));
    await flush();

    expect(createGeneration).not.toHaveBeenCalled();
    expect(queryTestId(root, "video-warning-scene")).toBeNull();
  });
});
