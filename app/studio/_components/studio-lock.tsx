"use client";

import styles from "../studio.module.css";
import { useStudio } from "./studio-context";
import { activeGeneration, type ActiveGeneration } from "@/lib/studio/reducer";
import { resolveChoice, type SelectableKind } from "@/lib/studio/ai-settings";
import {
  VIDEO_ADVISORY,
  formatAdvisoryDuration,
} from "@/lib/studio/video-advisory";

/**
 * Figure 20a — the studio-wide busy state.
 *
 * ## What it replaces
 *
 * Three unrelated mechanisms: per-button label swaps at `opacity:.6`, a Player scrim
 * gated on `isPreviewGenerating` (which covers only the selected scene's image and a
 * storyboard re-plan), and — for the other four kinds — nothing at all. A narration or
 * music generation produced no blocking signal anywhere, so the editor stayed fully live
 * while a result was in flight toward it.
 *
 * ## It reverses a documented decision, deliberately
 *
 * `studio-app.tsx` records *"There is NO blocking overlay"* because popover dismissal
 * depends on pointerdown reaching other triggers, which a scrim swallows. That reversal is
 * reconciled in the REDUCER rather than here: `GENERATION_BEGIN` closes the menus, so the
 * lock never has to fight a popover it has covered.
 *
 * ## Hydration
 *
 * This mounts only while a generation is running, and a generation can only start from a
 * post-hydration click — so its testid is structurally never SSR'd and cannot re-open the
 * row-68 hydration-gate flake (`current-design.md`: wait on a mount-gated testid, never on
 * an SSR'd one).
 *
 * ## Not built
 *
 * NO DESIGN EXISTS for the post-cancel state, a cancel-failed state, a generation-failed
 * state, or a queued/multiple-generations state. Cancel-refused gets one invented line
 * (recorded); the rest are left to the existing per-slot error affordances. 20a's
 * "rotating status line" implies a phrase set that is specified nowhere — the scene's own
 * `scriptText` half IS backed, so that is the half that ships.
 */

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const ANTON = "var(--font-anton), Anton, sans-serif";
const ZILLA = "var(--font-zilla), 'Zilla Slab', Georgia, serif";

const KIND_LABEL: Record<ActiveGeneration["kind"], string> = {
  image: "Scene image",
  video: "Scene video",
  narration: "Narration",
  music: "Music bed",
  script: "Script",
  storyboard: "Storyboard",
};

const KIND_HEADLINE: Record<ActiveGeneration["kind"], string> = {
  image: "RENDERING SCENE",
  video: "RENDERING SCENE",
  narration: "RECORDING NARRATION",
  music: "COMPOSING MUSIC",
  script: "REWRITING SCRIPT",
  storyboard: "PLANNING SCENES",
};

/** The kinds that read a model choice; `script`/`storyboard` have no selector. */
const SELECTABLE: Partial<Record<ActiveGeneration["kind"], SelectableKind>> = {
  image: "image",
  video: "video",
  narration: "narration",
  music: "music",
};

/**
 * 20a hardcodes `"Usually 10–20s."`, which no telemetry supports and which is wrong for
 * video by an order of magnitude (20b itself says minutes). Derived per kind instead: the
 * video figure is the ONE measurement that exists, and the rest say "seconds" without
 * inventing a range.
 */
function durationHint(kind: ActiveGeneration["kind"]): string {
  if (kind === "video") {
    return `Usually ${formatAdvisoryDuration(VIDEO_ADVISORY.secondsPerScene)}.`;
  }
  return "Usually a few seconds.";
}

