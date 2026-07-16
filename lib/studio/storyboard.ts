/**
 * The storyboard model + the static demo data + pure model transforms (no
 * React/DOM). Copy is glyph-exact from the 5a wireframe (middot `·` U+00B7,
 * em dash `—` U+2014).
 */
import { secondsToFrames } from "./time";

export type OnScreenText = "text" | "voice-only";

export interface Scene {
  id: string;
  /** 1-based display number. */
  index: number;
  durationSeconds: number;
  visualLabel: string;
  visualPrompt: string;
  script: string;
  onScreenText: OnScreenText;
}

export interface Storyboard {
  title: string;
  dateLabel: string;
  reference: string;
  fps: number;
  voiceDescription: string;
  voiceLabel: string;
  musicMood: string;
  scenes: Scene[];
}

/** Verse of the Day · John 1:23 · KJV — 4 scenes, 0:30, 30fps. */
export const DEMO_STORYBOARD: Storyboard = {
  title: "VERSE OF THE DAY",
  dateLabel: "· Jul 4",
  reference: "JOHN 1:23 · KJV",
  fps: 30,
  voiceDescription:
    "warm, weathered, resonant baritone — unhurried, reverent, like James Earl Jones narrating scripture",
  voiceLabel: "JAMES EARL JONES-STYLE",
  musicMood: "Swelling strings",
  scenes: [
    {
      id: "s1",
      index: 1,
      durationSeconds: 5,
      visualLabel: "wilderness · dawn",
      visualPrompt:
        "sweeping empty wilderness at first light, pale dawn breaking over dunes, cold blue shadows, cinematic wide establishing shot",
      script: "I am the voice of one",
      onScreenText: "text",
    },
    {
      id: "s2",
      index: 2,
      durationSeconds: 9,
      visualLabel: "lone figure · desert path",
      visualPrompt:
        "lone bearded figure walking a desert path, blowing dust, low golden sun, cinematic 35mm, shallow depth of field",
      script: "of one crying in the wilderness,",
      onScreenText: "text",
    },
    {
      id: "s3",
      index: 3,
      durationSeconds: 8,
      visualLabel: "sunrise · road",
      visualPrompt:
        "a straight dirt road stretching toward a rising sun, warm rays flaring, hopeful, cinematic",
      script: "Make straight the way of the Lord.",
      onScreenText: "voice-only",
    },
    {
      id: "s4",
      index: 4,
      durationSeconds: 8,
      visualLabel: "verse card",
      visualPrompt:
        "elegant scripture verse card, dark parchment, warm serif typography, subtle gold flourish",
      script: "John 1:23 · KJV",
      onScreenText: "text",
    },
  ],
};

/** Total runtime in seconds. */
export function totalDurationSeconds(sb: Storyboard): number {
  return sb.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
}

/** Cumulative {start,end} seconds for a scene. */
export function sceneRange(
  sb: Storyboard,
  id: string,
): { start: number; end: number } {
  let start = 0;
  for (const s of sb.scenes) {
    const end = start + s.durationSeconds;
    if (s.id === id) return { start, end };
    start = end;
  }
  throw new Error(`sceneRange: no scene ${id}`);
}

/**
 * Which scene contains `frame` (a boundary frame belongs to the NEXT scene).
 * Frames beyond the end clamp to the last scene.
 */
export function sceneAtFrame(sb: Storyboard, frame: number, fps: number): Scene {
  let startFrame = 0;
  for (const s of sb.scenes) {
    const endFrame = startFrame + secondsToFrames(s.durationSeconds, fps);
    if (frame < endFrame) return s;
    startFrame = endFrame;
  }
  return sb.scenes[sb.scenes.length - 1];
}

/** Per-scene flex weights (equal to durations) for the timeline segments. */
export function timelineWeights(sb: Storyboard): number[] {
  return sb.scenes.map((s) => s.durationSeconds);
}

/** Interior scene-boundary positions as fractions of the total runtime. */
export function sceneBoundaryFractions(sb: Storyboard): number[] {
  const total = totalDurationSeconds(sb);
  const fractions: number[] = [];
  let acc = 0;
  for (let i = 0; i < sb.scenes.length - 1; i++) {
    acc += sb.scenes[i].durationSeconds;
    fractions.push(acc / total);
  }
  return fractions;
}

function mapScene(
  sb: Storyboard,
  id: string,
  fn: (s: Scene) => Scene,
): Storyboard {
  return { ...sb, scenes: sb.scenes.map((s) => (s.id === id ? fn(s) : s)) };
}

/** Immutably replace a scene's narration script. */
export function updateSceneScript(
  sb: Storyboard,
  id: string,
  script: string,
): Storyboard {
  return mapScene(sb, id, (s) => ({ ...s, script }));
}

/** Immutably set a scene's on-screen-text mode. */
export function setSceneOnScreenText(
  sb: Storyboard,
  id: string,
  value: OnScreenText,
): Storyboard {
  return mapScene(sb, id, (s) => ({ ...s, onScreenText: value }));
}

/** Immutably replace a scene's visual prompt. */
export function updateSceneVisualPrompt(
  sb: Storyboard,
  id: string,
  visualPrompt: string,
): Storyboard {
  return mapScene(sb, id, (s) => ({ ...s, visualPrompt }));
}

/** Immutably set the whole-video music mood. */
export function setMusicMood(sb: Storyboard, musicMood: string): Storyboard {
  return { ...sb, musicMood };
}
