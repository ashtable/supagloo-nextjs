"use client";

import { useEffect, useState } from "react";
import { useStudio } from "./studio-context";
import {
  versionHistory,
  versionRowsFromDtos,
  type VersionRow,
} from "@/lib/studio/version-history";
import { fetchVersions } from "@/lib/studio/studio-data";
import type { ProjectVersionDto } from "@/lib/api/contracts";

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const MONO = "ui-monospace, Menlo, monospace";

const STATE_ACCENT: Record<VersionRow["state"], string> = {
  working: "#c6552b",
  live: "#a99b85",
  archived: "#a99b85",
  template: "#7a6650",
};

/**
 * 14b — the version dropdown, anchored under the top-bar chip's ▾. A warm
 * sibling of the reroll/ship popovers (`data-menu-panel`, joins the StudioFrame
 * dismiss family). Rows are entirely INERT (D-14B-INERT): the ⇄ Compare stub, the
 * archived restore link, and every row click mutate no state.
 *
 * MOCK catalog projects (no source manifest) derive their rows from `versionHistory`
 * (the wireframe-literal two-step model). REAL projects fetch the authoritative
 * version list from `GET /api/projects/:id/versions` — the menu only mounts while open,
 * so this is a lazy on-open fetch — and map the wire DTOs onto the SAME `VersionRow`
 * shape via `versionRowsFromDtos` (Task 28). Restore stays inert either way (no restore
 * endpoint exists anywhere in the backend).
 */
export default function VersionMenu() {
  const { state, project } = useStudio();
  const isReal = project.manifest !== undefined;

  const [versions, setVersions] = useState<ProjectVersionDto[] | null>(null);
  useEffect(() => {
    if (!isReal) return;
    let active = true;
    void (async () => {
      const v = await fetchVersions(project.id);
      if (active) setVersions(v ?? []);
    })();
    return () => {
      active = false;
    };
  }, [isReal, project.id]);

  // `dirty` is applied in the mapping (not baked into the fetch) so toggling dirty
  // re-renders without a refetch.
  const rows = isReal
    ? versions
      ? versionRowsFromDtos(versions, state.dirty)
      : []
    : versionHistory(
        state.versionBranch,
        state.lastPublishedVersion,
        state.dirty,
      );

  return (
    <div
      data-testid="version-menu"
      data-menu-panel
      role="menu"
      aria-label="Versions"
      style={{
        position: "absolute",
        top: 72,
        left: 230,
        zIndex: 31,
        width: 360,
        background: "#1b140d",
        color: "#f1e7d6",
        border: "1px solid rgba(230,180,120,.18)",
        borderRadius: 14,
        boxShadow: "0 24px 60px rgba(0,0,0,.5)",
        overflow: "hidden",
        fontFamily: "var(--font-barlow), sans-serif",
      }}
    >
      {/* header */}
      <div
        style={{
          padding: "13px 16px",
          borderBottom: "1px solid rgba(230,180,120,.12)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: SEMI,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: ".16em",
            color: "#a99b85",
          }}
        >
          {"VERSIONS"}
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          data-testid="version-compare"
          role="menuitem"
          onClick={() => {}}
          style={{
            fontSize: 11,
            color: "#a99b85",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          {"⇄ Compare"}
        </button>
      </div>

      {/* rows */}
      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((row) => {
          const isWorking = row.state === "working";
          return (
            <div
              key={row.branch}
              data-testid="version-row"
              data-state={row.state}
              data-branch={row.branch}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "10px 11px",
                borderRadius: 9,
                cursor: isWorking ? "default" : "pointer",
                background: isWorking ? "rgba(198,85,43,.10)" : "transparent",
                border: isWorking
                  ? "1px solid rgba(198,85,43,.28)"
                  : "1px solid transparent",
              }}
            >
              <span style={{ fontSize: 13, color: STATE_ACCENT[row.state] }}>
                {"⑂"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontWeight: 700,
                    fontSize: 13.5,
                    color: row.state === "template" ? "#a99b85" : "#f1e7d6",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {row.branch}
                  {row.state === "live" ? (
                    <span
                      data-testid="version-live-pill"
                      style={{
                        fontFamily: "var(--font-barlow), sans-serif",
                        fontWeight: 700,
                        fontSize: 9,
                        letterSpacing: ".04em",
                        color: "#2f8f4e",
                        background: "rgba(47,143,78,.16)",
                        padding: "1px 7px",
                        borderRadius: 20,
                      }}
                    >
                      {"LIVE ON MAIN"}
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 11, color: "#a99b85" }}>{row.label}</div>
              </div>
              {isWorking && row.showDot ? (
                <span
                  data-testid="unsaved-dot"
                  title="unsaved changes"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#e6a43b",
                    flex: "none",
                  }}
                />
              ) : null}
              {row.canRestore ? (
                <button
                  type="button"
                  data-testid="version-restore"
                  role="menuitem"
                  onClick={() => {}}
                  style={{
                    fontSize: 10,
                    color: "#a99b85",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    flex: "none",
                  }}
                >
                  {"restore"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* footer note */}
      <div
        data-testid="version-menu-note"
        style={{
          padding: "9px 12px",
          borderTop: "1px solid rgba(230,180,120,.12)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12.5,
          color: "#a99b85",
        }}
      >
        <span style={{ color: "#e6a43b" }}>{"ⓘ"}</span>
        {" main always holds the latest published version."}
      </div>
    </div>
  );
}
