import { describe, it, expect } from "vitest";
import {
  MUSIC_SLOT,
  NARRATION_SLOT,
  STORYBOARD_SLOT,
  activeGeneration,
  imageSlot,
  initialStudioState,
  isPreviewGenerating,
  isStudioLocked,
  scriptSlot,
  studioReducer,
  videoSlot,
  type StudioState,
} from "./reducer";
import { DEMO_STORYBOARD } from "./storyboard";
import type { StudioProject } from "./project";

/**
 * Figure 20a — the studio-wide lock.
 *
 * Today's busy state is three unrelated mechanisms: per-button label swaps at
 * `opacity:.6`, a Player scrim gated on `isPreviewGenerating` (which covers only the
 * SELECTED scene's image and a storyboard re-plan), and the separate 14c render overlay.
 * 20a replaces the first two with one lock over every generation kind.
 *
 * The most important test here is U-L2: a predicate that claims to cover a CLASS has to be
 * driven over the whole class, not over the one member that was convenient.
 */

const PROJECT: StudioProject = {
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
};
const start = (): StudioState => initialStudioState(PROJECT);
const begin = (state: StudioState, slot: string) =>
  studioReducer(state, { type: "GENERATION_BEGIN", slot });

describe("activeGeneration / isStudioLocked", () => {
  it("U-L1: an idle studio is not locked", () => {
    expect(activeGeneration(start())).toBeNull();
    expect(isStudioLocked(start())).toBe(false);
  });

  it("U-L2: EVERY generation kind locks the studio — image, video, narration, music, script, storyboard", () => {
    // The bug 20a fixes is that only two of these ever produced any blocking signal. A
    // test that drove one of them would pass against the old behaviour.
    const sceneId = DEMO_STORYBOARD.scenes[0].id;
    const cases: Array<[string, string, string | null]> = [
      [imageSlot(sceneId), "image", sceneId],
      [videoSlot(sceneId), "video", sceneId],
      [scriptSlot(sceneId), "script", sceneId],
      [NARRATION_SLOT, "narration", null],
      [MUSIC_SLOT, "music", null],
      [STORYBOARD_SLOT, "storyboard", null],
    ];
    for (const [slot, kind, expectedScene] of cases) {
      const state = begin(start(), slot);
      const active = activeGeneration(state);
      expect(active, slot).not.toBeNull();
      expect(active!.kind, slot).toBe(kind);
      expect(active!.slot, slot).toBe(slot);
      expect(active!.sceneId, slot).toBe(expectedScene);
      expect(isStudioLocked(state), slot).toBe(true);
    }
  });

  it("U-L3: a NON-selected scene's generation still locks the editor", () => {
    // `isPreviewGenerating` deliberately ignores this case (the visible frame does not
    // change). The lock must not: the generation will still land into whatever the user
    // edits meanwhile.
    const other = DEMO_STORYBOARD.scenes[2].id;
    const state = begin(start(), imageSlot(other));
    expect(isStudioLocked(state)).toBe(true);
    expect(activeGeneration(state)!.sceneId).toBe(other);
  });

  it("U-L4: `isPreviewGenerating` is UNCHANGED — the two predicates answer different questions", () => {
    // The Player scrim asks "is the visible frame about to change?"; the lock asks "may
    // the user edit anything at all?". Widening the first would have changed the scrim's
    // meaning as a side effect of adding a lock.
    const narration = begin(start(), NARRATION_SLOT);
    expect(isStudioLocked(narration)).toBe(true);
    expect(isPreviewGenerating(narration)).toBe(false);

    const music = begin(start(), MUSIC_SLOT);
    expect(isPreviewGenerating(music)).toBe(false);

    const otherScene = begin(start(), imageSlot(DEMO_STORYBOARD.scenes[2].id));
    expect(isPreviewGenerating(otherScene)).toBe(false);
  });

  it("U-L5: a FAILED generation does not lock — the user must be able to retry", () => {
    const state = studioReducer(begin(start(), NARRATION_SLOT), {
      type: "GENERATION_FAILED",
      slot: NARRATION_SLOT,
      error: "boom",
    });
    expect(isStudioLocked(state)).toBe(false);
  });

  it("U-L6: beginning a generation CLOSES the popovers", () => {
    // `studio-app.tsx` documents that there is no blocking overlay precisely because
    // popover dismissal relies on pointerdown reaching other triggers — a scrim swallows
    // those. Reversing that decision means the lock closes the menus itself rather than
    // fighting them.
    const open = studioReducer(
      studioReducer(start(), { type: "TOGGLE_REROLL_MENU" }),
      { type: "TOGGLE_VERSION_MENU" },
    );
    expect(open.rerollMenuOpen || open.versionMenuOpen).toBe(true);
    const locked = begin(open, NARRATION_SLOT);
    expect(locked.rerollMenuOpen).toBe(false);
    expect(locked.shipMenuOpen).toBe(false);
    expect(locked.versionMenuOpen).toBe(false);
  });
});

describe("the generation id Cancel needs", () => {
  it("U-L7: the id is retained on the slot once the POST resolves", () => {
    // `runGeneration` kept `genId` in a local closure, which is why the api's
    // `POST /v1/ai/generations/:id/cancel` had no client path at all.
    const running = begin(start(), NARRATION_SLOT);
    expect(activeGeneration(running)!.generationId).toBeNull();
    const started = studioReducer(running, {
      type: "GENERATION_STARTED",
      slot: NARRATION_SLOT,
      generationId: "gen-1",
    });
    expect(activeGeneration(started)!.generationId).toBe("gen-1");
  });

  it("U-L8: a late id never resurrects a slot that already settled", () => {
    // The POST can resolve after the generation has failed or landed; writing the id then
    // would put a dead slot back into `running` and re-lock the studio forever.
    const failed = studioReducer(begin(start(), NARRATION_SLOT), {
      type: "GENERATION_FAILED",
      slot: NARRATION_SLOT,
      error: "boom",
    });
    const late = studioReducer(failed, {
      type: "GENERATION_STARTED",
      slot: NARRATION_SLOT,
      generationId: "gen-1",
    });
    expect(late).toBe(failed);
    expect(isStudioLocked(late)).toBe(false);
  });

  it("U-L9: a REFUSED cancel keeps the lock up and records the refusal", () => {
    // The api answers 409 `generation_not_cancelable` for a generation past the point of
    // no return. Dropping the lock there would let it land into an editor the user had
    // resumed editing — the exact race the lock exists to prevent.
    const started = studioReducer(begin(start(), MUSIC_SLOT), {
      type: "GENERATION_STARTED",
      slot: MUSIC_SLOT,
      generationId: "gen-9",
    });
    const refused = studioReducer(started, {
      type: "GENERATION_CANCEL_REFUSED",
      slot: MUSIC_SLOT,
    });
    expect(isStudioLocked(refused)).toBe(true);
    expect(refused.generations[MUSIC_SLOT].cancelRefused).toBe(true);
  });
});
