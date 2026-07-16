"use client";

import styles from "../studio.module.css";
import { useStudio } from "./studio-context";
import type { PostingKey } from "@/lib/studio/reducer";

function CheckRow({
  testid,
  checked,
  label,
  indent,
  dim,
  onToggle,
}: {
  testid?: string;
  checked: boolean;
  label: string;
  indent?: boolean;
  dim?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      data-checked={checked ? "true" : "false"}
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={styles.hoverable}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        paddingLeft: indent ? 29 : 0,
        background: "none",
        border: "none",
        textAlign: "left",
        color: "#f1e7d6",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          flex: "none",
          borderRadius: 5,
          display: "grid",
          placeItems: "center",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          background: checked ? "#c6552b" : "transparent",
          border: checked ? "none" : "1.5px solid rgba(230,180,120,.35)",
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span
        style={{
          fontWeight: indent ? 400 : 600,
          fontSize: indent ? 13 : 13.5,
          color: dim ? "#8a7358" : indent ? "#c9baa2" : "#f1e7d6",
        }}
      >
        {label}
      </span>
    </button>
  );
}

/** SHIP IT popover (opened by RENDER & SHARE ▸). Platform + posting toggles are
 * local UI state only — posting/rendering is inert (no backend). No blocking
 * overlay — dismissal is handled by the document listener in StudioFrame, which
 * skips `[data-menu-panel]` / `[data-menu-trigger]` (the [2] one-click-switch fix). */
export default function ShipMenu() {
  const { state, dispatch } = useStudio();
  const { posting } = state;
  const toggle = (key: PostingKey) => () =>
    dispatch({ type: "TOGGLE_POSTING", key });

  const pill = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 20,
    fontWeight: 600,
    fontSize: 12,
    border: active ? "none" : "1px solid rgba(230,180,120,.24)",
    background: active ? "linear-gradient(180deg,#d0632e,#b0481f)" : "transparent",
    color: active ? "#fff" : "#a99b85",
  });

  return (
    <div
      data-testid="ship-menu"
      data-menu-panel
      role="menu"
      aria-label="Ship it"
      style={{
        position: "absolute",
        top: 88,
        right: 30,
        zIndex: 31,
        width: 340,
        background: "#1b140d",
        border: "1px solid rgba(230,180,120,.18)",
        borderRadius: 14,
        boxShadow: "0 20px 50px rgba(0,0,0,.4)",
        padding: 18,
        color: "#f1e7d6",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-anton), sans-serif",
          fontSize: 19,
          marginBottom: 14,
        }}
      >
        {"SHIP IT"}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          onClick={() => dispatch({ type: "TOGGLE_POSTING", key: "tiktok" })}
          className={styles.hoverable}
          style={pill(posting.tiktok)}
        >
          {"TikTok ✓"}
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "TOGGLE_POSTING", key: "ytShorts" })}
          className={styles.hoverable}
          style={pill(posting.ytShorts)}
        >
          {"YT Shorts ✓"}
        </button>
        <button
          type="button"
          onClick={() => {}}
          className={styles.hoverable}
          style={pill(false)}
        >
          {"＋ add"}
        </button>
      </div>
      <div
        style={{
          borderTop: "1px solid rgba(230,180,120,.14)",
          paddingTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 11,
        }}
      >
        <CheckRow
          checked={posting.recurring}
          label="Make this a daily recurring post"
          onToggle={toggle("recurring")}
        />
        <CheckRow
          checked={posting.approveEachCut}
          label="Approve each cut before it posts"
          indent
          onToggle={toggle("approveEachCut")}
        />
        <CheckRow
          testid="post-auto"
          checked={posting.postAutomatically}
          label="Post automatically · 6:00 AM"
          indent
          dim
          onToggle={toggle("postAutomatically")}
        />
      </div>
    </div>
  );
}
