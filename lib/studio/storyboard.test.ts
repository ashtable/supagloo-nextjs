import { describe, expect, it } from "vitest";

// Not yet implemented — RED until `lib/studio/storyboard.ts` exists.
import {
  DEMO_STORYBOARD,
  totalDurationSeconds,
  totalFrames,
  sceneEntryFrame,
  sceneRange,
  sceneAtFrame,
  timelineWeights,
  sceneBoundaryFractions,
  updateSceneScript,
  setSceneOnScreenText,
  updateSceneVisualPrompt,
  // §7 scene-tree — RED until Step 9 adds `sceneTreeLabel` to `storyboard.ts`.
  // The module already exists, so this resolves to `undefined` and only the
  // U-ST-TREE test below fails ("sceneTreeLabel is not a function"); every other
  // storyboard test stays GREEN (same missing-export pattern as project.test.ts).
  sceneTreeLabel,
} from "./storyboard";
import { secondsToFrames } from "./time";

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

describe("totalFrames ([4] single source of truth)", () => {
  it("U-S10: sums per-scene ROUNDED frame counts (demo = 900 @ 30fps)", () => {
    const sum = DEMO_STORYBOARD.scenes.reduce(
      (n, s) => n + secondsToFrames(s.durationSeconds, 30),
      0,
    );
    expect(totalFrames(DEMO_STORYBOARD, 30)).toBe(900);
    expect(totalFrames(DEMO_STORYBOARD, 30)).toBe(sum);
  });

  it("U-S11: is sum(round), NOT round(sum) — they diverge for fractional scenes", () => {
    // two 0.5s scenes @1fps: sum(round(0.5·1)) = 1+1 = 2, but round(sum(1.0)·1) = 1.
    const sb = {
      ...DEMO_STORYBOARD,
      scenes: [
        { ...DEMO_STORYBOARD.scenes[0], durationSeconds: 0.5 },
        { ...DEMO_STORYBOARD.scenes[1], durationSeconds: 0.5 },
      ],
    };
    expect(totalFrames(sb, 1)).toBe(2);
    // the OLD divergent value the Player used to compute (regression guard):
    expect(secondsToFrames(totalDurationSeconds(sb), 1)).toBe(1);
  });
});

describe("sceneEntryFrame ([0]/[3] settled, id-safe seek target)", () => {
  it("U-S12: seeks past the caption fade-in — start + 20, on the LONG demo scenes", () => {
    expect(sceneEntryFrame(DEMO_STORYBOARD, "s1", 30)).toBe(0 + 20);
    expect(sceneEntryFrame(DEMO_STORYBOARD, "s2", 30)).toBe(150 + 20);
    expect(sceneEntryFrame(DEMO_STORYBOARD, "s4", 30)).toBe(660 + 20);
  });

  it("U-S13: clamps the settle offset to stay inside a short scene", () => {
    // a 0.2s scene @30fps = 6 frames; offset = min(20, 6-1) = 5, so start + 5.
    const sb = {
      ...DEMO_STORYBOARD,
      scenes: [{ ...DEMO_STORYBOARD.scenes[0], id: "only", durationSeconds: 0.2 }],
    };
    expect(sceneEntryFrame(sb, "only", 30)).toBe(0 + 5);
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

// §7 SCOPE AMENDMENT (2026-07-17) — the ONLY genuinely-new pure logic the
// scene-tree needs (§7.7). Everything else in §7 (aspectDimensions, selectScene,
// SET_ON_SCREEN_TEXT, durationSeconds) is a view over already-tested models, so
// per house style it is asserted via the studio.e2e.ts scene-tree cluster, not
// unit-tested here. RED until Step 9 adds `sceneTreeLabel`.
describe("sceneTreeLabel (§7 scene-tree row label)", () => {
  it("U-ST-TREE: is 'Scene NN · <visualLabel>' — zero-padded index, middot join, derived from the real storyboard", () => {
    // The REAL John 1:23 scenes, NOT the wireframe's Psalm mock. The index is
    // 1-based and zero-padded; the middot is U+00B7; the scene's own visualLabel
    // (which itself carries a middot for s1) is appended verbatim.
    expect(sceneTreeLabel(DEMO_STORYBOARD.scenes[0])).toBe(
      "Scene 01 · wilderness · dawn",
    );
    expect(sceneTreeLabel(DEMO_STORYBOARD.scenes[3])).toBe(
      "Scene 04 · verse card",
    );
  });
});
