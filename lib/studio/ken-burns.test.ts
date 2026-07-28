import { describe, expect, it } from "vitest";
import { KEN_BURNS, kenBurnsForScene, musicLoopFrames } from "./ken-burns";

/**
 * The preview's motion + music-fitting rules. These are a deliberate HAND-MIRROR of the
 * render generator's (`supagloo-nodejs-dbos/src/remotion/templates.ts`, `KEN_BURNS` and the
 * `<Loop>` emission) — nextjs cannot import from the dbos repo.
 *
 * design-delta §2 limitation 2 accepts preview/render divergence in general, but a
 * user-visible MOTION effect that exists in only one of them is a UX regression: the studio
 * would show a static frame and the downloaded video would pan. So the values below are
 * pinned, and any change to the render's table has to be made here too.
 */
describe("kenBurnsForScene", () => {
  it("U-KB1: matches the render generator's table exactly", () => {
    expect(KEN_BURNS).toEqual([
      { scale: ["1", "1.1"], translate: ["0% 0%", "1.5% 1%"] },
      { scale: ["1.1", "1"], translate: ["-1.5% -1%", "0% 0%"] },
      { scale: ["1", "1.1"], translate: ["0% 0%", "-1.5% 1%"] },
      { scale: ["1.1", "1"], translate: ["1.5% -1%", "0% 0%"] },
    ]);
  });

  it("U-KB2: is a pure function of the scene INDEX — no randomness, no clock", () => {
    // The render generator is deterministic and golden-pinned; a preview that wandered
    // would stop predicting it. Same index ⇒ same motion, always.
    expect(kenBurnsForScene(0)).toBe(kenBurnsForScene(0));
    expect(kenBurnsForScene(2)).toEqual(KEN_BURNS[2]);
  });

  it("U-KB3: cycles, so any number of scenes is covered and neighbours differ", () => {
    expect(kenBurnsForScene(4)).toEqual(kenBurnsForScene(0));
    for (let i = 0; i < 8; i++) {
      expect(kenBurnsForScene(i)).not.toEqual(kenBurnsForScene(i + 1));
    }
  });
});

describe("musicLoopFrames", () => {
  it("U-KB4: returns the per-iteration frame count for a bed shorter than the video", () => {
    // 3s at 10fps over a 74-frame composition: the bed must repeat to cover it.
    expect(musicLoopFrames(3, 10, 74)).toBe(30);
  });

  it("U-KB5: returns null when the bed already spans the video (nothing to loop)", () => {
    expect(musicLoopFrames(30, 10, 74)).toBeNull();
  });

  it("U-KB6: returns null when no length was measured — never guesses one", () => {
    // A guessed iteration length would mis-time the bed on every playthrough. Falling back
    // to a plain un-looped <Audio> is the old behaviour, which is at least honest.
    expect(musicLoopFrames(undefined, 10, 74)).toBeNull();
  });
});
