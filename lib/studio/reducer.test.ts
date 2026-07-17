import { describe, expect, it } from "vitest";

import {
  initialStudioState,
  studioReducer,
  type StudioState,
} from "./reducer";
import { DEMO_STORYBOARD } from "./storyboard";
import { visibleCaption } from "./captions";
// RED until `lib/studio/project.ts` exists (Step 9). `initialStudioState` now
// seeds from a StudioProject (not a bare Storyboard), and the reducer bumps the
// version branch on publish via `nextVersion` — so the whole suite depends on
// this module. The value import forces a clean "Cannot find module './project'"
// RED, exactly the intended TDD signal.
import { nextVersion, type StudioProject } from "./project";

/** The `/studio/psalm-121` project — a StudioProject wrapping the one demo
 *  storyboard the repo ships, seeded at the wizard's first working branch. */
const DEMO_PROJECT: StudioProject = {
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
};

function selected(state: StudioState) {
  const s = state.storyboard.scenes.find(
    (sc) => sc.id === state.selectedSceneId,
  );
  if (!s) throw new Error(`no selected scene ${state.selectedSceneId}`);
  return s;
}

const init = () => initialStudioState(DEMO_PROJECT);

describe("initialStudioState", () => {
  it("U-R1: opens on scene 2, 9:16, paused, menus closed, mock posting defaults", () => {
    const s = init();
    expect(s.selectedSceneId).toBe("s2");
    expect(s.aspect).toBe("9:16");
    expect(s.isPlaying).toBe(false);
    expect(s.rerollMenuOpen).toBe(false);
    expect(s.shipMenuOpen).toBe(false);
    expect(s.posting).toEqual({
      tiktok: true,
      ytShorts: true,
      recurring: true,
      approveEachCut: true,
      postAutomatically: false,
    });
  });

  it("U-R11: defaults to the 2nd scene by INDEX (not a hardcoded 's2'), never crashing on odd storyboards ([3])", () => {
    // No scene is called "s2" here — the old literal would have mis-selected /
    // let sceneRange throw downstream. The safe pick is the 2nd scene by index.
    const twoScene = {
      ...DEMO_STORYBOARD,
      scenes: [
        { ...DEMO_STORYBOARD.scenes[0], id: "intro" },
        { ...DEMO_STORYBOARD.scenes[1], id: "hook" },
      ],
    };
    expect(
      initialStudioState({ ...DEMO_PROJECT, storyboard: twoScene })
        .selectedSceneId,
    ).toBe("hook");

    // A single-scene storyboard falls back to the 1st scene (no scenes[1]).
    const oneScene = {
      ...DEMO_STORYBOARD,
      scenes: [{ ...DEMO_STORYBOARD.scenes[0], id: "solo" }],
    };
    expect(
      initialStudioState({ ...DEMO_PROJECT, storyboard: oneScene })
        .selectedSceneId,
    ).toBe("solo");
  });

  it("U-R12: seeds the version branch from the project and loads CLEAN (D-CLEAN-STATE)", () => {
    const s = init();
    expect(s.versionBranch).toBe("v0.0.1");
    expect(s.dirty).toBe(false);
    expect(s.committing).toBe(false);
    expect(s.publishing).toBe(false);
  });
});