export default function StudioLock() {
  const { state, project, cancelGeneration } = useStudio();
  const active = activeGeneration(state);
  if (!active) return null;

  const scene = active.sceneId
    ? state.storyboard.scenes.find((s) => s.id === active.sceneId)
    : undefined;
  const selectable = SELECTABLE[active.kind];
  const choice = selectable
    ? resolveChoice(
        selectable,
        state.storyboard.aiSettings,
        state.modelCatalogue?.defaults ?? {},
        state.modelCatalogue?.models ?? [],
      )
    : null;
  const modelLabel =
    choice?.model
      ? state.modelCatalogue?.models.find((m) => m.id === choice.model)?.label ??
        choice.model
      : null;
  const refused = state.generations[active.slot]?.cancelRefused === true;

  const headline = scene
    ? `${KIND_HEADLINE[active.kind]} ${String(scene.index).padStart(2, "0")}`
    : KIND_HEADLINE[active.kind];

  return (
    <div
      data-testid="studio-lock"
      data-generation-kind={active.kind}
      data-generation-scene={active.sceneId ?? ""}
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 70,
        background: "rgba(10,7,5,.55)",
        backdropFilter: "blur(1.5px)",
        cursor: "not-allowed",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          width: 430,
          maxWidth: "calc(100% - 32px)",
          background: "#1b1410",
          border: "1px solid rgba(230,180,120,.18)",
          borderRadius: 16,
          boxShadow: "0 30px 80px rgba(0,0,0,.7)",
          overflow: "hidden",
          cursor: "default",
        }}
      >
        {/* Indeterminate, not a percentage: no generation here reports progress, and a
            fake bar that stalls at 90% is worse than an honest sweep. */}
        <div style={{ height: 4, background: "rgba(230,180,120,.1)" }}>
          <div
            className={styles.sweep}
            style={{
              width: "38%",
              height: "100%",
              background:
                "linear-gradient(90deg,transparent,var(--ws-amber),var(--ws-rust),transparent)",
            }}
          />
        </div>

        <div style={{ padding: "24px 26px", color: "#f1e7d6" }}>
          <div
            style={{
              fontFamily: SEMI,
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: ".2em",
              color: "var(--ws-amber)",
            }}
          >
            {"STUDIO LOCKED · GENERATING"}
          </div>
          <div
            data-testid="studio-lock-headline"
            style={{ fontFamily: ANTON, fontSize: 25, lineHeight: 1.05, marginTop: 6 }}
          >
            {headline}
          </div>
          {/* kind label · model title · provider label — all three are available
              client-side, and naming the model is what makes a two-minute wait explicable. */}
          <div
            data-testid="studio-lock-target"
            style={{ fontSize: 12.5, color: "var(--ws-dim)", marginTop: 4 }}
          >
            {[
              KIND_LABEL[active.kind],
              modelLabel,
              choice?.provider === "gloo" ? "Gloo AI" : choice ? "OpenRouter" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>

          {scene ? (
            <div
              style={{
                marginTop: 18,
                padding: "12px 14px",
                border: "1px solid rgba(230,180,120,.12)",
                borderRadius: 10,
                background: "#0f0b07",
                fontFamily: ZILLA,
                fontSize: 13.5,
                color: "#d8c9bd",
                lineHeight: 1.45,
              }}
            >
              {scene.script}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 16,
            }}
          >
            <span style={{ fontSize: 11.5, color: "var(--ws-dim-2)", flex: 1 }}>
              {refused
                ? // NO DESIGN EXISTS for a refused cancel; this line is an invention. The
                  // 409 is real and reachable, and the lock deliberately stays UP —
                  // handing the editor back seconds before a result lands is the race the
                  // lock exists to prevent.
                  "Too late to cancel — finishing up."
                : `Editing is paused so a generation can't be overwritten. ${durationHint(active.kind)}`}
            </span>
            <button
              type="button"
              data-testid="studio-lock-cancel"
              // Disabled in the window between the click and the POST returning: there is
              // no id to cancel yet. Disabled rather than hidden, so the control does not
              // appear and disappear under the pointer.
              disabled={!active.generationId || refused}
              onClick={cancelGeneration}
              className={styles.hoverable}
              style={{
                padding: "9px 15px",
                border: "1px solid rgba(230,180,120,.22)",
                borderRadius: 9,
                background: "transparent",
                fontWeight: 700,
                fontSize: 12.5,
                color: "#e0745a",
                opacity: !active.generationId || refused ? 0.5 : 1,
                cursor: !active.generationId || refused ? "default" : "pointer",
              }}
            >
              {"Cancel"}
            </button>
          </div>
          <span style={{ display: "none" }}>{project.projectName}</span>
        </div>
      </div>
    </div>
  );
}
