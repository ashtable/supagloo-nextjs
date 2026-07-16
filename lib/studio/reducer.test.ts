import { describe, expect, it } from "vitest";

// Not yet implemented — RED until `lib/studio/reducer.ts` exists.
import {
  initialStudioState,
  studioReducer,
  type StudioState,
} from "./reducer";
import { DEMO_STORYBOARD } from "./storyboard";
import { visibleCaption } from "./captions";

function selected(state: StudioState) {
  const s = state.storyboard.scenes.find(
    (sc) => sc.id === state.selectedSceneId,
  );
  if (!s) throw new Error(`no selected scene ${state.selectedSceneId}`);
  return s;
}

const init = () => initialStudioState(DEMO_STORYBOARD);

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
});
