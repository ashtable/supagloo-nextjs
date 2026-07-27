import { describe, expect, it } from "vitest";

/**
 * Turn 16a slice C5 — the DETERMINISTIC SCENE POSTERS (plan §4 slice C5, U-SP1/U-SP2).
 * RED until `./scene-poster` ships.
 *
 * The design's HOW IT WAS MADE grid (Step 4 §1.4d) draws a 70px poster strip per scene
 * tile. There is NO per-scene image anywhere in the product — the manifest carries a
 * `visualPrompt`, not a rendered still, and `GalleryItem.makingOf` deliberately carries
 * no asset key — so these strips are DERIVED, not fetched. That is a feature: a public
 * page that presigned N per-scene objects would be N extra round trips and N more ways
 * for the page to half-render.
 *
 * The design draws exactly four gradients for a four-scene item and says nothing about
 * any other count (Step 4 §8 A9 records it as unanswered). This module answers it with
 * a STATED RULE — a fixed four-stop ramp, dark → bright, with scene 1 pinned to the
 * darkest stop and the last scene pinned to the brightest — rather than a modulo that
 * would wrap a seven-scene item back to the dark stop halfway through and read as an
 * accident.
 */
import { SCENE_POSTER_RAMP, scenePosterGradient } from "./scene-poster";

/** The four gradients Step 4 §1.4d draws, VERBATIM, in tile order. */
const DESIGNED_FOUR = [
  "radial-gradient(circle at 50% 60%,#2a1a2e,#0a0610)",
  "radial-gradient(circle at 50% 55%,#1e3350,#080e18)",
  "radial-gradient(circle at 50% 50%,#8a3a1e,#2a1008)",
  "radial-gradient(circle at 50% 45%,#ffffff,#ffe8a8 25%,#f0a43a 60%,#8a3a1e)",
] as const;

// ── U-SP1 ────────────────────────────────────────────────────────────────────

describe("U-SP1 the four-scene case is the design, byte for byte", () => {
  it("yields EXACTLY the four gradients the design draws, in order", () => {
    expect([1, 2, 3, 4].map((i) => scenePosterGradient(i, 4))).toEqual([
      ...DESIGNED_FOUR,
    ]);
  });

  it("the ramp itself IS those four strings — a restyle cannot happen quietly", () => {
    // Pinning the ramp as well as the mapping is what makes this a design assertion
    // rather than an arithmetic one: changing a hex here fails the test that cites
    // the design, not an incidental one.
    expect([...SCENE_POSTER_RAMP]).toEqual([...DESIGNED_FOUR]);
  });
});

// ── U-SP2 ────────────────────────────────────────────────────────────────────

describe("U-SP2 every other scene count follows the stated ramp rule", () => {
  it("for 1, 2, 7 and 12 scenes every index yields a gradient FROM the ramp", () => {
    for (const total of [1, 2, 7, 12]) {
      for (let index = 1; index <= total; index += 1) {
        expect(SCENE_POSTER_RAMP).toContain(scenePosterGradient(index, total));
      }
    }
  });

  it("scene 1 is ALWAYS the darkest stop and the last scene ALWAYS the brightest", () => {
    for (const total of [2, 7, 12, 64]) {
      expect(scenePosterGradient(1, total)).toBe(SCENE_POSTER_RAMP[0]);
      expect(scenePosterGradient(total, total)).toBe(
        SCENE_POSTER_RAMP[SCENE_POSTER_RAMP.length - 1],
      );
    }
  });

  it("a LONE scene gets the ramp's first stop — it is a start, not an arc", () => {
    // The degenerate case, called out rather than glossed: with one tile there is no
    // dark→bright progression to render, and "scene 1 is the darkest" is the rule that
    // then holds without exception.
    expect(scenePosterGradient(1, 1)).toBe(SCENE_POSTER_RAMP[0]);
  });

  it("never goes backwards — the ramp only ever brightens across a scene list", () => {
    for (const total of [2, 3, 5, 7, 12, 33, 64]) {
      let previous = -1;
      for (let index = 1; index <= total; index += 1) {
        const stop = SCENE_POSTER_RAMP.indexOf(scenePosterGradient(index, total));
        expect(stop).toBeGreaterThanOrEqual(previous);
        previous = stop;
      }
    }
  });

  it("clamps an out-of-range index instead of returning undefined", () => {
    // A pure function a component maps over must not be able to hand CSS the string
    // "undefined"; that renders as no background at all, silently.
    expect(scenePosterGradient(0, 4)).toBe(SCENE_POSTER_RAMP[0]);
    expect(scenePosterGradient(-2, 4)).toBe(SCENE_POSTER_RAMP[0]);
    expect(scenePosterGradient(99, 4)).toBe(
      SCENE_POSTER_RAMP[SCENE_POSTER_RAMP.length - 1],
    );
    expect(scenePosterGradient(Number.NaN, 4)).toBe(SCENE_POSTER_RAMP[0]);
  });

  it("is DETERMINISTIC — the same (index,total) always yields the same string", () => {
    // Two renders of the same item must not shuffle their posters; that is the whole
    // reason this is derived from the index rather than randomised per mount.
    for (const total of [1, 4, 9]) {
      for (let index = 1; index <= total; index += 1) {
        expect(scenePosterGradient(index, total)).toBe(
          scenePosterGradient(index, total),
        );
      }
    }
  });
});
