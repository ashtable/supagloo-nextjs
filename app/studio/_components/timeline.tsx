"use client";

import styles from "../studio.module.css";
import { useStudio, usePlayerFrame } from "./studio-context";
import {
  sceneEntryFrame,
  timelineWeights,
  totalDurationSeconds,
  totalFrames,
} from "@/lib/studio/storyboard";

const TRACK_LABEL: React.CSSProperties = {
  width: 52,
  flex: "none",
  display: "flex",
  alignItems: "center",
  fontFamily: "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
  fontWeight: 600,
  fontSize: 9,
  letterSpacing: ".12em",
  color: "#7a6650",
};

const VISUAL_GRADIENT: Record<string, string> = {
  s1: "linear-gradient(160deg,#3a3350,#7a6a6e,#c98f63)",
  s2: "linear-gradient(160deg,#5a3a2e,#b0623a,#e6a43b)",
  s3: "linear-gradient(160deg,#7a4a2a,#d0632e,#f0c06a)",
  s4: "linear-gradient(160deg,#241a13,#3a2a1e)",
};

/** Isolated 30Hz subscriber: only this element re-renders as the frame advances. */
function Playhead({ initialFrame, totalFrames }: { initialFrame: number; totalFrames: number }) {
  const { playerRef } = useStudio();
  const frame = usePlayerFrame(playerRef, initialFrame);
  const fraction = totalFrames > 0 ? frame / totalFrames : 0;
  return (
    <div
      data-testid="timeline-playhead"
      style={{
        position: "absolute",
        left: `calc(57px + (100% - 57px) * ${fraction})`,
        top: -2,
        bottom: -2,
        width: 2,
        background: "#f1e7d6",
        boxShadow: "0 0 8px rgba(241,231,214,.6)",
        zIndex: 5,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -6,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: "6px solid #f1e7d6",
        }}
      />
    </div>
  );
}

