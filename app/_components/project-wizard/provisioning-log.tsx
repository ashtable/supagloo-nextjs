"use client";

import type { LogRow } from "@/lib/project-wizard/job-log";
import styles from "./wizard.module.css";

/**
 * Renders provisioning-log rows in a monospace panel box. Each row carries
 * `data-testid="log-row"` + `data-status` ("completed" | "active" | "queued" |
 * "failed"), mapping status → green ✓ / spinning ring / dim ○ / red ✕. Shared by
 * New-project step 2 (scaffolding) and Import step 2 (verifying).
 *
 * Task #26: the VIEW is unchanged, only the DATA SOURCE. In mock mode the rows come
 * from the fake ticker (`logSequenceToRows`); in real mode they come from the polled
 * `ProjectJob.stages` (`stagesToLogRows`). Purely presentational either way.
 */
export default function ProvisioningLog({ rows }: { rows: readonly LogRow[] }) {
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
      {rows.map((row, i) => {
        const status = row.status;
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
                color:
                  status === "completed"
                    ? "var(--sg-green)"
                    : status === "failed"
                      ? "var(--sg-red)"
                      : "var(--sg-dim)",
              }}
            >
              {status === "completed" ? (
                "✓"
              ) : status === "failed" ? (
                "✕"
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
                color:
                  status === "active"
                    ? "var(--sg-fg)"
                    : status === "failed"
                      ? "var(--sg-red)"
                      : "var(--sg-dim)",
              }}
            >
              {row.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
