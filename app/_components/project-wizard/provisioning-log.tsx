"use client";

import {
  logRowStatus,
  type LogSequence,
} from "@/lib/project-wizard/provisioning-log";
import styles from "./wizard.module.css";

/**
 * Renders a `LogSequence` as monospace rows in a panel box. Each row carries
 * `data-testid="log-row"` + `data-status` ("completed" | "active" | "queued"),
 * mapping status → green ✓ / spinning ring / dim ○. Shared by New-project step 2
 * (scaffolding) and Import step 2 (verifying). Purely presentational — the
 * caller ticks the sequence.
 */
export default function ProvisioningLog({ seq }: { seq: LogSequence }) {
  return (
    <div
      data-testid="provisioning-log"
      style={{
        border: "1px solid var(--sg-line)",
        borderRadius: 12,
        background: "var(--sg-panel)",
        padding: "6px 4px",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 12.5,
      }}
    >
      {seq.rows.map((row, i) => {
        const status = logRowStatus(seq, i);
        return (
          <div
            key={i}
            data-testid="log-row"
            data-status={status}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 14px",
              opacity: status === "queued" ? 0.45 : 1,
            }}
          >
            <span
              aria-hidden
              style={{
                flex: "none",
                width: 13,
                height: 13,
                display: "grid",
                placeItems: "center",
                color: status === "completed" ? "var(--sg-green)" : "var(--sg-dim)",
              }}
            >
              {status === "completed" ? (
                "✓"
              ) : status === "active" ? (
                <span
                  className={styles.spin}
                  style={{
                    width: 13,
                    height: 13,
                    border: "2px solid var(--sg-line2)",
                    borderTopColor: "var(--sg-red)",
                    borderRadius: "50%",
                  }}
                />
              ) : (
                "○"
              )}
            </span>
            <span
              style={{
                color: status === "active" ? "var(--sg-fg)" : "var(--sg-dim)",
              }}
            >
              {row}
            </span>
          </div>
        );
      })}
    </div>
  );
}
