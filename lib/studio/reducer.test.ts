import { describe, expect, it } from "vitest";

import {
  initialStudioState,
  studioReducer,
  commitOutcome,
  publishOutcome,
  // Task #35 — generation state machine + outcome mappers (RED until added).
  imageSlot,
  scriptSlot,
  STORYBOARD_SLOT,
  imageGenerationOutcome,
  scriptGenerationOutcome,
  narrationGenerationOutcome,
  musicGenerationOutcome,
  storyboardGenerationOutcome,
  type StudioState,
} from "./reducer";
import { DEMO_STORYBOARD, totalFrames, storyboardFromGenerated } from "./storyboard";
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

  // ── Task 28: the REAL publish flow — a DISTINCT set of actions (the mock
  // PUBLISH_BEGIN/PUBLISH_DONE two-step above stay untouched). Model A = ONE-step:
  // publish the current working v0.0.1, land on v0.0.2 (vs the mock two-step). The
  // real path drives the wizard from the polled ProjectJob stages, not a mock log. ─

  it("U-R25: PUBLISH_REAL_BEGIN opens the publishing step WITHOUT seeding the mock log", () => {
    const open = studioReducer(init(), { type: "OPEN_PUBLISH" });
    const publishing = studioReducer(open, { type: "PUBLISH_REAL_BEGIN" });
    expect(publishing.publishFlow).toBe("publishing");
    expect(publishing.publishing).toBe(true);
    expect(publishing.publishError).toBeNull();
    expect(publishing.publishStages).toBeNull();
    // real mode renders polled stages, NOT the mocked LogSequence
    expect(publishing.publishLog).toBeNull();
  });

  it("U-R26: PUBLISH_STAGES stores the polled stage rows the wizard renders", () => {
    const publishing = studioReducer(
      studioReducer(init(), { type: "OPEN_PUBLISH" }),
      { type: "PUBLISH_REAL_BEGIN" },
    );
    const withStages = studioReducer(publishing, {
      type: "PUBLISH_STAGES",
      rows: [
        { label: "Authenticating with GitHub", status: "completed" },
        { label: "Committing pending changes", status: "active" },
      ],
    });
    expect(withStages.publishStages).toHaveLength(2);
    expect(withStages.publishStages?.[1]).toEqual({
      label: "Committing pending changes",
      status: "active",
    });
  });

  it("U-R27: PUBLISH_REAL_DONE lands published+clean on the authoritative next branch (one-step)", () => {
    const publishing = studioReducer(
      studioReducer(init(), { type: "OPEN_PUBLISH" }),
      { type: "PUBLISH_REAL_BEGIN" },
    );
    const done = studioReducer(publishing, {
      type: "PUBLISH_REAL_DONE",
      publishedTag: "v0.0.1",
      nextBranch: "v0.0.2",
    });
    expect(done.publishFlow).toBe("published");
    expect(done.publishing).toBe(false);
    expect(done.dirty).toBe(false);
    // Model A one-step: published v0.0.1 live, now editing on v0.0.2 (NOT the mock v0.0.3)
    expect(done.lastPublishedVersion).toBe("v0.0.1");
    expect(done.versionBranch).toBe("v0.0.2");
    expect(done.publishStages).toBeNull();
    expect(done.publishError).toBeNull();
  });

  it("U-R28: PUBLISH_FAILED clears publishing + records the error but STAYS on the publishing step", () => {
    const publishing = studioReducer(
      studioReducer(init(), { type: "OPEN_PUBLISH" }),
      { type: "PUBLISH_REAL_BEGIN" },
    );
    const failed = studioReducer(publishing, {
      type: "PUBLISH_FAILED",
      error: "publish_failed",
    });
    expect(failed.publishing).toBe(false);
    expect(failed.publishError).toBe("publish_failed");
    // still on the publishing step so the wizard can surface the error + a close/retry
    expect(failed.publishFlow).toBe("publishing");
  });

  it("U-R29: OPEN_PUBLISH and CLOSE_PUBLISH both clear a stale publishError / publishStages", () => {
    const failed = studioReducer(
      studioReducer(studioReducer(init(), { type: "OPEN_PUBLISH" }), {
        type: "PUBLISH_REAL_BEGIN",
      }),
      { type: "PUBLISH_FAILED", error: "boom" },
    );
    expect(failed.publishError).toBe("boom");

    const reopened = studioReducer(failed, { type: "OPEN_PUBLISH" });
    expect(reopened.publishError).toBeNull();
    expect(reopened.publishStages).toBeNull();

    const closed = studioReducer(failed, { type: "CLOSE_PUBLISH" });
    expect(closed.publishFlow).toBe("closed");
    expect(closed.publishError).toBeNull();
    expect(closed.publishStages).toBeNull();
  });

  it("U-R30: publishOutcome maps a polled terminal publish job (succeeded → one-step DONE, else FAILED)", () => {
    expect(
      publishOutcome({ status: "succeeded", stages: [] }, "v0.0.1"),
    ).toEqual({
      type: "PUBLISH_REAL_DONE",
      publishedTag: "v0.0.1",
      nextBranch: "v0.0.2",
    });
    expect(
      publishOutcome({ status: "failed", stages: [] }, "v0.0.1"),
    ).toMatchObject({ type: "PUBLISH_FAILED" });
    expect(
      publishOutcome({ status: "canceled", stages: [] }, "v0.0.1"),
    ).toMatchObject({ type: "PUBLISH_FAILED" });
    // a null job (POST failure / poll timeout) is also a failure
    expect(publishOutcome(null, "v0.0.1")).toMatchObject({ type: "PUBLISH_FAILED" });
  });

  it("U-R31: initialStudioState seeds the real-publish fields clean (null)", () => {
    const s = init();
    expect(s.publishStages).toBeNull();
    expect(s.publishError).toBeNull();
  });
});

