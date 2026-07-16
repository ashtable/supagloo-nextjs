import type { CSSProperties } from "react";
import type { Metadata } from "next";
import StudioApp from "./_components/studio-app";
import { DEMO_STORYBOARD } from "@/lib/studio/storyboard";
import styles from "./studio.module.css";

export const metadata: Metadata = {
  title: "Wilderness Studio — Preview",
  description:
    "Preview the storyboard — scenes, scripture captions, narrator voice, music & timing — before you spend a generation.",
};

// The Wilderness Studio palette, declared as inline CSS custom properties on the
// route wrapper. Scoped to this subtree only — nothing leaks into the landing,
// and the landing's `--sg-*` tokens never reach here (no globals.css edit).
const WS_TOKENS = {
  "--ws-bg": "#16110d",
  "--ws-ink": "#f1e7d6",
  "--ws-dim": "#a99b85",
  "--ws-dim-2": "#7a6650",
  "--ws-dim-3": "#6f5c46",
  "--ws-rust": "#c6552b",
  "--ws-rust-bright": "#d0632e",
  "--ws-rust-glow": "#e07a3e",
  "--ws-amber": "#e6a43b",
  "--ws-amber-bright": "#f0b45a",
  "--ws-line": "rgba(230,180,120,.12)",
  "--ws-line-2": "rgba(230,180,120,.18)",
  "--ws-line-3": "rgba(230,180,120,.24)",
} as CSSProperties;

/**
 * Turn 5 / Fig 5a "Wilderness Studio" storyboard PREVIEW editor at `/studio`.
 * A Server-Component shell (theme wrapper + static demo data) hosting the client
 * editor island. The editor + Remotion preview are real; render/AI/posting are
 * inert placeholders (D4).
 */
export default function StudioPage() {
  return (
    <div className={styles.backdrop} style={WS_TOKENS}>
      <StudioApp storyboard={DEMO_STORYBOARD} />
    </div>
  );
}
