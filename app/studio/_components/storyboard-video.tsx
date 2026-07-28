"use client";

import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { secondsToFrames } from "@/lib/studio/time";
import { visibleCaption } from "@/lib/studio/captions";
import { kenBurnsForScene, musicLoopFrames } from "@/lib/studio/ken-burns";
import { effectiveSceneDurationSeconds } from "@/lib/studio/scene-duration";
import type { Scene } from "@/lib/studio/storyboard";

/**
 * The rendered storyboard — the REAL Remotion composition the Player plays. One
 * <Sequence> per scene; each draws its visual backdrop and, when the scene shows
 * on-screen text, the Zilla Slab scripture caption (via the pure resolver). The
 * verse reference sits at the bottom of every scene. Editor chrome (SCENE chip,
 * ROUGH badge, etc.) is NOT here — it's DOM overlay, so the composition equals
 * the actual video.
 *
 * Authored in composition pixels (1080-wide portrait, etc.); the Player scales
 * it to the display box. Typography is sized off the shorter edge so it reads
 * consistently across 9:16 / 16:9 / 1:1.
 */
export type StoryboardVideoProps = {
  scenes: Scene[];
  reference: string;
  fps: number;
  /** Task #35: presigned preview URLs for the whole-project generated audio (null
   *  until generated). Rendered as Remotion `<Audio>` so the preview plays them. */
  narrationUrl?: string | null;
  musicUrl?: string | null;
  /** MEASURED length of the music bed. When it is shorter than the composition the bed is
   *  LOOPED to cover the whole video, exactly as the render does — otherwise the timeline's
   *  "one continuous bed" would be a drawing the preview contradicts. */
  musicDurationSeconds?: number;
};

const SCENE_BACKDROP: Record<string, string> = {
  s1: "linear-gradient(160deg,#3a3350,#7a6a6e,#c98f63)",
  s2: "linear-gradient(178deg,#221a34 0%,#4a3350 26%,#8a4a38 55%,#d0722e 78%,#f0b45a 100%)",
  s3: "linear-gradient(160deg,#7a4a2a,#d0632e,#f0c06a)",
  s4: "linear-gradient(160deg,#241a13,#3a2a1e)",
};

