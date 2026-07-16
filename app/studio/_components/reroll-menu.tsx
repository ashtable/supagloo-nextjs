"use client";

import styles from "../studio.module.css";

const OPTIONS = [
  { icon: "🖼", title: "This scene's visual", sub: "keep script & timing" },
  { icon: "✍", title: "Rewrite the script", sub: "new narration line" },
  { icon: "🎬", title: "Re-plan all scenes", sub: "start the storyboard over" },
];

/** REGENERATE popover (opened by ↻ Reroll scene / ↻ Regenerate). Actions inert.
 *  No blocking overlay — dismissal (outside-pointerdown / Escape / switch to the
 *  other popover) is handled by the document listener in StudioFrame, which skips
 *  `[data-menu-panel]` / `[data-menu-trigger]`; the [2] one-click-switch fix. */
export default function RerollMenu() {
  return (
    <div
      data-testid="reroll-menu"
      data-menu-panel
      role="menu"
      aria-label="Regenerate"
      style={{
        position: "absolute",
        top: 88,
        right: 30,
        zIndex: 31,
        width: 320,
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
          fontFamily:
            "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: ".2em",
          color: "#e6a43b",
          marginBottom: 14,
        }}
      >
        {"REGENERATE"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {OPTIONS.map((o, i) => (
          <button
            key={o.title}
            type="button"
            role="menuitem"
            onClick={() => {}}
            className={styles.hoverable}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 13px",
              borderRadius: 10,
              textAlign: "left",
              background: i === 0 ? "rgba(230,164,59,.08)" : "transparent",
              border:
                i === 0
                  ? "1px solid rgba(230,164,59,.28)"
                  : "1px solid rgba(230,180,120,.14)",
              color: "#f1e7d6",
            }}
          >
            <span style={{ fontSize: 17 }}>{o.icon}</span>
            <span>
              <span
                style={{
                  display: "block",
                  fontWeight: 600,
                  fontSize: 13.5,
                }}
              >
                {o.title}
              </span>
              <span style={{ fontSize: 11, color: "#a99b85" }}>{o.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
