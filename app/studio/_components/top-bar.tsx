"use client";

import styles from "../studio.module.css";
import { useStudio } from "./studio-context";
import { ASPECTS, type Aspect } from "@/lib/studio/aspect";

const ASPECT_TESTID: Record<Aspect, string> = {
  "9:16": "aspect-9x16",
  "16:9": "aspect-16x9",
  "1:1": "aspect-1x1",
};

export default function TopBar() {
  const { state, dispatch } = useStudio();
  const { storyboard, aspect } = state;

  return (
    <div
      style={{
        height: 76,
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 22,
        padding: "0 26px",
        borderBottom: "1px solid rgba(230,180,120,.12)",
        background:
          "linear-gradient(180deg,rgba(40,30,20,.5),rgba(22,17,13,.2))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <button
          type="button"
          onClick={() => {}}
          aria-label="Back"
          className={styles.hoverable}
          style={{
            color: "#8a7358",
            fontSize: 20,
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          ‹
        </button>
        <div>
          <div
            style={{
              fontFamily:
                "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: ".28em",
              color: "#c6552b",
            }}
          >
            {"PREVIEW"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-anton), sans-serif",
              fontSize: 22,
              letterSpacing: ".01em",
              lineHeight: 1,
              marginTop: 3,
            }}
          >
            {storyboard.title}{" "}
            <span
              style={{
                color: "#7a6650",
                fontSize: 15,
                fontFamily: "var(--font-barlow), sans-serif",
                fontWeight: 500,
                letterSpacing: 0,
              }}
            >
              {storyboard.dateLabel}
            </span>
          </div>
        </div>
      </div>

      {/* step indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginLeft: 14,
          fontFamily:
            "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: ".14em",
        }}
      >
        <span style={{ color: "#6f5c46" }}>
          {"GENERATE "}
          <span style={{ color: "#d0632e" }}>{"✓"}</span>
        </span>
        <span
          style={{ width: 22, height: 1, background: "rgba(230,180,120,.2)" }}
        />
        <span
          style={{
            color: "#f1e7d6",
            borderBottom: "2px solid #d0632e",
            paddingBottom: 3,
          }}
        >
          {"PREVIEW"}
        </span>
        <span
          style={{ width: 22, height: 1, background: "rgba(230,180,120,.2)" }}
        />
        <span style={{ color: "#6f5c46" }}>{"SHARE"}</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* format toggle */}
      <div
        role="group"
        aria-label="Aspect ratio"
        style={{
          display: "flex",
          background: "#0f0b07",
          border: "1px solid rgba(230,180,120,.14)",
          borderRadius: 9,
          padding: 3,
        }}
      >
        {ASPECTS.map((a) => {
          const active = a === aspect;
          return (
            <button
              key={a}
              type="button"
              data-testid={ASPECT_TESTID[a]}
              aria-pressed={active}
              onClick={() => dispatch({ type: "SET_ASPECT", aspect: a })}
              className={styles.hoverable}
              style={{
                padding: "5px 11px",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12,
                border: "none",
                color: active ? "#f1e7d6" : "#7a6650",
                background: active ? "#2a1f15" : "transparent",
                boxShadow: active
                  ? "inset 0 1px 0 rgba(230,180,120,.12)"
                  : "none",
              }}
            >
              {a}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        data-testid="regenerate"
        onClick={() => dispatch({ type: "TOGGLE_REROLL_MENU" })}
        className={styles.hoverable}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 15px",
          border: "1px solid rgba(230,180,120,.24)",
          borderRadius: 9,
          fontWeight: 600,
          fontSize: 13,
          color: "#d8c9b2",
          background: "transparent",
        }}
      >
        {"↻ Regenerate"}
      </button>

      <button
        type="button"
        data-testid="render-share"
        onClick={() => dispatch({ type: "TOGGLE_SHIP_MENU" })}
        className={styles.hoverable}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "10px 20px",
          borderRadius: 9,
          fontFamily:
            "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
          fontWeight: 700,
          fontSize: 13.5,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "#fff",
          background: "linear-gradient(180deg,#e07a3e,#c6552b)",
          border: "1px solid #e69a5a",
          boxShadow:
            "inset 0 1px 0 rgba(255,225,190,.55),0 8px 20px rgba(198,85,43,.4)",
        }}
      >
        {"Render & Share ▸"}
      </button>
    </div>
  );
}
