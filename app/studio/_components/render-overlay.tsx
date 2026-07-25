"use client";

import styles from "../studio.module.css";
import { useStudio } from "./studio-context";
import StudioLog from "./studio-log";
import {
  renderPercent,
  renderSpecLine,
  renderSpecLineFromSpec,
  renderProgressLabel,
  renderFrameCountLabel,
  renderStageRows,
  renderEtaSeconds,
  mockSecondsRemaining,
  isRenderIndeterminate,
  isRenderComplete,
  isRenderFailed,
  type RenderState,
} from "@/lib/studio/render-model";
import { visibleCaption } from "@/lib/studio/captions";

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const MONO = "ui-monospace, Menlo, monospace";
const ANTON = "var(--font-anton), sans-serif";
const ZILLA = "var(--font-zilla), 'Zilla Slab', Georgia, serif";

// D-SKIN (shipped): warm card, parchment ink, rust accent.
const CARD = "#1b140d";
const INK = "#f1e7d6";
const DIM = "#a99b85";
const RUST = "#c6552b";
const HAIRLINE = "1px solid rgba(230,180,120,.18)";
const BAR_TRACK = "rgba(230,180,120,.14)";
const BAR_FILL = "linear-gradient(90deg,#d4a24c,#c0392b 60%,#6d3b26)";
const GRADIENT_CTA = "linear-gradient(150deg,#d4a24c,#c0392b 55%,#6d3b26)";

/** The "~Ns remaining" tail, or "" when there is nothing honest to say. MOCK extrapolates
 *  from the fake tick rate; REAL extrapolates from the observed encode rate and stays
 *  blank until there is one (a fabricated countdown is worse than no countdown). */
function etaSuffix(render: RenderState): string {
  const seconds =
    render.mode === "mock"
      ? mockSecondsRemaining(render)
      : renderEtaSeconds(render, Date.now());
  return seconds === null ? "" : ` · ~${seconds}s remaining`;
}

/**
 * 14c — the warm, full-frame render overlay (D-SKIN). Composited INTO the studio canvas.
 *
 * Task #38 swapped the DATA SOURCE, not the design: a real render's frames, status and
 * output spec are polled from `GET /api/renders/:id` by a driver in StudioProvider (so a
 * backgrounded render keeps polling with no visible surface); demo-catalog projects keep
 * the fake ticker in StudioFrame. Everything below is presentational.
 *
 * Three faces:
 *   - IN FLIGHT — the designed 14c card. Dismissal is only the two footer buttons; no ✕,
 *     no Escape, no backdrop dismiss (D-RENDER-DISMISS).
 *   - COMPLETE  — UNDESIGNED in the wireframes (Turn 14's "Try next" names it). Built on
 *     14a step-3's published-card bones (gradient top rule, Anton headline, Zilla body,
 *     2-up outline+gradient button row) with one deliberate substitution: no green-check
 *     medallion. The progress bar the user watched for two minutes stays on screen frozen
 *     at 100% with its final frame count — the receipt is the work itself, and the four
 *     ✓ checklist rows right below already carry the success signal.
 *   - FAILED    — same bones, rust rule, the honest server error, and the checklist with
 *     the stage it died in marked ✕ so the user can see WHERE it broke.
 */