describe("studioReducer", () => {
  it("U-R2: SELECT_SCENE changes the selected scene", () => {
    const s = studioReducer(init(), { type: "SELECT_SCENE", id: "s3" });
    expect(s.selectedSceneId).toBe("s3");
  });

  it("U-R3: SET_ASPECT changes the aspect", () => {
    const s = studioReducer(init(), { type: "SET_ASPECT", aspect: "16:9" });
    expect(s.aspect).toBe("16:9");
  });

  it("U-R4: EDIT_SCRIPT edits only the selected scene's script", () => {
    const s = studioReducer(init(), { type: "EDIT_SCRIPT", script: "X" });
    expect(selected(s).script).toBe("X");
    expect(s.storyboard.scenes.find((sc) => sc.id === "s1")!.script).toBe(
      "I am the voice of one",
    );
  });

  it("U-R10: EDIT_VISUAL_PROMPT edits only the selected scene's visual prompt", () => {
    const s = studioReducer(init(), {
      type: "EDIT_VISUAL_PROMPT",
      prompt: "new prompt",
    });
    expect(selected(s).visualPrompt).toBe("new prompt");
  });

  it("U-R5: SET_ON_SCREEN_TEXT voice-only hides the selected caption", () => {
    const s = studioReducer(init(), {
      type: "SET_ON_SCREEN_TEXT",
      value: "voice-only",
    });
    expect(selected(s).onScreenText).toBe("voice-only");
    expect(visibleCaption(selected(s))).toBeNull();
  });

  it("U-R6: SET_MUSIC_MOOD updates the whole-video music mood", () => {
    const s = studioReducer(init(), {
      type: "SET_MUSIC_MOOD",
      mood: "Ambient pads",
    });
    expect(s.storyboard.musicMood).toBe("Ambient pads");
  });

  it("U-R7: TOGGLE_POSTING flips a posting option on then off", () => {
    const once = studioReducer(init(), {
      type: "TOGGLE_POSTING",
      key: "postAutomatically",
    });
    expect(once.posting.postAutomatically).toBe(true);
    const twice = studioReducer(once, {
      type: "TOGGLE_POSTING",
      key: "postAutomatically",
    });
    expect(twice.posting.postAutomatically).toBe(false);
  });

  it("U-R8: the two companion popovers are mutually exclusive", () => {
    const reroll = studioReducer(init(), { type: "TOGGLE_REROLL_MENU" });
    expect(reroll.rerollMenuOpen).toBe(true);
    expect(reroll.shipMenuOpen).toBe(false);

    const ship = studioReducer(reroll, { type: "TOGGLE_SHIP_MENU" });
    expect(ship.shipMenuOpen).toBe(true);
    expect(ship.rerollMenuOpen).toBe(false); // opening ship closes reroll

    const closed = studioReducer(ship, { type: "CLOSE_MENUS" });
    expect(closed.rerollMenuOpen).toBe(false);
    expect(closed.shipMenuOpen).toBe(false);
  });

  it("U-R9: PLAY / PAUSE toggle the transport state", () => {
    const playing = studioReducer(init(), { type: "PLAY" });
    expect(playing.isPlaying).toBe(true);
    const paused = studioReducer(playing, { type: "PAUSE" });
    expect(paused.isPlaying).toBe(false);
  });

  // ── Turn 13b: dirty / commit / publish (D-CLEAN-STATE, D-COMMIT-PUBLISH) ────

  it("U-R13: content edits flip the project DIRTY", () => {
    expect(
      studioReducer(init(), { type: "EDIT_SCRIPT", script: "x" }).dirty,
    ).toBe(true);
    expect(
      studioReducer(init(), { type: "EDIT_VISUAL_PROMPT", prompt: "x" }).dirty,
    ).toBe(true);
    expect(
      studioReducer(init(), { type: "SET_ON_SCREEN_TEXT", value: "voice-only" })
        .dirty,
    ).toBe(true);
    expect(
      studioReducer(init(), { type: "SET_MUSIC_MOOD", mood: "Ambient pads" })
        .dirty,
    ).toBe(true);
  });

  it("U-R14: view-preference actions do NOT dirty the project", () => {
    expect(
      studioReducer(init(), { type: "SET_ASPECT", aspect: "16:9" }).dirty,
    ).toBe(false);
    expect(
      studioReducer(init(), { type: "SELECT_SCENE", id: "s3" }).dirty,
    ).toBe(false);
    expect(studioReducer(init(), { type: "PLAY" }).dirty).toBe(false);
    expect(
      studioReducer(init(), { type: "TOGGLE_REROLL_MENU" }).dirty,
    ).toBe(false);
  });

  it("U-R15: COMMIT_BEGIN pends, COMMIT_DONE returns to clean", () => {
    const dirty = studioReducer(init(), { type: "EDIT_SCRIPT", script: "x" });
    expect(dirty.dirty).toBe(true);

    const committing = studioReducer(dirty, { type: "COMMIT_BEGIN" });
    expect(committing.committing).toBe(true);
    expect(committing.dirty).toBe(true); // still dirty while the commit is in flight

    const done = studioReducer(committing, { type: "COMMIT_DONE" });
    expect(done.committing).toBe(false);
    expect(done.dirty).toBe(false);
  });

  it("U-R16: PUBLISH_DONE bumps the version branch via nextVersion and cleans", () => {
    const publishing = studioReducer(init(), { type: "PUBLISH_BEGIN" });
    expect(publishing.publishing).toBe(true);

    const done = studioReducer(publishing, { type: "PUBLISH_DONE" });
    expect(done.publishing).toBe(false);
    expect(done.dirty).toBe(false);
    expect(done.versionBranch).toBe(nextVersion("v0.0.1"));
    expect(done.versionBranch).toBe("v0.0.2");
  });
});