function SceneContent({
  scene,
  reference,
  index,
  durationInFrames,
}: {
  scene: Scene;
  reference: string;
  index: number;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame(); // relative to this Sequence
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const caption = visibleCaption(scene);
  // Ken Burns, mirrored from the render generator and normalized over THIS scene's own
  // length so the move completes exactly once whatever the scene's duration.
  const motion = kenBurnsForScene(index);
  const isVideo = scene.visualAssetKind === "video";

  return (
    <AbsoluteFill style={{ background: SCENE_BACKDROP[scene.id] ?? "#221a34" }}>
      {/* Task #35: the generated scene visual (presigned preview URL) as the
          backdrop, replacing the gradient once a reroll lands. Falls back to the
          gradient above when no visual has been generated. */}
      {scene.visualUrl ? (
        isVideo ? (
          // A clip already moves; it also must not go through <Img>, which would show a
          // single frame of it. (The render had the same latent bug until the manifest
          // gained a still-vs-clip discriminator.)
          <OffthreadVideo
            data-testid="scene-visual"
            src={scene.visualUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Img
            data-testid="scene-visual"
            src={scene.visualUrl}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              // `scale` is a STRING on purpose: React's unitless-property table omits it,
              // so a number would render as `scale:1.1px` and the zoom would do nothing.
              scale: interpolate(frame, [0, durationInFrames], motion.scale, {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(frame, [0, durationInFrames], motion.translate, {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          />
        )
      ) : null}

      {/* vignette */}
      <AbsoluteFill
        style={{ boxShadow: `inset 0 0 ${base * 0.22}px rgba(20,10,4,.75)` }}
      />

      {caption ? (
        <AbsoluteFill
          data-testid="scene-caption"
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            padding: `0 ${base * 0.09}px`,
            paddingBottom: base * 0.18,
            opacity,
          }}
        >
          <div
            // Item 1's "respecting RTL/LTR", mirrored EXACTLY in the render generator
            // (`supagloo-nodejs-dbos/src/remotion/templates.ts`). `dir="auto"` is the
            // HTML first-strong-character algorithm; the preview (@remotion/player) and
            // the render (@remotion/renderer) are both Chromium, so they resolve it with
            // the same engine and cannot disagree — which a per-scene manifest field,
            // mirrored across four schemas, would not have guaranteed any better.
            // Centring is direction-neutral, so `dir` only fixes punctuation placement
            // and mixed-content ordering, never the layout.
            dir="auto"
            style={{
              textAlign: "center",
              color: "#fff",
              fontFamily: "var(--font-zilla), 'Zilla Slab', Georgia, serif",
              fontWeight: 500,
              fontSize: base * 0.075,
              lineHeight: 1.32,
              textShadow: `0 3px ${base * 0.05}px rgba(20,8,2,.85)`,
            }}
          >
            {caption}
          </div>
        </AbsoluteFill>
      ) : null}

      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: base * 0.065,
        }}
      >
        <div
          // Same reason as the caption. This one matters even more: YouVersion's own
          // reference strings for RTL translations arrive pre-marked with U+200E around
          // the numerals ("التكوين ‎1:1"), and rendering them in an LTR context reorders
          // the numerals.
          dir="auto"
          style={{
            color: "rgba(255,240,220,.7)",
            fontFamily:
              "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
            fontWeight: 600,
            fontSize: base * 0.028,
            letterSpacing: ".22em",
          }}
        >
          {reference}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function StoryboardVideo({
  scenes,
  reference,
  fps,
  narrationUrl,
  musicUrl,
  musicDurationSeconds,
}: StoryboardVideoProps) {
  // Scene lengths go through `effectiveSceneDurationSeconds`, so a scene that has to
  // stretch to fit its narration is laid out at the length it will really render at.
  const lengths = scenes.map((scene) =>
    secondsToFrames(effectiveSceneDurationSeconds(scene), fps),
  );
  const starts: number[] = [];
  let acc = 0;
  for (const length of lengths) {
    starts.push(acc);
    acc += length;
  }
  const total = acc;
  const loopFrames = musicLoopFrames(musicDurationSeconds, fps, total);
  const fadeStart = Math.max(0, total - secondsToFrames(1.5, fps));

  // Whole-project narration is the BACKWARD-COMPATIBLE fallback only: it is played across
  // the composition, which is what it always did, and it yields the moment any scene has
  // its own clip (otherwise the two would double up).
  const hasPerSceneNarration = scenes.some((s) => s.narrationUrl);

  return (
    <AbsoluteFill style={{ backgroundColor: "#160f14" }}>
      {narrationUrl && !hasPerSceneNarration ? <Audio src={narrationUrl} /> : null}
      {musicUrl ? (
        loopFrames ? (
          // The bed is shorter than the video, so repeat it. <Loop> fills
          // `ceil(compositionDuration / durationInFrames)` iterations and the composition's
          // own end trims the last — coverage and trim in one construct.
          // `loopVolumeCurveBehavior="extend"` makes the fade callback's frame a COMPOSITION
          // frame, so this is a single tail fade rather than a duck at every repeat.
          <Loop durationInFrames={loopFrames}>
            <Audio
              src={musicUrl}
              loopVolumeCurveBehavior="extend"
              volume={(f) =>
                interpolate(f, [fadeStart, total], [0.4, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })
              }
            />
          </Loop>
        ) : (
          <Audio src={musicUrl} volume={0.4} />
        )
      ) : null}
      {scenes.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={starts[i]}
          durationInFrames={lengths[i]}
          name={`Scene ${scene.index}`}
        >
          <SceneContent
            scene={scene}
            reference={reference}
            index={i}
            durationInFrames={lengths[i]}
          />
          {/* PER-SCENE NARRATION: mounted INSIDE this scene's Sequence, which is what makes
              it start when the scene starts. The whole-project track above could only ever
              start at frame 0 and drift. */}
          {scene.narrationUrl ? <Audio src={scene.narrationUrl} /> : null}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
