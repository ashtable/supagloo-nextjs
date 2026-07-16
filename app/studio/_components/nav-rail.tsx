"use client";

import styles from "../studio.module.css";

/**
 * Left nav rail. Purely presentational chrome — every icon is an inert button
 * (no-op) with an aria-label. The ✦ create/studio icon is the active one.
 */
const ICON_BTN: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  color: "#8a7358",
  fontSize: 17,
  background: "none",
  border: "none",
};

function noop() {}

export default function NavRail() {
  return (
    <div
      style={{
        width: 74,
        flex: "none",
        background: "linear-gradient(180deg,#1d160f,#130e09)",
        borderRight: "1px solid rgba(230,180,120,.12)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "18px 0",
        gap: 20,
        zIndex: 20,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 42,
          height: 42,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 35% 30%,#e88a44,#c6552b 70%)",
          border: "1.5px solid rgba(255,210,160,.55)",
          boxShadow:
            "0 4px 12px rgba(198,85,43,.5),inset 0 1px 0 rgba(255,235,205,.6)",
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-anton), sans-serif",
          fontSize: 22,
          color: "#1a120c",
        }}
      >
        S
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 6,
        }}
      >
        <button
          type="button"
          onClick={noop}
          aria-label="Home"
          className={styles.hoverable}
          style={ICON_BTN}
        >
          ⌂
        </button>
        <button
          type="button"
          onClick={noop}
          aria-label="Create"
          aria-current="page"
          className={styles.hoverable}
          style={{
            ...ICON_BTN,
            color: "#fff",
            background: "linear-gradient(180deg,#d0632e,#b0481f)",
            boxShadow:
              "inset 0 1px 0 rgba(255,220,180,.5),0 4px 10px rgba(198,85,43,.4)",
          }}
        >
          ✦
        </button>
        <button
          type="button"
          onClick={noop}
          aria-label="History"
          className={styles.hoverable}
          style={{ ...ICON_BTN, fontSize: 16 }}
        >
          ◷
        </button>
        <button
          type="button"
          onClick={noop}
          aria-label="Library"
          className={styles.hoverable}
          style={{ ...ICON_BTN, fontSize: 16 }}
        >
          ▤
        </button>
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={noop}
          aria-label="Settings"
          className={styles.hoverable}
          style={{ ...ICON_BTN, fontSize: 16 }}
        >
          ⚙
        </button>
        <button
          type="button"
          onClick={noop}
          aria-label="Account"
          className={styles.hoverable}
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "linear-gradient(180deg,#4a3a2a,#2a2016)",
            border: "1px solid rgba(230,180,120,.3)",
            padding: 0,
          }}
        />
      </div>
    </div>
  );
}
