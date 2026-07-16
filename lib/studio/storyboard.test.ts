import { describe, expect, it } from "vitest";

// Not yet implemented — RED until `lib/studio/storyboard.ts` exists.
import {
  DEMO_STORYBOARD,
  totalDurationSeconds,
  sceneRange,
  sceneAtFrame,
  timelineWeights,
  sceneBoundaryFractions,
  updateSceneScript,
  setSceneOnScreenText,
  updateSceneVisualPrompt,
} from "./storyboard";

// Glyph-exact copy, byte-for-byte from the 5a wireframe (lines 804–1040).
// middot `·` U+00B7, em dash `—` U+2014. Hardcoded here (not imported from the
// SUT) so these are concrete expectations, not tautologies.
const VISUAL_PROMPT_S2 =
  "lone bearded figure walking a desert path, blowing dust, low golden sun, cinematic 35mm, shallow depth of field";
const VOICE_DESC =
  "warm, weathered, resonant baritone — unhurried, reverent, like James Earl Jones narrating scripture";

function scene(id: string) {
  const s = DEMO_STORYBOARD.scenes.find((sc) => sc.id === id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
}

describe("DEMO_STORYBOARD", () => {
  it("U-S1: is the 4-scene, 0:30, 30fps John 1:23 demo with the right whole-video metadata", () => {
    expect(DEMO_STORYBOARD.scenes).toHaveLength(4);
    expect(DEMO_STORYBOARD.scenes.map((s) => s.durationSeconds)).toEqual([
      5, 9, 8, 8,
    ]);
    expect(totalDurationSeconds(DEMO_STORYBOARD)).toBe(30);
    expect(DEMO_STORYBOARD.fps).toBe(30);
    expect(DEMO_STORYBOARD.title).toBe("VERSE OF THE DAY");
    expect(DEMO_STORYBOARD.dateLabel).toBe("· Jul 4");
    expect(DEMO_STORYBOARD.reference).toBe("JOHN 1:23 · KJV");
    expect(DEMO_STORYBOARD.musicMood).toBe("Swelling strings");
    expect(DEMO_STORYBOARD.voiceLabel).toBe("JAMES EARL JONES-STYLE");
    expect(DEMO_STORYBOARD.voiceDescription).toBe(VOICE_DESC);
  });

  it("U-S8: carries the glyph-exact per-scene copy (labels, scripts, prompt, voice-only)", () => {
    expect(scene("s1").index).toBe(1);
    expect(scene("s1").visualLabel).toBe("wilderness · dawn");
    expect(scene("s1").script).toBe("I am the voice of one");
    expect(scene("s1").onScreenText).toBe("text");

    expect(scene("s2").visualLabel).toBe("lone figure · desert path");
    expect(scene("s2").script).toBe("of one crying in the wilderness,");
    expect(scene("s2").visualPrompt).toBe(VISUAL_PROMPT_S2);
    expect(scene("s2").onScreenText).toBe("text");

    expect(scene("s3").visualLabel).toBe("sunrise · road");
    expect(scene("s3").script).toBe("Make straight the way of the Lord.");
    expect(scene("s3").onScreenText).toBe("voice-only");

    expect(scene("s4").visualLabel).toBe("verse card");
    expect(scene("s4").script).toBe("John 1:23 · KJV");
    expect(scene("s4").onScreenText).toBe("text");
  });
});

describe("sceneRange", () => {
  it("U-S2: returns cumulative {start,end} seconds per scene", () => {
    expect(sceneRange(DEMO_STORYBOARD, "s1")).toEqual({ start: 0, end: 5 });
    expect(sceneRange(DEMO_STORYBOARD, "s2")).toEqual({ start: 5, end: 14 });
    expect(sceneRange(DEMO_STORYBOARD, "s3")).toEqual({ start: 14, end: 22 });
    expect(sceneRange(DEMO_STORYBOARD, "s4")).toEqual({ start: 22, end: 30 });
  });
});

describe("sceneAtFrame", () => {
  it("U-S3: maps a frame to its containing scene (boundary = next scene's start)", () => {
    // scene frame ranges at 30fps: s1 [0,150) s2 [150,420) s3 [420,660) s4 [660,900)
    expect(sceneAtFrame(DEMO_STORYBOARD, 0, 30).id).toBe("s1");
    expect(sceneAtFrame(DEMO_STORYBOARD, 149, 30).id).toBe("s1");
    expect(sceneAtFrame(DEMO_STORYBOARD, 150, 30).id).toBe("s2");
    expect(sceneAtFrame(DEMO_STORYBOARD, 419, 30).id).toBe("s2");
    expect(sceneAtFrame(DEMO_STORYBOARD, 420, 30).id).toBe("s3");
    expect(sceneAtFrame(DEMO_STORYBOARD, 899, 30).id).toBe("s4");
  });
});

describe("timelineWeights", () => {
  it("U-S4: returns per-scene flex weights equal to durations", () => {
    expect(timelineWeights(DEMO_STORYBOARD)).toEqual([5, 9, 8, 8]);
  });
});

describe("sceneBoundaryFractions", () => {
  it("U-S5: returns interior scene-boundary positions as fractions of total", () => {
    const f = sceneBoundaryFractions(DEMO_STORYBOARD);
    expect(f).toHaveLength(3);
    expect(f[0]).toBeCloseTo(5 / 30, 9);
    expect(f[1]).toBeCloseTo(14 / 30, 9);
    expect(f[2]).toBeCloseTo(22 / 30, 9);
  });
});

describe("immutable edit transforms", () => {
  it("U-S6: updateSceneScript changes only the target scene, leaving the input untouched", () => {
    const next = updateSceneScript(DEMO_STORYBOARD, "s2", "X");
    expect(next.scenes.find((s) => s.id === "s2")!.script).toBe("X");
    expect(next.scenes.find((s) => s.id === "s1")!.script).toBe(
      "I am the voice of one",
    );
    // original not mutated
    expect(DEMO_STORYBOARD.scenes.find((s) => s.id === "s2")!.script).toBe(
      "of one crying in the wilderness,",
    );
    expect(next).not.toBe(DEMO_STORYBOARD);
  });

  it("U-S7: setSceneOnScreenText flips only the target scene, immutably", () => {
    const next = setSceneOnScreenText(DEMO_STORYBOARD, "s1", "voice-only");
    expect(next.scenes.find((s) => s.id === "s1")!.onScreenText).toBe(
      "voice-only",
    );
    expect(next.scenes.find((s) => s.id === "s2")!.onScreenText).toBe("text");
    expect(DEMO_STORYBOARD.scenes.find((s) => s.id === "s1")!.onScreenText).toBe(
      "text",
    );
  });

  it("U-S9: updateSceneVisualPrompt changes only the target scene's prompt, immutably", () => {
    const next = updateSceneVisualPrompt(DEMO_STORYBOARD, "s2", "new prompt");
    expect(next.scenes.find((s) => s.id === "s2")!.visualPrompt).toBe(
      "new prompt",
    );
    expect(DEMO_STORYBOARD.scenes.find((s) => s.id === "s2")!.visualPrompt).toBe(
      VISUAL_PROMPT_S2,
    );
  });
});
