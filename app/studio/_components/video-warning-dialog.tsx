"use client";

import { useState } from "react";
import Modal from "@/app/_components/modal";
import styles from "../studio.module.css";
import {
  VIDEO_ADVISORY,
  advisoryForScenes,
  advisoryQualifier,
  formatAdvisoryDuration,
  formatAdvisoryUsd,
} from "@/lib/studio/video-advisory";
import type { CostEstimate } from "@/lib/studio/cost-estimate";

/**
 * Figure 20b — the confirmation that fires before any video generation.
 *
 * ## The one idea worth preserving
 *
 * **The button roles are inverted, and that IS the design.** The CHEAP path
 * (`Use a still image instead`) gets the gradient primary treatment; the expensive one
 * gets the outline. Everywhere else in this product the gradient marks the affirmative
 * action; here it marks the recommended one, because the affirmative action costs real
 * money in the user's own provider account and takes minutes. Do not "fix" this to match
 * the convention.
 *
 * The primary needs **no new endpoint**: `rerollVisual(sceneId)` already posts
 * `kind: "image"` for this scene with the resolved faith alignment, and Ken Burns is
 * applied at render time to any `visualAssetKind: "image"` — so the drawn copy
 * ("Still image + Ken Burns move") is accurate about what the button does.
 *
 * ## Numbers
 *
 * Every advisory figure carries `advisoryQualifier()` and comes from `video-advisory.ts`.
 * The still-image side is rendered through the HONEST cost module, which for the current
 * Gloo default answers `unpriced` — so this dialog can say "video is expensive" without
 * inventing a price for the alternative, and 20b's `"roughly 1/150th the cost"` is
 * omitted because there is no ratio when one side is unpriced.
 *
 * ## Chrome
 *
 * Goes through the shared `Modal` even though 20b draws no backdrop: the panel is capped
 * at the viewport with a scrolling body, and a ~700px card without that cap puts its
 * action row permanently off-screen at 375×667 — the exact defect the 16b publish dialog
 * already hit.
 */

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const ANTON = "var(--font-anton), Anton, sans-serif";
const ZILLA = "var(--font-zilla), 'Zilla Slab', Georgia, serif";

const TILE: React.CSSProperties = {
  flex: 1,
  padding: 14,
  borderRadius: 11,
  border: "1px solid rgba(230,180,120,.14)",
  background: "#1b1410",
};
const TILE_LABEL: React.CSSProperties = {
  fontFamily: SEMI,
  fontWeight: 700,
  fontSize: 9.5,
  letterSpacing: ".16em",
  color: "var(--ws-dim)",
};
const TILE_VALUE: React.CSSProperties = {
  fontFamily: ANTON,
  fontSize: 28,
  lineHeight: 1,
  marginTop: 7,
};
const TILE_SUB: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--ws-dim-2)",
  marginTop: 6,
};

