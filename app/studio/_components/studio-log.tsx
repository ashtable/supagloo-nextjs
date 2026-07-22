"use client";

import styles from "../studio.module.css";
import {
  logRowStatus,
  type LogSequence,
} from "@/lib/project-wizard/provisioning-log";
import type { LogRow, LogRowStatus } from "@/lib/project-wizard/job-log";

/**
 * Warm, studio-scoped log-row renderer (mirrors the neutral
 * `project-wizard/provisioning-log.tsx` LOGIC, re-skinned amber per D-SKIN). Renders
 * from EITHER a mocked `LogSequence` (`seq` — the mock publish step + the 14c render
 * checklist) OR pre-mapped `LogRow[]` (`rows` — Task 28's REAL publish path, driven by
 * the polled `ProjectJob.stages`). Each row carries `data-testid={rowTestId}` (default
 * `log-row`) + `data-status` ("completed" | "active" | "queued" | "failed"), mapping
 * status → green ✓ / spinning rust ring / dim ○ / red ✕. `seq` mode never produces
 * "failed", so it is byte-for-byte unchanged (the `rows`/failed path is strictly
 * additive). Purely presentational — the caller ticks the seq / dispatches the stages.
 */
export default function StudioLog({
  seq,
  rows,
  rowTestId = "log-row",
}: {
  seq?: LogSequence;
  rows?: LogRow[];
  rowTestId?: string;
}) {
  const items: { label: string; status: LogRowStatus }[] = rows
    ? rows
    : seq
      ? seq.rows.map((label, i) => ({
          label,
          status: logRowStatus(seq, i) as LogRowStatus,
        }))
      : [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 12.5,
      }}
    >
      {items.map(({ label, status }, i) => {
        const failed = status === "failed";
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
                color: failed
                  ? "#e0745a"
                  : status === "completed"
                    ? "#2f8f4e"
                    : "#7a6650",
                borderRadius: "50%",
                border:
                  status === "active"
                    ? "2px solid rgba(230,180,120,.24)"
                    : "2px solid transparent",
                borderTopColor: status === "active" ? "#c6552b" : "transparent",
              }}
            >
              {status === "completed"
                ? "✓"
                : failed
                  ? "✕"
                  : status === "active"
                    ? ""
                    : "○"}
            </span>
            <span
              style={{
                color: failed
                  ? "#e0745a"
                  : status === "active"
                    ? "#f1e7d6"
                    : "#a99b85",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
