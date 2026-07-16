/**
 * The caption/voice-only resolver (pure). A voice-only scene has a narration
 * script but renders NO on-screen caption; a text scene shows its script.
 */
import type { Scene } from "./storyboard";

/** The on-screen caption for a scene, or `null` when it's voice-only. */
export function visibleCaption(scene: Scene): string | null {
  return scene.onScreenText === "text" ? scene.script : null;
}