// ── Task #35: the AI-generation state machine (pending/failed/succeeded) ──────
describe("generation state machine", () => {
  it("U-G0: initialStudioState starts with no in-flight generations", () => {
    expect(init().generations).toEqual({});
  });

  it("U-G1: GENERATION_BEGIN marks a slot running without touching the storyboard or dirty flag", () => {
    const s = studioReducer(init(), { type: "GENERATION_BEGIN", slot: imageSlot("s2") });
    expect(s.generations[imageSlot("s2")]).toEqual({ status: "running" });
    expect(s.dirty).toBe(false);
    expect(s.storyboard).toBe(init().storyboard);
  });

  it("U-G2: GENERATION_FAILED records the error on the slot (retryable), storyboard unchanged", () => {
    let s = studioReducer(init(), { type: "GENERATION_BEGIN", slot: imageSlot("s2") });
    s = studioReducer(s, { type: "GENERATION_FAILED", slot: imageSlot("s2"), error: "boom" });
    expect(s.generations[imageSlot("s2")]).toEqual({ status: "failed", error: "boom" });
    expect(s.dirty).toBe(false);
  });

  it("U-G3: IMAGE_GENERATED sets the scene's assetKey+url, clears the slot, and dirties for commit", () => {
    let s = studioReducer(init(), { type: "GENERATION_BEGIN", slot: imageSlot("s2") });
    s = studioReducer(s, {
      type: "IMAGE_GENERATED",
      sceneId: "s2",
      assetKey: "projects/p1/assets/gen-1",
      url: "http://minio/signed",
    });
    const s2 = s.storyboard.scenes.find((x) => x.id === "s2")!;
    expect(s2.visualAssetKey).toBe("projects/p1/assets/gen-1");
    expect(s2.visualUrl).toBe("http://minio/signed");
    expect(s.generations[imageSlot("s2")]).toBeUndefined();
    expect(s.dirty).toBe(true);
  });

  it("U-G4: SET_SCENE_VISUAL_URL (hydrate-time presign) sets only the url and does NOT dirty", () => {
    const s = studioReducer(init(), {
      type: "SET_SCENE_VISUAL_URL",
      sceneId: "s2",
      url: "http://minio/existing",
    });
    expect(s.storyboard.scenes.find((x) => x.id === "s2")!.visualUrl).toBe("http://minio/existing");
    expect(s.dirty).toBe(false);
  });

  it("U-G5: SCRIPT_GENERATED replaces the scene script, clears the slot, dirties", () => {
    let s = studioReducer(init(), { type: "GENERATION_BEGIN", slot: scriptSlot("s2") });
    s = studioReducer(s, { type: "SCRIPT_GENERATED", sceneId: "s2", scriptText: "A new line" });
    expect(s.storyboard.scenes.find((x) => x.id === "s2")!.script).toBe("A new line");
    expect(s.generations[scriptSlot("s2")]).toBeUndefined();
    expect(s.dirty).toBe(true);
  });

  it("U-G6: NARRATION_GENERATED / MUSIC_GENERATED persist the whole-project asset keys and dirty", () => {
    let s = studioReducer(init(), {
      type: "NARRATION_GENERATED",
      assetKey: "projects/p1/narration/t.mp3",
      url: "http://minio/n",
    });
    expect(s.storyboard.narrationAssetKey).toBe("projects/p1/narration/t.mp3");
    expect(s.storyboard.narrationUrl).toBe("http://minio/n");
    expect(s.dirty).toBe(true);
    s = studioReducer(s, {
      type: "MUSIC_GENERATED",
      assetKey: "projects/p1/music/b.mp3",
      url: "http://minio/m",
    });
    expect(s.storyboard.musicAssetKey).toBe("projects/p1/music/b.mp3");
  });

  it("U-G7: STORYBOARD_GENERATED replaces scenes, selects the first, clears the slot, dirties", () => {
    const gen = {
      scenes: [
        { name: "a", scriptText: "one", reference: "GEN 1:1", translation: "KJV", visualPrompt: "p", suggestedDurationSeconds: 5 },
      ],
      narratorVoice: { description: "v" },
      musicStyle: "m",
    };
    let s = studioReducer(init(), { type: "GENERATION_BEGIN", slot: STORYBOARD_SLOT });
    s = studioReducer(s, { type: "STORYBOARD_GENERATED", storyboard: storyboardFromGenerated(gen, DEMO_STORYBOARD) });
    expect(s.storyboard.scenes).toHaveLength(1);
    expect(s.selectedSceneId).toBe("s1");
    expect(s.generations[STORYBOARD_SLOT]).toBeUndefined();
    expect(s.dirty).toBe(true);
  });

  it("U-G8: EDIT_VOICE_DESCRIPTION edits the narrator description and dirties", () => {
    const s = studioReducer(init(), { type: "EDIT_VOICE_DESCRIPTION", description: "softer voice" });
    expect(s.storyboard.voiceDescription).toBe("softer voice");
    expect(s.dirty).toBe(true);
  });
});

