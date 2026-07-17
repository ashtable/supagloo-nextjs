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

/** §7 scene-tree row label: `Scene NN · <visualLabel>` — 1-based index,
 *  zero-padded, joined to the scene's own visualLabel with a middot (U+00B7).
 *  Derived from the real storyboard (NOT the wireframe's Psalm mock), the only
 *  genuinely-new pure logic the 13b scene-tree needs. */
export function sceneTreeLabel(scene: Scene): string {
  return `Scene ${String(scene.index).padStart(2, "0")} · ${scene.visualLabel}`;
}

/** Total runtime in seconds. */
export function totalDurationSeconds(sb: Storyboard): number {
  return sb.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
}

/**
 * Total composition length in FRAMES — the SUM of each scene's rounded frame
 * count. This is the single source of truth for the Player's `durationInFrames`
 * and the scrubber clamp, and it matches the composition's `<Sequence>` layout
 * (which also sums per-scene rounds). NB: this is NOT `round(sum(seconds)·fps)`
 * — with fractional-second scenes `sum(round)` and `round(sum)` diverge, and the
 * Sequences use `sum(round)`, so the Player must too or the last scene's frames
 * fall outside the timeline.
 */
export function totalFrames(sb: Storyboard, fps: number): number {
  return sb.scenes.reduce(
    (sum, s) => sum + secondsToFrames(s.durationSeconds, fps),
    0,
  );
}

/** Frames of settle past a scene's first frame before its caption has faded in
 *  (the composition fades captions over `interpolate(frame, [0, 8], …)`), so a
 *  freshly-selected paused scene shows a VISIBLE caption, not an opacity-0 one. */
const CAPTION_SETTLE_FRAMES = 20;

/**
 * The frame to seek to when a scene becomes selected (or on initial load): its
 * start plus a small settle offset, CLAMPED within the scene, so the caption is
 * faded in rather than sitting at the invisible fade-in edge (frame 0). Derived
 * from state — never a hardcoded scene id — so no storyboard shape can crash it.
 */
export function sceneEntryFrame(
  sb: Storyboard,
  id: string,
  fps: number,
): number {
  const startFrame = secondsToFrames(sceneRange(sb, id).start, fps);
  const scene = sb.scenes.find((s) => s.id === id);
  const sceneFrames = scene ? secondsToFrames(scene.durationSeconds, fps) : 1;
  const offset = Math.min(CAPTION_SETTLE_FRAMES, Math.max(0, sceneFrames - 1));
  return startFrame + offset;
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
