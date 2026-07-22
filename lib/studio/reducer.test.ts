import { describe, expect, it } from "vitest";

import {
  initialStudioState,
  studioReducer,
  commitOutcome,
  type StudioState,
} from "./reducer";
import { DEMO_STORYBOARD, totalFrames } from "./storyboard";
import { visibleCaption } from "./captions";
import { type StudioProject } from "./project";

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

  // ── Turn 14: the publish wizard is a TWO-STEP bump (D-PUBLISH-SEMANTICS) ─────
  // U-R16 is REWRITTEN: publishing from v0.0.1 now tags live v0.0.2 onto main AND
  // cuts a fresh working branch v0.0.3 (not the old one-step → v0.0.2). The flow
  // is mediated by the wizard state machine (OPEN_PUBLISH → review, PUBLISH_BEGIN
  // → publishing + seeded log, PUBLISH_DONE → published + the two-step bump).

  it("U-R16: the publish flow seeds a log on BEGIN and lands on v0.0.3 with live v0.0.2 on DONE (two-step)", () => {
    const open = studioReducer(init(), { type: "OPEN_PUBLISH" });
    expect(open.publishFlow).toBe("review");

    const publishing = studioReducer(open, { type: "PUBLISH_BEGIN" });
    expect(publishing.publishFlow).toBe("publishing");
    expect(publishing.publishing).toBe(true);
    expect(publishing.publishLog?.activeIndex).toBe(0);
    expect(publishing.publishLog?.rows.length ?? 0).toBeGreaterThan(0);

    const advanced = studioReducer(publishing, { type: "ADVANCE_PUBLISH_LOG" });
    expect(advanced.publishLog?.activeIndex).toBe(1);

    const done = studioReducer(publishing, { type: "PUBLISH_DONE" });
    expect(done.publishFlow).toBe("published");
    expect(done.publishing).toBe(false);
    expect(done.dirty).toBe(false);
    // working v0.0.1 → live v0.0.2 → new working v0.0.3
    expect(done.lastPublishedVersion).toBe("v0.0.2");
    expect(done.versionBranch).toBe("v0.0.3");
    expect(done.publishLog).toBeNull();
  });

  it("U-R17: OPEN_PUBLISH opens the review step and clears the version menu; CLOSE_PUBLISH closes it", () => {
    const menuOpen = studioReducer(init(), { type: "TOGGLE_VERSION_MENU" });
    expect(menuOpen.versionMenuOpen).toBe(true);

    const open = studioReducer(menuOpen, { type: "OPEN_PUBLISH" });
    expect(open.publishFlow).toBe("review");
    expect(open.versionMenuOpen).toBe(false); // opening publish closes the menu

    const closed = studioReducer(open, { type: "CLOSE_PUBLISH" });
    expect(closed.publishFlow).toBe("closed");
  });

  it("U-R18: the version menu toggles, is mutually exclusive with reroll/ship, and CLOSE_MENUS clears all three", () => {
    const open = studioReducer(init(), { type: "TOGGLE_VERSION_MENU" });
    expect(open.versionMenuOpen).toBe(true);

    // opening reroll closes the version menu (mutual exclusion)
    const reroll = studioReducer(open, { type: "TOGGLE_REROLL_MENU" });
    expect(reroll.rerollMenuOpen).toBe(true);
    expect(reroll.versionMenuOpen).toBe(false);

    // opening the version menu closes reroll/ship
    const back = studioReducer(reroll, { type: "TOGGLE_VERSION_MENU" });
    expect(back.versionMenuOpen).toBe(true);
    expect(back.rerollMenuOpen).toBe(false);

    const closed = studioReducer(back, { type: "CLOSE_MENUS" });
    expect(closed.versionMenuOpen).toBe(false);
    expect(closed.rerollMenuOpen).toBe(false);
    expect(closed.shipMenuOpen).toBe(false);

    // one-click toggle: re-toggling closes it
    expect(
      studioReducer(open, { type: "TOGGLE_VERSION_MENU" }).versionMenuOpen,
    ).toBe(false);
  });

  it("U-R19: OPEN_RENDER seeds the render (900 frames); ADVANCE climbs; BACKGROUND hides+preserves; CANCEL clears", () => {
    const opened = studioReducer(init(), { type: "OPEN_RENDER" });
    expect(opened.render).toBeTruthy();
    expect(opened.render?.totalFrames).toBe(totalFrames(DEMO_STORYBOARD, 30));
    expect(opened.render?.totalFrames).toBe(900);
    expect(opened.render?.framesDone).toBe(0);
    expect(opened.render?.backgrounded).toBe(false);

    const advanced = studioReducer(opened, { type: "ADVANCE_RENDER" });
    expect(advanced.render?.framesDone ?? 0).toBeGreaterThan(0);

    const backgrounded = studioReducer(advanced, { type: "RENDER_BACKGROUND" });
    expect(backgrounded.render).toBeTruthy(); // preserved, still ticking in state
    expect(backgrounded.render?.backgrounded).toBe(true);

    const cancelled = studioReducer(backgrounded, { type: "CANCEL_RENDER" });
    expect(cancelled.render).toBeNull();
  });

  it("U-R20: initialStudioState seeds all three overlays empty / closed", () => {
    const s = init();
    expect(s.publishFlow).toBe("closed");
    expect(s.versionMenuOpen).toBe(false);
    expect(s.render).toBeNull();
    expect(s.lastPublishedVersion).toBeNull();
    expect(s.publishLog).toBeNull();
  });

  // ── Task 27: the REAL commit can FAIL (network / a failed ProjectJob), so the
  // reducer needs a terminal failure state the mocked setTimeout never had. ──────

  it("U-R21: initialStudioState seeds a clean commitError (null)", () => {
    expect(init().commitError).toBeNull();
  });

  it("U-R22: COMMIT_FAILED clears `committing`, records the error, and KEEPS the edit dirty", () => {
    const dirty = studioReducer(init(), { type: "EDIT_SCRIPT", script: "x" });
    const committing = studioReducer(dirty, { type: "COMMIT_BEGIN" });
    expect(committing.committing).toBe(true);

    const failed = studioReducer(committing, {
      type: "COMMIT_FAILED",
      error: "commit_failed",
    });
    expect(failed.committing).toBe(false);
    expect(failed.commitError).toBe("commit_failed");
    // the edit is NOT saved, so the project stays dirty and Commit is retryable
    expect(failed.dirty).toBe(true);
  });

  it("U-R23: a fresh COMMIT_BEGIN clears a prior commitError; COMMIT_DONE also clears it", () => {
    const failed = studioReducer(
      studioReducer(init(), { type: "EDIT_SCRIPT", script: "x" }),
      { type: "COMMIT_FAILED", error: "boom" },
    );
    expect(failed.commitError).toBe("boom");

    expect(studioReducer(failed, { type: "COMMIT_BEGIN" }).commitError).toBeNull();
    expect(studioReducer(failed, { type: "COMMIT_DONE" }).commitError).toBeNull();
  });

  it("U-R24: commitOutcome maps a polled terminal job to the right action (replaces the setTimeout)", () => {
    expect(commitOutcome({ status: "succeeded", stages: [] })).toEqual({
      type: "COMMIT_DONE",
    });
    expect(commitOutcome({ status: "failed", stages: [] })).toMatchObject({
      type: "COMMIT_FAILED",
    });
    expect(commitOutcome({ status: "canceled", stages: [] })).toMatchObject({
      type: "COMMIT_FAILED",
    });
    // a null job (poll timeout / POST failure) is also a failure
    expect(commitOutcome(null)).toMatchObject({ type: "COMMIT_FAILED" });
  });
});
