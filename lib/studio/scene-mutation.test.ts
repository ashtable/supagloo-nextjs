/**
 * Scene ADD / DELETE — the pure transforms behind USER DECISION D3.
 *
 * D3 delivers "spread one verse across several screens" through real scene mutation,
 * NOT a delimiter convention: add a scene, edit each scene's Script textarea, and the
 * captions follow automatically because `visibleCaption(scene) === scene.script`.
 *
 * The bounds (5..10 scenes ≈ 30-60 s) are enforced HERE, in the model — D3 is explicit
 * that disabling the buttons is not enough. A test that only drove the buttons would
 * pass against a model that happily produced an 11-scene storyboard.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_SCENES,
  MIN_SCENES,
  addSceneAfter,
  canAddScene,
  canDeleteScene,
  deleteScene,
  nextSceneId,
  setSceneScripture,
  type Scene,
  type Storyboard,
} from "./storyboard";

function scene(n: number, over: Partial<Scene> = {}): Scene {
  return {
    id: `s${n}`,
    index: n,
    durationSeconds: 5,
    visualLabel: `label ${n}`,
    visualPrompt: `prompt ${n}`,
    script: `script ${n}`,
    onScreenText: "text",
    ...over,
  };
}

function board(count: number, over: Partial<Scene>[] = []): Storyboard {
  return {
    title: "T",
    dateLabel: "",
    reference: "GENESIS 1:1",
    fps: 30,
    voiceDescription: "voice",
    voiceLabel: "V",
    musicMood: "strings",
    scenes: Array.from({ length: count }, (_, i) => scene(i + 1, over[i] ?? {})),
  };
}

describe("bounds", () => {
  it("U-S19b: the bounds are exactly D3's 5 and 10", () => {
    expect(MIN_SCENES).toBe(5);
    expect(MAX_SCENES).toBe(10);
  });

  it("U-S21: addSceneAfter is a NO-OP at MAX_SCENES — the model refuses, not just the button", () => {
    const full = board(MAX_SCENES);
    expect(canAddScene(full)).toBe(false);
    const after = addSceneAfter(full, "s1");
    expect(after).toBe(full); // identity: nothing changed, no new object to dirty on
    expect(after.scenes).toHaveLength(MAX_SCENES);
  });

  it("U-S23: deleteScene is a NO-OP at MIN_SCENES — the model refuses, not just the button", () => {
    const floor = board(MIN_SCENES);
    expect(canDeleteScene(floor)).toBe(false);
    const after = deleteScene(floor, "s3");
    expect(after).toBe(floor);
    expect(after.scenes).toHaveLength(MIN_SCENES);
  });

  it("U-S23b: a storyboard already BELOW the floor still cannot be shrunk (the 4-scene demo storyboard)", () => {
    const short = board(4);
    expect(canDeleteScene(short)).toBe(false);
    expect(deleteScene(short, "s1")).toBe(short);
  });

  it("U-S21b: canAddScene / canDeleteScene are true strictly inside the band", () => {
    const mid = board(7);
    expect(canAddScene(mid)).toBe(true);
    expect(canDeleteScene(mid)).toBe(true);
  });
});

describe("addSceneAfter", () => {
  const five = board(MIN_SCENES);

  it("U-S20: inserts immediately AFTER the named scene and renumbers every index", () => {
    const next = addSceneAfter(five, "s2");
    expect(next.scenes).toHaveLength(6);
    expect(next.scenes.map((s) => s.id).slice(0, 3)).toEqual(["s1", "s2", "s6"]);
    expect(next.scenes.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("U-S20b: appends when the anchor is unknown or null, so the caller can never lose a scene", () => {
    expect(addSceneAfter(five, null).scenes.at(-1)?.id).toBe("s6");
    expect(addSceneAfter(five, "nope").scenes.at(-1)?.id).toBe("s6");
  });

  it("U-S24: the new scene carries the SOURCE scene's reference/translation", () => {
    // Without this, `serializeManifest`'s unknown-id fallback (manifest-adapter.ts:112-115)
    // silently gives every added scene scene 0's scripture — the exact reattachment class
    // of bug plan row 57 already fixed once.
    const withScripture = board(MIN_SCENES, [
      { reference: "Genesis 1:1", translation: "ASV" },
      { reference: "Genesis 1:2", translation: "ASV" },
      { reference: "Genesis 1:3", translation: "ASV" },
    ]);
    const next = addSceneAfter(withScripture, "s2");
    const added = next.scenes[2];
    expect(added.reference).toBe("Genesis 1:2");
    expect(added.translation).toBe("ASV");
    expect(added.reference).not.toBe(withScripture.scenes[0].reference);
  });

  it("U-S24b: the new scene COPIES the source line (an empty one would make the manifest uncommittable) and inherits no generated assets", () => {
    // Both manifest mirrors declare `scriptText: z.string().min(1)` (db-lib
    // schemas.ts:198, lib/api/contracts.ts:432). A blank new scene would make the whole
    // manifest invalid and `POST /commit` would answer 422 `manifest_invalid` — i.e.
    // "add a scene" would put the project into a state it cannot save. Copying the
    // source line is also the natural start of a split: duplicate, then trim each half.
    const withAssets = board(MIN_SCENES, [
      {},
      {
        visualAssetKey: "k",
        visualUrl: "u",
        narrationAssetKey: "n",
        narrationDurationSeconds: 9,
      },
    ]);
    const added = addSceneAfter(withAssets, "s2").scenes[2];
    expect(added.script).toBe("script 2");
    expect(added.script.length).toBeGreaterThan(0);
    expect(added.visualAssetKey ?? null).toBeNull();
    expect(added.visualUrl ?? null).toBeNull();
    expect(added.narrationAssetKey ?? null).toBeNull();
    expect(added.narrationDurationSeconds).toBeUndefined();
    // captions on by default — the caption IS the script, so a new screen is visible
    expect(added.onScreenText).toBe("text");
    // it inherits the visual direction so the new screen isn't a stylistic orphan
    expect(added.visualPrompt).toBe("prompt 2");
    expect(added.durationSeconds).toBe(5);
  });

  it("U-S25: nextSceneId never collides, and is DETERMINISTIC (no clock, no random)", () => {
    const gappy: Storyboard = {
      ...five,
      scenes: [scene(1), { ...scene(2), id: "s7" }, { ...scene(3), id: "weird" }],
    };
    expect(nextSceneId(gappy)).toBe("s8");
    expect(nextSceneId(gappy)).toBe("s8");

    const noNumbers: Storyboard = { ...five, scenes: [{ ...scene(1), id: "alpha" }] };
    expect(nextSceneId(noNumbers)).toBe("s1");

    // adding twice in a row must not produce the same id
    const once = addSceneAfter(five, "s5");
    const twice = addSceneAfter(once, "s5");
    const ids = twice.scenes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("U-S20c: the input storyboard is never mutated", () => {
    const before = JSON.parse(JSON.stringify(five));
    addSceneAfter(five, "s3");
    expect(JSON.parse(JSON.stringify(five))).toEqual(before);
  });
});

describe("deleteScene", () => {
  const six = board(6);

  it("U-S22: removes the scene and renumbers the survivors", () => {
    const next = deleteScene(six, "s3");
    expect(next.scenes.map((s) => s.id)).toEqual(["s1", "s2", "s4", "s5", "s6"]);
    expect(next.scenes.map((s) => s.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it("U-S22b: an unknown id changes nothing", () => {
    expect(deleteScene(six, "nope")).toBe(six);
  });

  it("U-S22c: survivors keep their own content untouched", () => {
    const next = deleteScene(six, "s1");
    expect(next.scenes[0].script).toBe("script 2");
    expect(next.scenes[0].visualPrompt).toBe("prompt 2");
  });
});

describe("setSceneScripture", () => {
  it("U-S26: writes script, reference and translation together, on the named scene only", () => {
    const five = board(MIN_SCENES);
    const next = setSceneScripture(five, "s2", {
      script: "In the beginning God created the heavens and the earth.",
      reference: "Genesis 1:1",
      translation: "ASV",
    });
    expect(next.scenes[1]).toMatchObject({
      script: "In the beginning God created the heavens and the earth.",
      reference: "Genesis 1:1",
      translation: "ASV",
    });
    expect(next.scenes[0].script).toBe("script 1");
    expect(next.scenes[0].reference).toBeUndefined();
  });

  it("U-S26b: an unknown scene id is a no-op", () => {
    const five = board(MIN_SCENES);
    expect(
      setSceneScripture(five, "nope", { script: "x", reference: "y", translation: "z" }),
    ).toEqual(five);
  });
});
