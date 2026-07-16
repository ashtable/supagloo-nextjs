import { describe, expect, it } from "vitest";

// Not yet implemented — RED until `lib/studio/captions.ts` exists.
import { visibleCaption } from "./captions";
// Cross-module: exercises the resolver against the real demo model + a transform.
import { DEMO_STORYBOARD, setSceneOnScreenText } from "./storyboard";

function scene(sb: typeof DEMO_STORYBOARD, id: string) {
  const s = sb.scenes.find((sc) => sc.id === id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
}

describe("visibleCaption", () => {
  it("U-C1: returns the script for an on-screen-text scene", () => {
    expect(visibleCaption(scene(DEMO_STORYBOARD, "s1"))).toBe(
      "I am the voice of one",
    );
    expect(visibleCaption(scene(DEMO_STORYBOARD, "s2"))).toBe(
      "of one crying in the wilderness,",
    );
  });

  it("U-C2: returns null for a voice-only scene (script present but not shown)", () => {
    const s3 = scene(DEMO_STORYBOARD, "s3");
    expect(s3.onScreenText).toBe("voice-only");
    expect(s3.script).toBe("Make straight the way of the Lord.");
    expect(visibleCaption(s3)).toBeNull();
  });

  it("U-C3: tracks the on-screen-text transform both ways", () => {
    const hidden = setSceneOnScreenText(DEMO_STORYBOARD, "s2", "voice-only");
    expect(visibleCaption(scene(hidden, "s2"))).toBeNull();

    const shown = setSceneOnScreenText(hidden, "s2", "text");
    expect(visibleCaption(scene(shown, "s2"))).toBe(
      "of one crying in the wilderness,",
    );
  });
});
