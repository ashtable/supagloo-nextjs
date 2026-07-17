"use client";

import styles from "../studio.module.css";
import { useStudio } from "./studio-context";

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const MONO = "ui-monospace, Menlo, monospace";
const ZILLA = "var(--font-zilla), 'Zilla Slab', Georgia, serif";

const LABEL: React.CSSProperties = {
  fontFamily: SEMI,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: ".16em",
  color: "#a99b85",
  marginBottom: 7,
};
const GOLD_LABEL: React.CSSProperties = { ...LABEL, color: "#e6a43b" };
const STAT_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "11px 13px",
  border: "1px solid rgba(230,180,120,.12)",
  borderRadius: 10,
  background: "#0f0b07",
};

/**
 * §7 (D-INSPECTOR-KEEP-EDIT) — the 13b scene inspector: a resting-state visual
 * over the SAME edit seams. Restyled to 13b (300px, simple header, blockquote
 * script, dashed visual box, single captions switch, derived duration) while
 * KEEPING the live `script-input` / `visual-input` / captions edit seams that
 * the whole dirty/Commit/Publish machinery (and E8/E-SP2/E-VER2) depend on. The
 * purely-decorative 5a extras (voice-preview row, music-mood cycler, image
 * dropzone, footer tagline, two-way onscreen pill, the big Anton number, the
 * scene range, the redundant header reroll) are dropped; 13b's `↻ Reroll visual`
 * (inert) and `scene-duration` are added.
 */
export default function SceneInspector() {
  const { state, dispatch } = useStudio();
  const { storyboard, selectedSceneId } = state;
  const scene =
    storyboard.scenes.find((s) => s.id === selectedSceneId) ??
    storyboard.scenes[0];
  const showCaptions = scene.onScreenText === "text";

  return (
    <div
      data-testid="scene-inspector"
      style={{
        width: 300,
        flex: "none",
        minHeight: 0,
        overflow: "auto",
        borderLeft: "1px solid rgba(230,180,120,.12)",
        background:
          "linear-gradient(180deg,rgba(34,26,18,.55),rgba(22,17,13,.35))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* header — SCENE NN · INSPECTOR (keeps the scene-number seam) */}
      <div
        style={{
          height: 40,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 16px",
          fontFamily: SEMI,
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: ".18em",
          color: "#a99b85",
          borderBottom: "1px solid rgba(230,180,120,.12)",
        }}
      >
        {"SCENE "}
        <span data-testid="scene-number">
          {String(scene.index).padStart(2, "0")}
        </span>
        {" · INSPECTOR"}
      </div>

      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* SCRIPT — editable blockquote (the primary dirty seam) */}
        <div>
          <div style={LABEL}>{"SCRIPT"}</div>
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
              fontFamily: ZILLA,
              fontWeight: 400,
              fontStyle: "italic",
              fontSize: 16,
              lineHeight: 1.4,
              color: "#f1e7d6",
              background: "transparent",
              border: "none",
              borderLeft: "3px solid #c6552b",
              padding: "0 0 0 12px",
              outline: "none",
            }}
          />
        </div>

        {/* VISUAL PROMPT — editable dashed box + inert Reroll visual */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
            <span style={GOLD_LABEL}>{"VISUAL PROMPT"}</span>
            <span
              style={{
                fontSize: 9,
                color: "#a99b85",
                border: "1px solid rgba(230,180,120,.18)",
                borderRadius: 20,
                padding: "2px 7px",
              }}
            >
              {"→ AI"}
            </span>
          </div>
          <div
            style={{
              border: "1.5px dashed rgba(230,164,59,.5)",
              background: "rgba(230,164,59,.06)",
              borderRadius: 10,
              padding: "11px 12px",
            }}
          >
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
                fontSize: 12,
                lineHeight: 1.5,
                color: "#e8dcc6",
                background: "transparent",
                border: "none",
                outline: "none",
              }}
            />
          </div>
          <button
            type="button"
            data-testid="reroll-visual"
            onClick={() => {}}
            className={styles.hoverable}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 9,
              padding: "7px 12px",
              border: "1px solid rgba(230,180,120,.24)",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 12,
              color: "#f1e7d6",
              background: "transparent",
            }}
          >
            {"↻ Reroll visual"}
          </button>
        </div>

        {/* NARRATOR VOICE · whole video — static box (voice preview removed) */}
        <div>
          <div style={{ marginBottom: 7 }}>
            <span style={GOLD_LABEL}>{"NARRATOR VOICE"}</span>
            <span style={{ fontFamily: SEMI, fontWeight: 600, fontSize: 10, color: "#a99b85" }}>
              {" · whole video"}
            </span>
          </div>
          <div
            style={{
              border: "1px solid rgba(230,180,120,.18)",
              borderRadius: 10,
              background: "#0f0b07",
              padding: "11px 12px",
              fontFamily: MONO,
              fontSize: 11.5,
              lineHeight: 1.5,
              color: "#a99b85",
            }}
          >
            {storyboard.voiceDescription}
          </div>
        </div>

        {/* On-screen captions — single switch (SET_ON_SCREEN_TEXT) */}
        <div style={STAT_ROW}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#f1e7d6" }}>
              {"On-screen captions"}
            </div>
            <div style={{ fontSize: 11, color: "#a99b85" }}>{"Show verse text"}</div>
          </div>
          <button
            type="button"
            data-testid="captions-switch"
            role="switch"
            aria-checked={showCaptions}
            aria-label="On-screen captions"
            data-on={showCaptions ? "true" : "false"}
            onClick={() =>
              dispatch({
                type: "SET_ON_SCREEN_TEXT",
                value: showCaptions ? "voice-only" : "text",
              })
            }
            className={styles.hoverable}
            style={{
              width: 38,
              height: 22,
              flex: "none",
              borderRadius: 20,
              border: "none",
              padding: 0,
              position: "relative",
              background: showCaptions ? "#c6552b" : "rgba(230,180,120,.22)",
            }}
          >
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: 2,
                left: showCaptions ? 18 : 2,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 120ms ease",
              }}
            />
          </button>
        </div>

        {/* Duration — derived, read-only */}
        <div style={STAT_ROW}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#f1e7d6" }}>
              {"Duration"}
            </div>
            <div style={{ fontSize: 11, color: "#a99b85" }}>{"Scene length"}</div>
          </div>
          <span
            data-testid="scene-duration"
            style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, color: "#f1e7d6" }}
          >
            {`${scene.durationSeconds.toFixed(1)}s`}
          </span>
        </div>
      </div>
    </div>
  );
}
