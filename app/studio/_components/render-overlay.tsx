"use client";

import styles from "../studio.module.css";
import { useStudio } from "./studio-context";
import StudioLog from "./studio-log";
import {
  renderPercent,
  renderSpecLine,
  type RenderState,
} from "@/lib/studio/render-model";
import { RENDER_FRAMES_PER_TICK, RENDER_TICK_MS } from "@/lib/studio/render-model";
import { visibleCaption } from "@/lib/studio/captions";

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const MONO = "ui-monospace, Menlo, monospace";
const ANTON = "var(--font-anton), sans-serif";
const ZILLA = "var(--font-zilla), 'Zilla Slab', Georgia, serif";

/** Rough "~Ns remaining" estimate from the frames left and the mocked tick rate. */
function secondsRemaining(render: RenderState): number {
  const left = Math.max(0, render.totalFrames - render.framesDone);
  const ticks = left / RENDER_FRAMES_PER_TICK;
  return Math.ceil((ticks * RENDER_TICK_MS) / 1000);
}

/**
 * 14c — the warm, full-frame render-progress overlay (D-SKIN). Composited INTO
 * the studio canvas. Numbers are DERIVED (frame total from the composition, spec
 * from the aspect, published tag from the flow, caption from the selected scene).
 * The advance ticker lives in StudioFrame (so a backgrounded render keeps
 * climbing with no visible surface); this is presentational. Dismissal is only
 * the two footer buttons — no ✕, no Escape, no backdrop dismiss (D-RENDER-DISMISS).
 */
export default function RenderOverlay() {
  const { state, project, backgroundRender, cancelRender } = useStudio();
  const render = state.render;
  if (!render) return null;

  const scene =
    state.storyboard.scenes.find((s) => s.id === state.selectedSceneId) ??
    state.storyboard.scenes[0];
  const caption = visibleCaption(scene) ?? scene.script;
  const pct = renderPercent(render);

  return (
    <>
      <div
        data-testid="render-dimmer"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 60,
          background: "rgba(6,4,2,.7)",
          backdropFilter: "blur(2px)",
        }}
      />
      <div
        data-testid="render-overlay"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 61,
          width: 560,
          background: "#1b140d",
          color: "#f1e7d6",
          borderRadius: 18,
          border: "1px solid rgba(230,180,120,.18)",
          boxShadow: "0 40px 90px rgba(0,0,0,.6)",
          overflow: "hidden",
          fontFamily: "var(--font-barlow), sans-serif",
        }}
      >
        <div style={{ display: "flex", gap: 22, padding: "26px 28px" }}>
          {/* mini preview — derived caption from the selected scene */}
          <div
            style={{
              width: 120,
              height: 213,
              flex: "none",
              borderRadius: 10,
              overflow: "hidden",
              position: "relative",
              border: "1px solid rgba(230,180,120,.18)",
              background:
                "radial-gradient(circle at 46% 40%,#5a3a2e,#3a2a1e 45%,#160f0a 92%)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 8,
                right: 8,
                bottom: 20,
                textAlign: "center",
                fontFamily: ZILLA,
                fontSize: 11,
                color: "#fff",
                lineHeight: 1.3,
              }}
            >
              {caption}
            </div>
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                color: "rgba(255,240,220,.8)",
                fontSize: 22,
              }}
            >
              {"◔"}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              data-testid="render-eyebrow"
              style={{
                fontFamily: SEMI,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: ".2em",
                color: "#c6552b",
              }}
            >
              {`RENDERING · ${render.publishedVersion}`}
            </div>
            <div
              data-testid="render-title"
              style={{ fontFamily: ANTON, fontSize: 30, lineHeight: 1.02, marginTop: 8 }}
            >
              {project.projectName.toUpperCase()}
            </div>
            <div data-testid="render-spec" style={{ fontSize: 13, color: "#a99b85", marginTop: 4 }}>
              {renderSpecLine(state.aspect, state.storyboard.fps)}
            </div>

            {/* progress */}
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <span data-testid="render-progress-label" style={{ fontWeight: 700 }}>
                  {"Encoding frames"}
                </span>
                <span data-testid="render-frame-count" style={{ fontFamily: MONO, color: "#a99b85" }}>
                  {`${render.framesDone} / ${render.totalFrames}`}
                </span>
              </div>
              <div
                style={{
                  height: 9,
                  borderRadius: 5,
                  background: "rgba(230,180,120,.14)",
                  overflow: "hidden",
                }}
              >
                <div
                  data-testid="render-bar-fill"
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: "linear-gradient(90deg,#d4a24c,#c0392b 60%,#6d3b26)",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#a99b85", marginTop: 6 }}>
                <span data-testid="render-percent">
                  {`${pct}% · ~${secondsRemaining(render)}s remaining`}
                </span>
                <span>{"on Railway worker"}</span>
              </div>
            </div>

            {/* stages */}
            <div style={{ marginTop: 16 }}>
              <StudioLog seq={render.stages} rowTestId="render-stage" />
            </div>
          </div>
        </div>

        {/* footer — the ONLY dismissal (D-RENDER-DISMISS) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 28px",
            borderTop: "1px solid rgba(230,180,120,.12)",
            background: "#160f0a",
          }}
        >
          <span style={{ fontSize: 12, color: "#a99b85" }}>
            {"You can keep editing — we'll notify you when it's ready."}
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            data-testid="render-cancel"
            onClick={cancelRender}
            className={styles.hoverable}
            style={{
              padding: "9px 16px",
              border: "1px solid rgba(230,180,120,.24)",
              borderRadius: 9,
              fontWeight: 700,
              fontSize: 13,
              color: "#a99b85",
              background: "transparent",
            }}
          >
            {"Cancel render"}
          </button>
          <button
            type="button"
            data-testid="render-background"
            onClick={backgroundRender}
            className={styles.hoverable}
            style={{
              padding: "9px 16px",
              borderRadius: 9,
              fontWeight: 700,
              fontSize: 13,
              color: "#f1e7d6",
              border: "1px solid rgba(230,180,120,.24)",
              background: "#0f0b07",
            }}
          >
            {"Run in background"}
          </button>
        </div>
      </div>
    </>
  );
}
