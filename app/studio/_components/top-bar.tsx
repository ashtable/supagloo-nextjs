"use client";

import { useRouter } from "next/navigation";
import styles from "../studio.module.css";
import { useStudio } from "./studio-context";
import LogoMark from "../../_components/logo-mark";
import OctocatIcon from "../../_components/octocat-icon";
import { ASPECTS, type Aspect } from "@/lib/studio/aspect";
import { publishLabel } from "@/lib/studio/project";

const ASPECT_TESTID: Record<Aspect, string> = {
  "9:16": "aspect-9x16",
  "16:9": "aspect-16x9",
  "1:1": "aspect-1x1",
};

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const MONO = "ui-monospace, Menlo, monospace";

/**
 * Turn 13b top bar (D-TOPBAR, "extend" style): project identity + version-branch
 * chip + dirty caption + Commit/Publish + avatar, wired Back → "/". Builds these
 * NEW elements while KEEPING 5a's live actions (the aspect toggle, ↻ Regenerate,
 * Render & Share ▸) — only the old GENERATE/PREVIEW/SHARE step indicator is
 * dropped. Identity comes from the resolved `project`; the mutable branch/dirty/
 * pending bits live in the reducer.
 */
export default function TopBar() {
  const router = useRouter();
  const { state, dispatch, project, commit, openPublish, toggleVersionMenu } =
    useStudio();
  const { aspect, versionBranch, dirty, committing, publishing, commitError } =
    state;

  return (
    <div
      style={{
        height: 76,
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 20px",
        borderBottom: "1px solid rgba(230,180,120,.12)",
        background: "linear-gradient(180deg,rgba(40,30,20,.5),rgba(22,17,13,.2))",
      }}
    >
      {/* back + logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          data-testid="studio-back"
          onClick={() => router.push("/")}
          aria-label="Back to workspace"
          className={styles.hoverable}
          style={{
            color: "#8a7358",
            fontSize: 20,
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          {"‹"}
        </button>
        <LogoMark size={30} />
      </div>

      {/* project identity */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            data-testid="studio-project-name"
            style={{ fontFamily: SEMI, fontWeight: 700, fontSize: 17, letterSpacing: "-.01em" }}
          >
            {project.projectName}
          </span>
          <span
            data-testid="studio-project-rename"
            aria-hidden
            style={{ fontSize: 11, color: "#7a6650", cursor: "pointer" }}
          >
            {"✎"}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "#a99b85",
            marginTop: 1,
          }}
        >
          <OctocatIcon size={11} />
          <span data-testid="studio-repo-path">{project.repo}</span>
        </div>
      </div>

      {/* version-branch chip */}
      <div
        data-testid="version-branch-chip"
        data-dirty={dirty ? "true" : "false"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "7px 12px",
          border: "1px solid rgba(230,180,120,.24)",
          borderRadius: 9,
          background: "#0f0b07",
          flex: "none",
        }}
      >
        <span style={{ fontSize: 12 }}>{"⑂"}</span>
        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, color: "#f1e7d6" }}>
          {versionBranch}
        </span>
        {dirty && (
          <span
            data-testid="unsaved-dot"
            title="unsaved changes"
            style={{ width: 7, height: 7, borderRadius: "50%", background: "#e6a43b", flex: "none" }}
          />
        )}
        {/* the ▾ is the 14b version-dropdown trigger (data-menu-trigger so the
            StudioFrame dismiss listener skips it → one-click toggle) */}
        <button
          type="button"
          data-testid="version-menu-trigger"
          data-menu-trigger
          aria-label="Version history"
          onClick={toggleVersionMenu}
          className={styles.hoverable}
          style={{
            fontSize: 9,
            color: "#7a6650",
            background: "none",
            border: "none",
            padding: "2px 2px",
            lineHeight: 1,
          }}
        >
          {"▾"}
        </button>
      </div>

      {/* dirty caption */}
      <span data-testid="dirty-caption" style={{ fontSize: 11.5, color: "#a99b85", flex: "none" }}>
        {dirty ? "Edited 2m ago · not committed" : "All changes committed"}
      </span>

      <div style={{ flex: 1 }} />

      {/* viewport-ratio switcher (the retained 5a aspect toggle) */}
      <div
        role="group"
        aria-label="Aspect ratio"
        style={{
          display: "flex",
          background: "#0f0b07",
          border: "1px solid rgba(230,180,120,.14)",
          borderRadius: 9,
          padding: 3,
          flex: "none",
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
                fontWeight: active ? 700 : 600,
                fontSize: 12,
                border: "none",
                color: active ? "#f1e7d6" : "#7a6650",
                background: active ? "#2a1f15" : "transparent",
                boxShadow: active ? "inset 0 1px 0 rgba(230,180,120,.12)" : "none",
              }}
            >
              {a}
            </button>
          );
        })}
      </div>

      {/* Commit — enabled only when dirty */}
      <button
        type="button"
        data-testid="commit-button"
        onClick={commit}
        disabled={!dirty || committing}
        className={styles.hoverable}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 15px",
          border: "1px solid rgba(230,180,120,.24)",
          borderRadius: 9,
          fontWeight: 700,
          fontSize: 13,
          color: "#f1e7d6",
          background: "transparent",
          opacity: !dirty || committing ? 0.5 : 1,
          cursor: !dirty || committing ? "default" : "pointer",
          flex: "none",
        }}
      >
        {committing ? "Committing…" : "⤓ Commit"}
      </button>

      {/* Commit failure (real mode) — the edit stayed dirty; surface it so the user
          knows the commit didn't land and can click Commit again to retry. */}
      {commitError ? (
        <span
          data-testid="commit-error"
          title={commitError}
          style={{ fontSize: 11.5, color: "#e0745a", flex: "none" }}
        >
          {"Commit failed — retry"}
        </span>
      ) : null}

      {/* Publish — opens the 14a wizard (no direct bump); label = next version */}
      <button
        type="button"
        data-testid="publish-button"
        onClick={openPublish}
        disabled={publishing}
        className={styles.hoverable}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 18px",
          borderRadius: 9,
          fontFamily: SEMI,
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: ".05em",
          textTransform: "uppercase",
          color: "#fff",
          background: "linear-gradient(150deg,#d4a24c,#c0392b 55%,#6d3b26)",
          border: "1px solid #e69a5a",
          boxShadow: "inset 0 1px 0 rgba(255,225,190,.55),0 6px 16px rgba(198,85,43,.4)",
          flex: "none",
        }}
      >
        {publishLabel(versionBranch)}
      </button>

      {/* retained 5a: Regenerate */}
      <button
        type="button"
        data-testid="regenerate"
        data-menu-trigger
        onClick={() => dispatch({ type: "TOGGLE_REROLL_MENU" })}
        className={styles.hoverable}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 13px",
          border: "1px solid rgba(230,180,120,.24)",
          borderRadius: 9,
          fontWeight: 600,
          fontSize: 12.5,
          color: "#d8c9b2",
          background: "transparent",
          flex: "none",
        }}
      >
        {"↻ Regenerate"}
      </button>

      {/* retained 5a: Render & Share */}
      <button
        type="button"
        data-testid="render-share"
        data-menu-trigger
        onClick={() => dispatch({ type: "TOGGLE_SHIP_MENU" })}
        className={styles.hoverable}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 15px",
          borderRadius: 9,
          fontFamily: SEMI,
          fontWeight: 700,
          fontSize: 12.5,
          letterSpacing: ".05em",
          textTransform: "uppercase",
          color: "#fff",
          background: "linear-gradient(180deg,#e07a3e,#c6552b)",
          border: "1px solid #e69a5a",
          boxShadow: "inset 0 1px 0 rgba(255,225,190,.55),0 6px 16px rgba(198,85,43,.4)",
          flex: "none",
        }}
      >
        {"Render & Share ▸"}
      </button>

      {/* avatar */}
      <span
        data-testid="studio-avatar"
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: "linear-gradient(150deg,#d4a24c,#c0392b 60%,#6d3b26)",
          display: "grid",
          placeItems: "center",
          fontWeight: 800,
          fontSize: 11,
          color: "#fff",
          flex: "none",
        }}
      >
        {"AS"}
      </span>
    </div>
  );
}
