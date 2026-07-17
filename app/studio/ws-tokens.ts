import type { CSSProperties } from "react";

/**
 * The Wilderness Studio palette, declared as inline CSS custom properties on the
 * route wrapper. Scoped to the `/studio/[id]` subtree only — nothing leaks into
 * the landing, and the landing's `--sg-*` tokens never override these (no
 * globals.css edit). Shared by `[id]/page.tsx` and `not-found.tsx`.
 */
export const WS_TOKENS: CSSProperties = {
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
