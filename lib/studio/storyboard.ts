/**
 * The storyboard model + the static demo data + pure model transforms (no
 * React/DOM). Copy is glyph-exact from the 5a wireframe (middot `·` U+00B7,
 * em dash `—` U+2014).
 */
import { secondsToFrames } from "./time";
import { effectiveSceneDurationSeconds } from "./scene-duration";
import type { GeneratedStoryboard } from "../api/contracts";

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
  /** Task #35: the PERSISTED S3 key of the generated scene visual (image/clip),
   *  round-tripped to/from `ManifestScene.visualAssetKey`. Absent/null until a
   *  reroll generates one. */
  visualAssetKey?: string | null;
  /** Task #35: the EPHEMERAL presigned preview URL derived from `visualAssetKey`.
   *  Never serialized to the manifest — it's a display-only signed URL that the
   *  composition renders as an `<Img>`; it is re-derived on load / after a reroll. */
  visualUrl?: string | null;
  /** Task #57: the scene's OWN scripture reference/translation, carried on the UI
   *  Scene so it survives a re-plan. Populated by `hydrateStoryboard` (from the
   *  manifest) AND `storyboardFromGenerated` (from the LLM's authoritative per-scene
   *  output). `serializeManifest` writes these back instead of id-rematching stale
   *  values off the pre-replan manifest. Absent only on the mock `DEMO_STORYBOARD`. */
  reference?: string;
  translation?: string;
  /** Still vs clip. Absent ⇒ image. Drives the Ken Burns pan (stills only) and the
   *  `<OffthreadVideo>` branch, in the preview exactly as in the render. */
  visualAssetKind?: "image" | "video";
  /** This scene's OWN narration clip (↔ `ManifestScene.narrationAssetKey`) and its
   *  MEASURED length. Narration used to be one whole-project asset played from frame 0
   *  with nothing aligning it to the picture; the per-scene key is what lets the preview
   *  mount it inside this scene's `<Sequence>`, and the measured length is what stops the
   *  scene cutting the verse off. */
  narrationAssetKey?: string | null;
  narrationDurationSeconds?: number;
  /** EPHEMERAL presigned preview URL for this scene's narration (never serialized). */
  narrationUrl?: string | null;
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
  /** Task #35: PERSISTED whole-project asset keys (↔ `narratorVoice.assetKey` /
   *  `music.assetKey`). Absent/null until narration/music is generated. */
  narrationAssetKey?: string | null;
  musicAssetKey?: string | null;
  /** MEASURED length of the synthesized music bed (↔ `MusicBed.durationSeconds`). The
   *  preview loops the bed over this length so the timeline's "one continuous bed" is
   *  honest — the same thing the render does. */
  musicDurationSeconds?: number;
  /** Task #35: EPHEMERAL presigned preview URLs for narration/music (never
   *  serialized) — the composition plays them as `<Audio>` when present. */
  narrationUrl?: string | null;
  musicUrl?: string | null;
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

/** Total runtime in seconds. Uses each scene's EFFECTIVE length, so a scene that had to
 *  stretch to fit its narration is counted at the length it will actually render at. */
