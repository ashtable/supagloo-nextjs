"use client";

import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { secondsToFrames } from "@/lib/studio/time";
import { visibleCaption } from "@/lib/studio/captions";
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
}: {
  scene: Scene;
  reference: string;
}) {
  const frame = useCurrentFrame(); // relative to this Sequence
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const caption = visibleCaption(scene);

  return (
    <AbsoluteFill style={{ background: SCENE_BACKDROP[scene.id] ?? "#221a34" }}>
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
}: StoryboardVideoProps) {
  const starts: number[] = [];
  let acc = 0;
  for (const scene of scenes) {
    starts.push(acc);
    acc += secondsToFrames(scene.durationSeconds, fps);
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#160f14" }}>
      {scenes.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={starts[i]}
          durationInFrames={secondsToFrames(scene.durationSeconds, fps)}
          name={`Scene ${scene.index}`}
        >
          <SceneContent scene={scene} reference={reference} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
