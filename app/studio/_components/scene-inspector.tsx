"use client";

import styles from "../studio.module.css";
import { useStudio } from "./studio-context";
import { sceneRange } from "@/lib/studio/storyboard";
import { formatTimecode } from "@/lib/studio/time";

const MONO = "ui-monospace, Menlo, monospace";
const LABEL: React.CSSProperties = {
  fontFamily: "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
  fontWeight: 600,
  fontSize: 10,
  letterSpacing: ".2em",
  color: "#a99b85",
  marginBottom: 8,
};
const DASHED_BOX: React.CSSProperties = {
  border: "1.5px dashed rgba(230,164,59,.5)",
  background: "rgba(230,164,59,.06)",
  borderRadius: 10,
};

// A small fixed set the mood control cycles through (inert re: real audio).
const MOODS = [
  "Swelling strings",
  "Ambient pads",
  "Solo piano",
  "Low drone",
] as const;

// Static equalizer bars (decorative).
const BARS = [34, 60, 82, 48, 68, 90, 52, 38, 72, 86, 44, 62, 78, 56, 94, 46];

export default function SceneInspector() {
  const { state, dispatch } = useStudio();
  const { storyboard, selectedSceneId } = state;
  const scene =
    storyboard.scenes.find((s) => s.id === selectedSceneId) ??
    storyboard.scenes[0];
  const { start, end } = sceneRange(storyboard, scene.id);
  const showText = scene.onScreenText === "text";

  const cycleMood = () => {
    const idx = MOODS.indexOf(storyboard.musicMood as (typeof MOODS)[number]);
    const next = MOODS[(idx + 1) % MOODS.length];
    dispatch({ type: "SET_MUSIC_MOOD", mood: next });
  };

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: "26px 30px",
        borderLeft: "1px solid rgba(230,180,120,.12)",
        background:
          "linear-gradient(180deg,rgba(34,26,18,.55),rgba(22,17,13,.35))",
        display: "flex",
        flexDirection: "column",
        gap: 15,
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <div
            style={{
              fontFamily:
                "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: ".24em",
              color: "#a99b85",
            }}
          >
            {"SCENE"}
          </div>
          <div
            data-testid="scene-number"
            style={{
              fontFamily: "var(--font-anton), sans-serif",
              fontSize: 46,
              lineHeight: 0.8,
              color: "#d0632e",
            }}
          >
            {String(scene.index).padStart(2, "0")}
          </div>
          <div
            data-testid="scene-range"
            style={{
              fontFamily:
                "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: ".1em",
              color: "#7a6650",
              paddingBottom: 6,
            }}
          >
            {`${formatTimecode(start)} – ${formatTimecode(end)} · ${scene.durationSeconds}s`}
          </div>
        </div>
        <button
          type="button"
          data-testid="reroll-scene"
          onClick={() => dispatch({ type: "TOGGLE_REROLL_MENU" })}
          className={styles.hoverable}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "8px 13px",
            border: "1px solid rgba(230,180,120,.24)",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 12,
            color: "#d8c9b2",
            background: "transparent",
          }}
        >
          {"↻ Reroll scene"}
        </button>
      </div>

      {/* narration script (editable) */}
      <div>
        <div style={LABEL}>{"NARRATION · SCRIPT"}</div>
        <textarea
          data-testid="script-input"
          aria-label="Narration script"
          value={scene.script}
          onChange={(e) =>
            dispatch({ type: "EDIT_SCRIPT", script: e.target.value })
          }
          rows={2}
          style={{
            width: "100%",
            resize: "none",
            fontFamily: "var(--font-zilla), 'Zilla Slab', Georgia, serif",
            fontWeight: 400,
            fontStyle: "italic",
            fontSize: 20,
            lineHeight: 1.38,
            color: "#f1e7d6",
            background: "transparent",
            border: "none",
            borderLeft: "3px solid #c6552b",
            padding: "0 0 0 15px",
            outline: "none",
          }}
        />
      </div>

      {/* narrator voice (whole-video) */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
          <div
            style={{
              fontFamily:
                "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: ".2em",
              color: "#e6a43b",
            }}
          >
            {"NARRATOR VOICE"}
          </div>
          <div
            style={{
              fontFamily:
                "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
              fontWeight: 600,
              fontSize: 9,
              letterSpacing: ".1em",
              color: "#7a6650",
              border: "1px solid rgba(230,180,120,.2)",
              borderRadius: 20,
              padding: "2px 8px",
            }}
          >
            {"→ AI VOICE"}
          </div>
          <div style={{ flex: 1 }} />
          <div
            style={{
              fontFamily:
                "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
              fontWeight: 600,
              fontSize: 9,
              letterSpacing: ".12em",
              color: "#6f5c46",
            }}
          >
            {"APPLIES TO WHOLE VIDEO"}
          </div>
        </div>
        <div style={{ ...DASHED_BOX, padding: "12px 14px" }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 13,
              lineHeight: 1.5,
              color: "#e8dcc6",
            }}
          >
            {storyboard.voiceDescription}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              marginTop: 11,
              paddingTop: 11,
              borderTop: "1px solid rgba(230,180,120,.14)",
            }}
          >
            <button
              type="button"
              onClick={() => {}}
              aria-label="Preview voice"
              className={styles.hoverable}
              style={{
                width: 30,
                height: 30,
                flex: "none",
                borderRadius: "50%",
                background: "linear-gradient(180deg,#e07a3e,#c6552b)",
                border: "1px solid #e69a5a",
                boxShadow: "inset 0 1px 0 rgba(255,225,190,.5)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontSize: 11,
                paddingLeft: 2,
              }}
            >
              {"▶"}
            </button>
            <div
              aria-hidden
              style={{
                flex: 1,
                height: 20,
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              {BARS.map((h, i) => (
                <span
                  key={i}
                  style={{
                    width: 3,
                    height: `${h}%`,
                    background: i < 7 ? "#f0b45a" : "#a9773a",
                    opacity: i < 7 ? 1 : 0.6,
                    borderRadius: 1,
                  }}
                />
              ))}
            </div>
            <span style={{ fontFamily: MONO, fontSize: 10, color: "#a99b85" }}>
              {"0:09"}
            </span>
            <button
              type="button"
              onClick={() => {}}
              className={styles.hoverable}
              style={{
                fontFamily:
                  "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
                fontWeight: 600,
                fontSize: 10,
                color: "#d8c9b2",
                border: "1px solid rgba(230,180,120,.24)",
                borderRadius: 7,
                padding: "4px 9px",
                background: "transparent",
              }}
            >
              {"↻ New take"}
            </button>
          </div>
        </div>
      </div>

      {/* visual prompt (editable) */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
          <div
            style={{
              fontFamily:
                "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: ".2em",
              color: "#e6a43b",
            }}
          >
            {"VISUAL PROMPT"}
          </div>
          <div
            style={{
              fontFamily:
                "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
              fontWeight: 600,
              fontSize: 9,
              letterSpacing: ".1em",
              color: "#7a6650",
              border: "1px solid rgba(230,180,120,.2)",
              borderRadius: 20,
              padding: "2px 8px",
            }}
          >
            {"→ SENT TO AI"}
          </div>
        </div>
        <div style={{ ...DASHED_BOX, position: "relative", padding: "14px 16px" }}>
          <textarea
            data-testid="visual-input"
            aria-label="Visual prompt"
            value={scene.visualPrompt}
            onChange={(e) =>
              dispatch({ type: "EDIT_VISUAL_PROMPT", prompt: e.target.value })
            }
            rows={3}
            style={{
              width: "100%",
              resize: "none",
              fontFamily: MONO,
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "#e8dcc6",
              background: "transparent",
              border: "none",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* row: on-screen text · music · reference */}
      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={LABEL}>{"ON-SCREEN TEXT"}</div>
          <div
            style={{
              height: 66,
              border: "1px solid rgba(230,180,120,.18)",
              borderRadius: 10,
              background: "#0f0b07",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 7,
              padding: "0 10px",
            }}
          >
            <div
              role="group"
              aria-label="On-screen text mode"
              style={{
                display: "flex",
                background: "#16110d",
                border: "1px solid rgba(230,180,120,.12)",
                borderRadius: 8,
                padding: 3,
                gap: 3,
              }}
            >
              <button
                type="button"
                data-testid="onscreen-show"
                aria-pressed={showText}
                onClick={() =>
                  dispatch({ type: "SET_ON_SCREEN_TEXT", value: "text" })
                }
                className={styles.hoverable}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "5px 4px",
                  borderRadius: 6,
                  border: "none",
                  fontFamily:
                    "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
                  fontWeight: 600,
                  fontSize: 11,
                  color: showText ? "#fff" : "#7a6650",
                  background: showText
                    ? "linear-gradient(180deg,#d0632e,#b0481f)"
                    : "transparent",
                }}
              >
                {"Show text"}
              </button>
              <button
                type="button"
                data-testid="onscreen-voice"
                aria-pressed={!showText}
                onClick={() =>
                  dispatch({ type: "SET_ON_SCREEN_TEXT", value: "voice-only" })
                }
                className={styles.hoverable}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "5px 4px",
                  borderRadius: 6,
                  border: "none",
                  fontFamily:
                    "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
                  fontWeight: 600,
                  fontSize: 11,
                  color: !showText ? "#fff" : "#7a6650",
                  background: !showText
                    ? "linear-gradient(180deg,#d0632e,#b0481f)"
                    : "transparent",
                }}
              >
                {"Voice only"}
              </button>
            </div>
            <div
              style={{
                fontFamily:
                  "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
                fontWeight: 500,
                fontSize: 9,
                letterSpacing: ".08em",
                color: "#6f5c46",
                textAlign: "center",
              }}
            >
              {"LOWER THIRD · ZILLA SLAB"}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={LABEL}>{"MUSIC · MOOD"}</div>
          <button
            type="button"
            onClick={cycleMood}
            aria-label="Music mood"
            className={styles.hoverable}
            style={{
              width: "100%",
              height: 66,
              border: "1px solid rgba(230,180,120,.18)",
              borderRadius: 10,
              background: "#0f0b07",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 15px",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#d0632e" }}>{"🎵"}</span>
              <span style={{ fontWeight: 600, fontSize: 13, color: "#e8dcc6" }}>
                {storyboard.musicMood}
              </span>
            </span>
            <span style={{ color: "#7a6650" }}>{"▾"}</span>
          </button>
        </div>

        <div style={{ flex: 1 }}>
          <div style={LABEL}>{"REFERENCE"}</div>
          <button
            type="button"
            onClick={() => {}}
            aria-label="Drop reference image"
            className={styles.hoverable}
            style={{
              width: "100%",
              height: 66,
              border: "1.5px dashed rgba(230,180,120,.3)",
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              color: "#7a6650",
              fontSize: 12,
              fontWeight: 500,
              background: "transparent",
            }}
          >
            {"＋ Drop image"}
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingTop: 4,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-zilla), 'Zilla Slab', Georgia, serif",
            fontStyle: "italic",
            fontSize: 13,
            color: "#7a6650",
          }}
        >
          {"The plan, not the render — voice, music & captions all set before you spend a generation."}
        </span>
      </div>
    </div>
  );
}