export default function RenderOverlay() {
  const { state, project, backgroundRender, cancelRender, closeRender, startRender } =
    useStudio();
  const render = state.render;
  if (!render) return null;

  const complete = isRenderComplete(render);
  const failed = isRenderFailed(render);

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
        data-mode={render.mode}
        data-status={render.status ?? "mock"}
        data-render-job-id={render.renderJobId ?? ""}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 61,
          width: 560,
          background: CARD,
          color: INK,
          borderRadius: 18,
          border: HAIRLINE,
          boxShadow: "0 40px 90px rgba(0,0,0,.6)",
          overflow: "hidden",
          fontFamily: "var(--font-barlow), sans-serif",
        }}
      >
        {complete || failed ? (
          <TerminalCard
            render={render}
            failed={failed}
            projectName={project.projectName}
            onClose={closeRender}
            onRetry={startRender}
          />
        ) : (
          <InFlightCard render={render} projectName={project.projectName} />
        )}

        {complete || failed ? null : (
          /* footer — the ONLY dismissal while in flight (D-RENDER-DISMISS) */
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
            <span style={{ fontSize: 12, color: DIM }}>
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
                color: DIM,
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
                color: INK,
                border: "1px solid rgba(230,180,120,.24)",
                background: "#0f0b07",
              }}
            >
              {"Run in background"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** The designed 14c body: mini preview · eyebrow · title · spec · progress · checklist. */
function InFlightCard({
  render,
  projectName,
}: {
  render: RenderState;
  projectName: string;
}) {
  const { state } = useStudio();
  const scene =
    state.storyboard.scenes.find((s) => s.id === state.selectedSceneId) ??
    state.storyboard.scenes[0];
  const caption = scene ? (visibleCaption(scene) ?? scene.script) : "";
  const pct = renderPercent(render);
  const indeterminate = isRenderIndeterminate(render);

  return (
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
          border: HAIRLINE,
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
            color: RUST,
          }}
        >
          {`RENDERING · ${render.publishedVersion}`}
        </div>
        <div
          data-testid="render-title"
          style={{ fontFamily: ANTON, fontSize: 30, lineHeight: 1.02, marginTop: 8 }}
        >
          {projectName.toUpperCase()}
        </div>
        <div data-testid="render-spec" style={{ fontSize: 13, color: DIM, marginTop: 4 }}>
          <SpecLine render={render} />
        </div>

        {/* progress */}
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              marginBottom: 6,
            }}
          >
            <span data-testid="render-progress-label" style={{ fontWeight: 700 }}>
              {renderProgressLabel(render)}
            </span>
            <span data-testid="render-frame-count" style={{ fontFamily: MONO, color: DIM }}>
              {renderFrameCountLabel(render)}
            </span>
          </div>
          <ProgressBar pct={pct} indeterminate={indeterminate} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11.5,
              color: DIM,
              marginTop: 6,
            }}
          >
            <span data-testid="render-percent">
              {indeterminate ? "Preparing" : `${pct}%${etaSuffix(render)}`}
            </span>
            <span>{"on Railway worker"}</span>
          </div>
        </div>

        {/* stages */}
        <div style={{ marginTop: 16 }}>
          <StageList render={render} />
        </div>
      </div>
    </div>
  );
}

/**
 * The terminal card. Shares 14a step-3's geometry — a 6px gradient rule, a centred Anton
 * headline, a Zilla body line, and a 2-up outline+gradient button row — so a finished
 * render reads as a sibling of a finished publish.
 */
