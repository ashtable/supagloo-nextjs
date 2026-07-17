"use client";

import styles from "../studio.module.css";
import {
  logRowStatus,
  type LogSequence,
} from "@/lib/project-wizard/provisioning-log";

/**
 * Warm, studio-scoped `LogSequence` row renderer (mirrors the neutral
 * `project-wizard/provisioning-log.tsx` LOGIC, re-skinned amber per D-SKIN).
 * Each row carries `data-testid={rowTestId}` (default `log-row`) + `data-status`
 * ("completed" | "active" | "queued"), mapping status → green ✓ / spinning rust
 * ring / dim ○. Shared by the 14a publishing step (`log-row`) and the 14c stage
 * checklist (`render-stage`). Purely presentational — the caller ticks the seq.
 */
export default function StudioLog({
  seq,
  rowTestId = "log-row",
}: {
  seq: LogSequence;
  rowTestId?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 12.5,
      }}
    >
      {seq.rows.map((row, i) => {
        const status = logRowStatus(seq, i);
        return (
          <div
            key={i}
            data-testid={rowTestId}
            data-status={status}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 4px",
              opacity: status === "queued" ? 0.45 : 1,
            }}
          >
            {/* One PERSISTENT indicator node whose class/border/text update in
                place as the status changes — never swapped between an element and
                a text node. That churn (element↔text every tick) races the
                understudy's async node geometry ("Node does not have a layout
                object"); a stable node avoids the removed-node race. */}
            <span
              aria-hidden
              className={status === "active" ? styles.spin : undefined}
              style={{
                flex: "none",
                width: 13,
                height: 13,
                display: "grid",
                placeItems: "center",
                lineHeight: "13px",
                fontSize: 12,
                color: status === "completed" ? "#2f8f4e" : "#7a6650",
                borderRadius: "50%",
                border:
                  status === "active"
                    ? "2px solid rgba(230,180,120,.24)"
                    : "2px solid transparent",
                borderTopColor: status === "active" ? "#c6552b" : "transparent",
              }}
            >
              {status === "completed" ? "✓" : status === "active" ? "" : "○"}
            </span>
            <span
              style={{
                color: status === "active" ? "#f1e7d6" : "#a99b85",
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