describe("generation outcome mappers (polled terminal generation → action)", () => {
  const base = DEMO_STORYBOARD;

  it("U-G9: imageGenerationOutcome maps succeeded+assetKey+url → IMAGE_GENERATED, else GENERATION_FAILED", () => {
    expect(
      imageGenerationOutcome("s2", { status: "succeeded", resultAssetKey: "k" } as never, "http://u"),
    ).toEqual({ type: "IMAGE_GENERATED", sceneId: "s2", assetKey: "k", url: "http://u" });
    expect(imageGenerationOutcome("s2", { status: "failed", error: "e" } as never, null)).toEqual({
      type: "GENERATION_FAILED",
      slot: imageSlot("s2"),
      error: "e",
    });
    // null poll (timeout / POST failure) → failed
    expect(imageGenerationOutcome("s2", null, null).type).toBe("GENERATION_FAILED");
  });

  it("U-G10: scriptGenerationOutcome parses resultJson (GeneratedScript) → SCRIPT_GENERATED", () => {
    const gen = {
      status: "succeeded",
      resultJson: { scriptText: "regenerated", reference: "JOHN 1:23", translation: "KJV" },
    };
    expect(scriptGenerationOutcome("s2", gen as never)).toEqual({
      type: "SCRIPT_GENERATED",
      sceneId: "s2",
      scriptText: "regenerated",
    });
    // malformed resultJson → failed (not a crash)
    expect(
      scriptGenerationOutcome("s2", { status: "succeeded", resultJson: { nope: 1 } } as never).type,
    ).toBe("GENERATION_FAILED");
  });

  it("U-G11: narration/music outcome map succeeded+assetKey → *_GENERATED (url optional)", () => {
    expect(
      narrationGenerationOutcome({ status: "succeeded", resultAssetKey: "n" } as never, "http://n"),
    ).toEqual({ type: "NARRATION_GENERATED", assetKey: "n", url: "http://n" });
    expect(
      musicGenerationOutcome({ status: "succeeded", resultAssetKey: "m" } as never, null),
    ).toEqual({ type: "MUSIC_GENERATED", assetKey: "m", url: null });
    expect(narrationGenerationOutcome({ status: "failed" } as never, null).type).toBe(
      "GENERATION_FAILED",
    );
  });

  it("U-G12: storyboardGenerationOutcome parses resultJson (GeneratedStoryboard) → STORYBOARD_GENERATED", () => {
    const gen = {
      status: "succeeded",
      resultJson: {
        scenes: [
          { name: "a", scriptText: "one", reference: "GEN 1:1", translation: "KJV", visualPrompt: "p", suggestedDurationSeconds: 5 },
        ],
        narratorVoice: { description: "v" },
        musicStyle: "m",
      },
    };
    const action = storyboardGenerationOutcome(gen as never, base);
    expect(action.type).toBe("STORYBOARD_GENERATED");
    if (action.type === "STORYBOARD_GENERATED") {
      expect(action.storyboard.scenes).toHaveLength(1);
      expect(action.storyboard.scenes[0].script).toBe("one");
    }
    expect(storyboardGenerationOutcome({ status: "succeeded", resultJson: {} } as never, base).type).toBe(
      "GENERATION_FAILED",
    );
  });
});