function TerminalCard({
  render,
  failed,
  projectName,
  onClose,
  onRetry,
}: {
  render: RenderState;
  failed: boolean;
  projectName: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  const canceled = render.status === "canceled";
  return (
    <div data-testid={failed ? "render-failed" : "render-complete"}>
      <div
        aria-hidden
        style={{
          height: 6,
          background: failed
            ? "linear-gradient(90deg,#c0392b,#6d3b26)"
            : "linear-gradient(90deg,#d4a24c,#c0392b)",
        }}
      />
      <div style={{ padding: "30px 28px 26px" }}>
        <div
          data-testid="render-eyebrow"
          style={{
            fontFamily: SEMI,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: ".2em",
            color: RUST,
            textAlign: "center",
          }}
        >
          {`${projectName.toUpperCase()} · ${render.publishedVersion}`}
        </div>
        <div
          data-testid="render-title"
          style={{
            fontFamily: ANTON,
            fontSize: 30,
            lineHeight: 1.02,
            marginTop: 10,
            textAlign: "center",
          }}
        >
          {failed
            ? canceled
              ? "RENDER CANCELED."
              : "RENDER FAILED."
            : "RENDER COMPLETE."}
        </div>

        {failed ? (
          <div
            data-testid="render-error"
            style={{
              fontFamily: ZILLA,
              fontSize: 14,
              lineHeight: 1.5,
              color: DIM,
              marginTop: 10,
              textAlign: "center",
              maxWidth: 400,
              marginLeft: "auto",
              marginRight: "auto",
              wordBreak: "break-word",
            }}
          >
            {canceled
              ? "You stopped this render. Nothing was published — start another whenever you're ready."
              : (render.error ??
                "The render stopped before it finished. Your project is unchanged.")}
          </div>
        ) : (
          <div
            style={{
              fontFamily: ZILLA,
              fontSize: 14,
              lineHeight: 1.5,
              color: DIM,
              marginTop: 10,
              textAlign: "center",
            }}
          >
            {"Your video is ready to download."}
          </div>
        )}

        {/* The receipt: the same bar, frozen where it landed. No success medallion —
            the four ✓ rows below already carry that signal. */}
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              marginBottom: 6,
            }}
          >
            <span data-testid="render-progress-label" style={{ fontWeight: 700 }}>
              <SpecLine render={render} />
            </span>
            <span data-testid="render-frame-count" style={{ fontFamily: MONO, color: DIM }}>
              {renderFrameCountLabel(render)}
            </span>
          </div>
          <ProgressBar pct={renderPercent(render)} indeterminate={false} />
        </div>

        <div style={{ marginTop: 16 }}>
          <StageList render={render} />
        </div>

        {/* 2-up row — 14a step-3 geometry: outline secondary, gradient primary */}
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button
            type="button"
            data-testid="render-done"
            onClick={onClose}
            className={styles.hoverable}
            style={{
              flex: 1,
              padding: 12,
              border: "1px solid rgba(230,180,120,.24)",
              borderRadius: 11,
              fontWeight: 700,
              fontSize: 14,
              color: INK,
              background: "transparent",
            }}
          >
            {"Back to studio"}
          </button>
          {failed ? (
            <button
              type="button"
              data-testid="render-retry"
              onClick={() => {
                onClose();
                onRetry();
              }}
              className={styles.hoverable}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 11,
                border: "none",
                background: GRADIENT_CTA,
                boxShadow: "0 6px 16px rgba(192,57,43,.3)",
                fontWeight: 700,
                fontSize: 14,
                color: "#fff",
              }}
            >
              {"Try again ▸"}
            </button>
          ) : (
            <a
              data-testid="render-download"
              data-ready={render.downloadUrl ? "1" : "0"}
              href={render.downloadUrl ?? undefined}
              download
              className={styles.hoverable}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 11,
                background: GRADIENT_CTA,
                boxShadow: "0 6px 16px rgba(192,57,43,.3)",
                fontWeight: 700,
                fontSize: 14,
                color: "#fff",
                textAlign: "center",
                textDecoration: "none",
                opacity: render.downloadUrl ? 1 : 0.55,
                pointerEvents: render.downloadUrl ? "auto" : "none",
              }}
            >
              {render.downloadUrl ? "Download video ↓" : "Preparing link…"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** `1080×1920 · 9:16 · 30fps · H.264` — from the SERVER's echoed spec for a real render,
 *  derived from the local aspect toggle for the mocked one. */
function SpecLine({ render }: { render: RenderState }) {
  const { state } = useStudio();
  const line =
    render.outputSpec !== null
      ? renderSpecLineFromSpec(render.outputSpec)
      : renderSpecLine(state.aspect, state.storyboard.fps);
  return <>{line}</>;
}

/** The 4-stage checklist. MOCK drives it off the frame ticker's `LogSequence`; REAL maps
 *  the polled status onto the same rows (and can mark one `failed`, which `seq` mode
 *  cannot express). */
function StageList({ render }: { render: RenderState }) {
  if (render.mode === "real" && render.status !== null) {
    return (
      <StudioLog
        rows={renderStageRows(render.status, render.lastPhase ?? undefined)}
        rowTestId="render-stage"
      />
    );
  }
  return <StudioLog seq={render.stages} rowTestId="render-stage" />;
}

/** The shared progress bar. An indeterminate render (framesTotal still 0) shows a
 *  slim travelling sliver rather than a 0% empty track, so "nothing yet" still reads as
 *  "working". */
function ProgressBar({
  pct,
  indeterminate,
}: {
  pct: number;
  indeterminate: boolean;
}) {
  return (
    <div
      style={{
        height: 9,
        borderRadius: 5,
        background: BAR_TRACK,
        overflow: "hidden",
      }}
    >
      <div
        data-testid="render-bar-fill"
        data-indeterminate={indeterminate ? "1" : "0"}
        className={indeterminate ? styles.renderBarPending : undefined}
        style={{
          width: indeterminate ? "28%" : `${pct}%`,
          height: "100%",
          background: BAR_FILL,
        }}
      />
    </div>
  );
}