export default function VideoWarningDialog({
  open,
  sceneLabel,
  sceneCount,
  stillEstimate,
  onClose,
  onUseStillImage,
  onGenerateVideo,
}: {
  open: boolean;
  /** e.g. `"Scene 02 · The Deep"` — 20b names the scene it is about to spend on. */
  sceneLabel: string;
  sceneCount: number;
  /** The HONEST estimate for the still-image alternative (`estimateGenerationCost`). */
  stillEstimate: CostEstimate;
  onClose: () => void;
  /** `"Don't warn me again"` state travels with the action the user took. */
  onUseStillImage: (dontWarnAgain: boolean) => void;
  onGenerateVideo: (dontWarnAgain: boolean) => void;
}) {
  const [dontWarnAgain, setDontWarnAgain] = useState(false);
  const all = advisoryForScenes(sceneCount);

  return (
    <Modal
      open={open}
      onClose={onClose}
      testId="video-warning-dialog"
      title="CONFIRM VIDEO GENERATION"
      width={520}
    >
      <div style={{ padding: "22px 24px 24px", color: "#f1e7d6" }}>
        {/* hero */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <span
            aria-hidden
            style={{
              width: 44,
              height: 44,
              flex: "none",
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              fontSize: 20,
              color: "var(--ws-amber)",
              background: "rgba(230,164,59,.16)",
              border: "1px solid rgba(230,164,59,.42)",
            }}
          >
            {"⚠"}
          </span>
          <div>
            <div style={{ fontFamily: ANTON, fontSize: 26, lineHeight: 1.06 }}>
              {"VIDEO IS SLOW AND EXPENSIVE"}
            </div>
            <div
              style={{
                fontFamily: ZILLA,
                fontSize: 14,
                lineHeight: 1.55,
                color: "#c2b0a4",
                marginTop: 8,
              }}
            >
              {"You're about to generate motion video for "}
              <b data-testid="video-warning-scene" style={{ color: "#f1e7d6" }}>
                {sceneLabel}
              </b>
              {
                ". Most creators get a better result faster with a still image and a slow camera move."
              }
            </div>
          </div>
        </div>

        {/* the two fact tiles */}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <div style={TILE}>
            <div style={TILE_LABEL}>{"TIME PER SCENE"}</div>
            <div data-testid="video-warning-time" style={TILE_VALUE}>
              {formatAdvisoryDuration(VIDEO_ADVISORY.secondsPerScene)}
            </div>
            <div style={TILE_SUB}>{"Studio is locked while it runs"}</div>
          </div>
          <div
            style={{
              ...TILE,
              border: "1px solid rgba(198,85,43,.4)",
              background: "rgba(198,85,43,.09)",
            }}
          >
            <div style={{ ...TILE_LABEL, color: "#e0a08c" }}>{"COST PER SCENE"}</div>
            <div
              data-testid="video-warning-cost"
              style={{ ...TILE_VALUE, color: "#f0a08a" }}
            >
              {formatAdvisoryUsd(VIDEO_ADVISORY.costPerSceneUsd)}
            </div>
            <div style={{ ...TILE_SUB, color: "#c9a094" }}>
              {"Billed to your own provider account"}
            </div>
          </div>
        </div>

        {/* The qualifier that makes the two numbers above an OBSERVATION rather than a
            price. It is not fine print you can drop: the provider publishes no video
            pricing at all, and `cost-estimate.ts` refuses to invent one. */}
        <div
          data-testid="video-warning-qualifier"
          style={{
            marginTop: 9,
            fontSize: 11,
            lineHeight: 1.45,
            color: "var(--ws-dim-2)",
          }}
        >
          {advisoryQualifier()}
        </div>

        {/* all-scenes math — computed, not the figure's four-scene literals */}
        <div
          data-testid="video-warning-all-scenes"
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: "11px 13px",
            border: "1px solid rgba(230,180,120,.12)",
            borderRadius: 10,
            background: "#1b1410",
            fontSize: 12.5,
            color: "var(--ws-dim)",
            lineHeight: 1.5,
          }}
        >
          <span aria-hidden style={{ color: "var(--ws-amber)", flex: "none" }}>
            {"ⓘ"}
          </span>
          <span>
            {"Generating video for all "}
            <b style={{ color: "#f1e7d6" }}>{`${sceneCount} scenes`}</b>
            {" would cost about "}
            <b style={{ color: "#f1e7d6" }}>{formatAdvisoryUsd(all.usd)}</b>
            {" and take around "}
            <b style={{ color: "#f1e7d6" }}>{formatAdvisoryDuration(all.seconds)}</b>
            {"."}
          </span>
        </div>

        {/* recommended alternative */}
        <div
          style={{
            marginTop: 16,
            border: "1px solid rgba(230,180,120,.16)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              background: "#1b1410",
              borderBottom: "1px solid rgba(230,180,120,.1)",
              fontFamily: SEMI,
              fontWeight: 700,
              fontSize: 9.5,
              letterSpacing: ".16em",
              // 20b's `#7fbf8f` has no Wilderness token and this palette has no green at
              // all. Rather than mint one for a single strip, the recommendation is carried
              // by the amber section colour plus the BUTTON HIERARCHY below, which is where
              // the design's own emphasis actually lives.
              color: "var(--ws-amber)",
            }}
          >
            {"RECOMMENDED INSTEAD"}
          </div>
          <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 13 }}>
            <span
              aria-hidden
              style={{
                width: 44,
                height: 78,
                flex: "none",
                borderRadius: 7,
                border: "1px solid rgba(230,180,120,.16)",
                background:
                  "radial-gradient(circle at 46% 40%,#3a5a7a,#1e3350 45%,#0a1220 92%)",
              }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                {"Still image + Ken Burns move"}
              </div>
              <div
                data-testid="video-warning-still-basis"
                style={{ fontSize: 12, color: "var(--ws-dim)", lineHeight: 1.45 }}
              >
                {"Renders in seconds, and is easy to reroll until the shot is right. "}
                {/* The HONEST module, not an advisory number: for the current Gloo
                    default this is `unpriced` and says so. 20b's "$0.003" and
                    "roughly 1/150th the cost" are omitted — the first is not the number
                    for the shipped default, and there is no ratio when one side has no
                    price at all. */}
                {stillEstimate.basis}
              </div>
            </div>
          </div>
        </div>

        {/* don't-ask-again */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            marginTop: 14,
            fontSize: 12.5,
            color: "var(--ws-dim)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            data-testid="video-warning-dont-ask"
            checked={dontWarnAgain}
            onChange={(e) => setDontWarnAgain(e.target.checked)}
          />
          {"Don't warn me again for this project"}
        </label>

        {/* Action row. THE CHEAP PATH IS PRIMARY — see the file docblock. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <button
            type="button"
            data-testid="video-warning-use-still"
            onClick={() => onUseStillImage(dontWarnAgain)}
            className={styles.hoverable}
            style={{
              padding: "13px 20px",
              borderRadius: 11,
              border: "none",
              background:
                "linear-gradient(150deg,#d4a24c,#c0392b 55%,#6d3b26)",
              boxShadow:
                "inset 0 1px 0 rgba(255,235,205,.35),0 8px 20px rgba(192,57,43,.3)",
              fontWeight: 700,
              fontSize: 14,
              color: "#fff",
            }}
          >
            {"Use a still image instead"}
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            data-testid="video-warning-confirm"
            onClick={() => onGenerateVideo(dontWarnAgain)}
            className={styles.hoverable}
            style={{
              padding: "13px 18px",
              border: "1px solid rgba(230,180,120,.22)",
              borderRadius: 11,
              background: "transparent",
              fontWeight: 700,
              fontSize: 13.5,
              color: "#e0d0c4",
            }}
          >
            {`Generate video · ${formatAdvisoryUsd(VIDEO_ADVISORY.costPerSceneUsd)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
