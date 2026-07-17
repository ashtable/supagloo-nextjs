"use client";

import { useState } from "react";
import {
  searchRepos,
  type MockRepo,
} from "@/lib/project-wizard/repos-model";
import OctocatIcon from "../octocat-icon";

/**
 * The searchable repo list shared by the New-project "use existing empty repo"
 * tab (13a, `variant="empty-check"` → EMPTY / NOT EMPTY pills, `isEmpty` gates
 * selection) and the Import wizard (12b, `variant="import"` → relative-update +
 * branch text, every row selectable). Rows carry `data-selected` / `data-disabled`
 * for the E2E; a disabled (non-empty) row's click is a no-op (no native
 * `disabled` attr so the understudy's click never times out).
 */
export default function RepoPicker({
  repos,
  variant,
  selectedFullName,
  onSelect,
}: {
  repos: readonly MockRepo[];
  variant: "empty-check" | "import";
  selectedFullName: string | null;
  onSelect: (repo: MockRepo) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = searchRepos(repos, query);

  return (
    <div>
      <input
        data-testid="repo-search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Search your repositories…"
        aria-label="Search your repositories"
        style={{
          width: "100%",
          height: 40,
          border: "1px solid var(--sg-line2)",
          borderRadius: 10,
          background: "var(--sg-panel)",
          padding: "0 12px",
          fontSize: 13,
          color: "var(--sg-fg)",
          fontFamily: "var(--font-barlow), sans-serif",
          outline: "none",
        }}
      />

      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {shown.map((repo) => {
          const disabled = variant === "empty-check" && !repo.isEmpty;
          const selected = repo.fullName === selectedFullName;
          const subline =
            variant === "import" && repo.latestBranch
              ? `${repo.updatedLabel} · latest branch ${repo.latestBranch}`
              : repo.updatedLabel;

          return (
            <button
              key={repo.fullName}
              type="button"
              data-testid={`repo-row-${repo.shortName}`}
              data-selected={selected ? "true" : undefined}
              data-disabled={disabled ? "true" : undefined}
              aria-disabled={disabled || undefined}
              aria-pressed={selected}
              onClick={() => {
                if (!disabled) onSelect(repo);
              }}
              className="cursor-pointer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                width: "100%",
                textAlign: "left",
                padding: "12px 14px",
                borderRadius: 11,
                border: selected
                  ? "1.5px solid var(--sg-red)"
                  : "1px solid var(--sg-line)",
                background: selected
                  ? "rgba(192,57,43,.05)"
                  : "var(--sg-panel)",
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? "default" : "pointer",
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  flex: "none",
                  display: "grid",
                  placeItems: "center",
                  color: selected ? "var(--sg-fg)" : "var(--sg-dim)",
                }}
              >
                <OctocatIcon size={17} />
              </span>
              <span style={{ flex: 1 }}>
                <span
                  style={{
                    display: "block",
                    fontWeight: 700,
                    fontSize: 13.5,
                    color: "var(--sg-fg)",
                  }}
                >
                  {repo.fullName}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 11.5,
                    color: "var(--sg-dim)",
                  }}
                >
                  {subline}
                </span>
              </span>

              {variant === "empty-check" &&
                (repo.isEmpty ? (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: "rgba(47,143,78,.14)",
                      color: "var(--sg-green)",
                      fontWeight: 700,
                      fontSize: 10,
                      flex: "none",
                    }}
                  >
                    {"EMPTY"}
                  </span>
                ) : (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: "var(--sg-line)",
                      color: "var(--sg-dim)",
                      fontWeight: 700,
                      fontSize: 10,
                      flex: "none",
                    }}
                  >
                    {"NOT EMPTY"}
                  </span>
                ))}

              {selected && (
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "var(--sg-red)",
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    fontSize: 11,
                    flex: "none",
                  }}
                >
                  {"✓"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