export function totalDurationSeconds(sb: Storyboard): number {
  return sb.scenes.reduce((sum, s) => sum + effectiveSceneDurationSeconds(s), 0);
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
    (sum, s) => sum + secondsToFrames(effectiveSceneDurationSeconds(s), fps),
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

/** Cumulative {start,end} seconds for a scene.
 *
 *  Every function in this file that turns a scene into a LENGTH goes through
 *  `effectiveSceneDurationSeconds` — `totalDurationSeconds`, `totalFrames`, `sceneRange`,
 *  `sceneAtFrame`, `timelineWeights`, `sceneBoundaryFractions`. Missing even one would put
 *  the scrubber, the timeline segments and the Player's clamp out of step with the
 *  `<Sequence>` layout, which is the class of bug this repo has already been bitten by
 *  (memory `one-rule-one-module-many-boundaries`). */
export function sceneRange(
  sb: Storyboard,
  id: string,
): { start: number; end: number } {
  let start = 0;
  for (const s of sb.scenes) {
    const end = start + effectiveSceneDurationSeconds(s);
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
    const endFrame = startFrame + secondsToFrames(effectiveSceneDurationSeconds(s), fps);
    if (frame < endFrame) return s;
    startFrame = endFrame;
  }
  return sb.scenes[sb.scenes.length - 1];
}

/** Per-scene flex weights (equal to durations) for the timeline segments. */
export function timelineWeights(sb: Storyboard): number[] {
  return sb.scenes.map((s) => effectiveSceneDurationSeconds(s));
}

/** Interior scene-boundary positions as fractions of the total runtime. */
export function sceneBoundaryFractions(sb: Storyboard): number[] {
  const total = totalDurationSeconds(sb);
  const fractions: number[] = [];
  let acc = 0;
  for (let i = 0; i < sb.scenes.length - 1; i++) {
    acc += effectiveSceneDurationSeconds(sb.scenes[i]);
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

// ── Task #35: AI-generation transforms (pure, immutable) ─────────────────────

/** Set a scene's generated visual: the persisted `visualAssetKey` AND the
 *  ephemeral presigned preview `visualUrl` (a reroll landing). */
export function setSceneVisual(
  sb: Storyboard,
  id: string,
  visual: { assetKey: string; url: string | null },
): Storyboard {
  return mapScene(sb, id, (s) => ({
    ...s,
    visualAssetKey: visual.assetKey,
    visualUrl: visual.url,
  }));
}

/**
 * Attach the per-scene narration clips a narration generation produced.
 *
 * The generation writes one clip PER SCENE and reports them as a map; this walks that map
 * onto the matching scenes. Scenes not named in the map are left exactly as they were (a
 * partial map is possible if the storyboard changed between request and response).
 *
 * Storing the MEASURED length alongside the key is what lets `effectiveSceneDurationSeconds`
 * stretch a scene whose verse takes longer to read than the LLM guessed — which is the half
 * of the narration fix that stops a verse being cut off mid-sentence.
 */
export function setSceneNarrationAssets(
  sb: Storyboard,
  scenes: ReadonlyArray<{
    sceneId: string;
    assetKey: string;
    durationSeconds?: number;
  }>,
): Storyboard {
  if (scenes.length === 0) return sb;
  const byId = new Map(scenes.map((s) => [s.sceneId, s]));
  return {
    ...sb,
    scenes: sb.scenes.map((scene) => {
      const hit = byId.get(scene.id);
      if (!hit) return scene;
      return {
        ...scene,
        narrationAssetKey: hit.assetKey,
        ...(hit.durationSeconds !== undefined
          ? { narrationDurationSeconds: hit.durationSeconds }
          : {}),
        // The previous scene-local preview URL now points at superseded audio.
        narrationUrl: null,
      };
    }),
  };
}

/** Set only a scene's ephemeral preview `visualUrl` (hydrate-time presign of an
 *  already-persisted `visualAssetKey`) — NOT an edit. */
export function setSceneVisualUrl(
  sb: Storyboard,
  id: string,
  url: string | null,
): Storyboard {
  return mapScene(sb, id, (s) => ({ ...s, visualUrl: url }));
}

/** Immutably replace the whole-video narrator voice description. */
export function setVoiceDescription(
  sb: Storyboard,
  description: string,
): Storyboard {
  return { ...sb, voiceDescription: description };
}

/** Set the persisted whole-project narration asset key + its ephemeral preview url. */
export function setNarrationAsset(
  sb: Storyboard,
  assetKey: string,
  url: string | null = null,
): Storyboard {
  return { ...sb, narrationAssetKey: assetKey, narrationUrl: url };
}

/** Set the persisted whole-project music asset key + its ephemeral preview url. */
export function setMusicAsset(
  sb: Storyboard,
  assetKey: string,
  url: string | null = null,
): Storyboard {
  return { ...sb, musicAssetKey: assetKey, musicUrl: url };
}

/** Every scene projected to the narration synthesis input `{sceneId, scriptText}`
 *  — narration is a WHOLE-PROJECT synthesis over all scenes' scripts. */
export function narrationScenesOf(
  sb: Storyboard,
): { sceneId: string; scriptText: string }[] {
  return sb.scenes.map((s) => ({ sceneId: s.id, scriptText: s.script }));
}

/**
 * Build a fresh UI storyboard from a `storyboard`-kind LLM result, keeping the
 * base composition frame (fps / reference / title / voice label). The generated
 * scenes have no ids/captions/assetKeys, so those are assigned here: stable
 * `s1…sN` ids, 1-based index, captions ON by default, `durationSeconds` from the
 * suggested value. Whole-video voice/music descriptors come from the result; the
 * old whole-project narration/music assets no longer match a brand-new storyboard,
 * so they RESET to null (a re-generate must be re-synthesized).
 */
export function storyboardFromGenerated(
  gen: GeneratedStoryboard,
  base: Storyboard,
): Storyboard {
  return {
    ...base,
    voiceDescription: gen.narratorVoice.description,
    voiceLabel: gen.narratorVoice.label ?? base.voiceLabel,
    musicMood: gen.musicStyle,
    narrationAssetKey: null,
    musicAssetKey: null,
    narrationUrl: null,
    musicUrl: null,
    scenes: gen.scenes.map((s, i) => ({
      id: `s${i + 1}`,
      index: i + 1,
      durationSeconds: s.suggestedDurationSeconds,
      visualLabel: s.name,
      visualPrompt: s.visualPrompt,
      script: s.scriptText,
      onScreenText: "text" as OnScreenText,
      // Task #57: carry the LLM's OWN per-scene scripture so a re-plan persists the
      // freshly-generated reference/translation, not the id-matched old scene's stale one.
      reference: s.reference,
      translation: s.translation,
      visualAssetKey: null,
      visualUrl: null,
    })),
  };
}