export default function Timeline() {
  const { state, selectScene } = useStudio();
  const { storyboard, selectedSceneId } = state;
  const fps = storyboard.fps;
  const weights = timelineWeights(storyboard);
  // Shared frame model with the Player (the [3]/[4] fix): total = sum of
  // per-scene rounds; playhead seeds at the SELECTED scene's settled entry frame.
  const durationInFrames = totalFrames(storyboard, fps);
  const initialFrame = sceneEntryFrame(storyboard, selectedSceneId, fps);

  return (
    <div
      style={{
        height: 222,
        flex: "none",
        borderTop: "1px solid rgba(230,180,120,.14)",
        background: "linear-gradient(180deg,#1b140d,#120d09)",
        padding: "13px 26px 14px",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <div
          style={{
            fontFamily:
              "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: ".22em",
            color: "#a99b85",
          }}
        >
          {"STORYBOARD"}
        </div>
        <div
          style={{
            fontFamily:
              "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: ".06em",
            color: "#6f5c46",
          }}
        >
          {`${storyboard.scenes.length} SCENES · ${formatTotal(storyboard)}`}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily:
              "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
            fontWeight: 600,
            fontSize: 9.5,
            letterSpacing: ".08em",
            color: "#c9baa2",
            background: "rgba(198,85,43,.14)",
            border: "1px solid rgba(198,85,43,.3)",
            borderRadius: 20,
            padding: "3px 10px",
          }}
        >
          {`🔊 VOICE · ${storyboard.voiceLabel}`}
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "ui-monospace, monospace",
            fontSize: 9,
            color: "#5a4a38",
            paddingLeft: 60,
          }}
        >
          {["0:00", "0:05", "0:14", "0:22", "0:30"].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>

      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 6 }}>
        {/* VISUAL */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 5 }}>
          <div style={TRACK_LABEL}>{"VISUAL"}</div>
          {storyboard.scenes.map((scene, i) => {
            const selected = scene.id === selectedSceneId;
            return (
              <button
                key={scene.id}
                type="button"
                data-testid={`scene-seg-${scene.id}`}
                aria-label={`Select scene ${scene.index}`}
                aria-pressed={selected}
                onClick={() => selectScene(scene.id)}
                className={styles.hoverable}
                style={{
                  flex: weights[i],
                  height: 46,
                  borderRadius: 6,
                  position: "relative",
                  overflow: "hidden",
                  padding: 0,
                  background: VISUAL_GRADIENT[scene.id],
                  border:
                    scene.id === "s4"
                      ? "1px solid rgba(230,180,120,.2)"
                      : "none",
                  outline: selected ? "2.5px solid #e6a43b" : "none",
                  outlineOffset: selected ? -1 : 0,
                  boxShadow: selected ? "0 0 18px rgba(230,164,59,.35)" : "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 6,
                    bottom: 4,
                    fontFamily:
                      scene.id === "s4"
                        ? "var(--font-zilla), 'Zilla Slab', serif"
                        : "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
                    fontWeight: 600,
                    fontSize: scene.id === "s4" ? 9 : 8,
                    color:
                      scene.id === "s4"
                        ? "rgba(241,231,214,.8)"
                        : "rgba(255,255,255,.9)",
                    textShadow: "0 1px 3px rgba(0,0,0,.6)",
                  }}
                >
                  {scene.visualLabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* SCRIPT */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 5 }}>
          <div style={TRACK_LABEL}>{"SCRIPT"}</div>
          {storyboard.scenes.map((scene, i) => {
            const selected = scene.id === selectedSceneId;
            const voiceOnly = scene.onScreenText === "voice-only";
            return (
              <button
                key={scene.id}
                type="button"
                aria-label={`Select scene ${scene.index} script`}
                onClick={() => selectScene(scene.id)}
                className={styles.hoverable}
                style={{
                  flex: weights[i],
                  height: 30,
                  borderRadius: 5,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 8px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  fontFamily: "var(--font-zilla), 'Zilla Slab', serif",
                  fontSize: 10,
                  textAlign: "left",
                  color: voiceOnly ? "#7a6650" : selected ? "#f1e7d6" : "#e8dcc6",
                  background: voiceOnly
                    ? "transparent"
                    : selected
                      ? "rgba(230,164,59,.16)"
                      : "rgba(198,85,43,.14)",
                  border: voiceOnly
                    ? "1px dashed rgba(230,180,120,.3)"
                    : selected
                      ? "1.5px solid #c6552b"
                      : "1px solid rgba(198,85,43,.35)",
                }}
              >
                {voiceOnly ? (
                  <span
                    style={{
                      fontFamily:
                        "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
                      fontWeight: 700,
                      fontSize: 7,
                      letterSpacing: ".06em",
                      color: "#8a7358",
                      flex: "none",
                    }}
                  >
                    {"🔇 VOICE ONLY"}
                  </span>
                ) : null}
                {scene.script}
              </button>
            );
          })}
        </div>

        {/* VOICE */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 5 }}>
          <div style={TRACK_LABEL}>{"VOICE"}</div>
          {storyboard.scenes.map((scene, i) => {
            const highlight = scene.id === "s2";
            return (
              <div
                key={scene.id}
                aria-hidden
                style={{
                  flex: weights[i],
                  height: 22,
                  borderRadius: 5,
                  background: `repeating-linear-gradient(90deg,rgba(230,164,59,${highlight ? ".72" : ".5"}) 0 2px,transparent 2px 4px)`,
                  border: highlight
                    ? "1.5px solid #c6552b"
                    : "1px solid rgba(230,180,120,.18)",
                  boxShadow: highlight ? "0 0 12px rgba(230,164,59,.22)" : "none",
                }}
              />
            );
          })}
        </div>

        {/* MUSIC */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 5 }}>
          <div style={TRACK_LABEL}>{"MUSIC"}</div>
          <div
            aria-hidden
            style={{
              flex: 30,
              height: 18,
              borderRadius: 5,
              background:
                "repeating-linear-gradient(90deg,rgba(230,164,59,.32) 0 2px,transparent 2px 5px)",
              border: "1px solid rgba(230,180,120,.18)",
            }}
          />
        </div>

        <Playhead initialFrame={initialFrame} totalFrames={durationInFrames} />
      </div>
    </div>
  );
}

function formatTotal(storyboard: Parameters<typeof totalDurationSeconds>[0]): string {
  const total = totalDurationSeconds(storyboard);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
