import { describe, expect, it } from "vitest";
import { effectiveSceneDurationSeconds } from "./scene-duration";

/**
 * The nextjs MIRROR of db-lib's `effectiveSceneDurationSeconds` (nextjs does not import
 * db-lib — it hand-mirrors the manifest contracts, and this rule travels with them).
 *
 * It must agree with the render exactly: the studio timeline, the preview player and the
 * generated Remotion composition all turn a scene into frames, and if they disagree about
 * how long a scene is, the preview stops predicting the render.
 */
describe("effectiveSceneDurationSeconds (nextjs mirror)", () => {
  it("U-SD1: authored duration when there is no measured narration", () => {
    expect(effectiveSceneDurationSeconds({ durationSeconds: 4 })).toBe(4);
  });

  it("U-SD2: stretches to the narration when the narration is longer", () => {
    expect(
      effectiveSceneDurationSeconds({
        durationSeconds: 4,
        narrationDurationSeconds: 6.5,
      }),
    ).toBe(6.5);
  });

  it("U-SD3: keeps the authored duration when it already exceeds the narration", () => {
    expect(
      effectiveSceneDurationSeconds({
        durationSeconds: 9,
        narrationDurationSeconds: 6.5,
      }),
    ).toBe(9);
  });
});
