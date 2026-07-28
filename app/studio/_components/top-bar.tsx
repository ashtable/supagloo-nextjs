"use client";

import { useRouter } from "next/navigation";
import styles from "../studio.module.css";
import { useStudio } from "./studio-context";
import LogoMark from "../../_components/logo-mark";
import OctocatIcon from "../../_components/octocat-icon";
import { ASPECTS, type Aspect } from "@/lib/studio/aspect";
import { publishLabel } from "@/lib/studio/project";
import { publishButtonGate, renderButtonGate } from "@/lib/studio/top-bar-gates";

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
 * the share popover trigger) — only the old GENERATE/PREVIEW/SHARE step indicator
 * is dropped. Identity comes from the resolved `project`; the mutable branch/dirty/
 * pending bits live in the reducer.
 *
 * Action row, left to right: `⤓ Commit` · (commit error) · `Render ▸` · `PUBLISH vX ▸`
 * · `↻ Regenerate` · `Share ▸` · avatar.
 *
 * 2026-07-27 (the genesis-1 render-bug task):
 *  - **item 6** added `Render ▸`. It is Commit's outline sibling and calls the
 *    already-shipping `startRender()`; before it, the only ways to reach a rendered,
 *    downloadable video were the publish wizard's post-publish CTA and the render
 *    overlay's retry — i.e. you had to publish a version to get a video.
 *  - **item 3** renamed 5a's `Render & Share ▸` to `Share ▸`. With a real Render
 *    button beside Commit, that control's only job is the share popover, and the old
 *    label promised a render it never started (the popover has no submit at all).
 *  - **item 7** gates Publish on there being something to publish. Both gates are pure
 *    predicates in `lib/studio/top-bar-gates.ts`; this file only renders their answer.
 */
export default function TopBar() {
  const router = useRouter();
  const {
    state,
    dispatch,
    project,
    commit,
    openPublish,
    toggleVersionMenu,
    startRender,
  } = useStudio();
  const { aspect, versionBranch, dirty, committing, publishing, commitError } =
    state;

  // Items 6 + 7. Both gates are pure and unit-tested in `lib/studio/top-bar-gates.ts`;
  // this component only renders their answer. `renderButtonGate` reads `state.render`
  // for DISPLAY only — the authoritative one-render-at-a-time guard is still the
  // `renderRunRef` inside the provider, because a `state` read in a provider callback is
  // always a latched guard (the lesson of the dead "Try again ▸" button).
  const renderGate = renderButtonGate({
    dirty,
    committing,
    renderOpen: state.render !== null,
    sceneCount: state.storyboard.scenes.length,
  });
  const publishGate = publishButtonGate({
    versions: state.versions,
    isRealProject: Boolean(project.manifest),
    publishing,
    committing,
    workingBranch: versionBranch,
  });

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

      {/* Render — item 6. Commit's OUTLINE SIBLING, not a competitor to Publish: two
          identical outline boxes side by side read as one group and the gradient PUBLISH
          stays the only hero. `▸` because it opens the 14c overlay (the design's glyph
          grammar: ▸ = opens something else). It calls the SAME `startRender` the publish
          wizard's post-publish CTA does — the pipeline was never the problem, the missing
          trigger was. Deliberately NOT the same control as `render-share`, which opens
          the share popover (studio-publish.e2e.ts E-RND1 pins that distinction). */}
      <button
        type="button"
        data-testid="render-button"
        onClick={startRender}
        disabled={!renderGate.enabled}
        title={renderGate.reason ?? undefined}
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
          opacity: renderGate.enabled ? 1 : 0.5,
          cursor: renderGate.enabled ? "pointer" : "default",
          flex: "none",
        }}
      >
        {"Render ▸"}
      </button>

      {/* Publish — opens the 14a wizard (no direct bump); label = next version.
          Item 7: disabled when the version rows say nothing is ahead of main (publish
          merges working→main and GitHub answers 422 "No commits between" on an empty
          diff), while a commit job is in flight (the per-project git-ops 409 guard), or
          while publishing. The gate FAILS OPEN — see top-bar-gates.ts.
          The disabled state SWAPS THE SURFACE rather than only fading: this is the
          header's one saturated gradient, and `opacity:.5` on it reads as "faded", not
          "disabled" — it would still be the most colourful thing up here. 16a's disabled
          `⑂ Remix this` sets the same precedent. */}
      <button
        type="button"
        data-testid="publish-button"
        onClick={openPublish}
        disabled={!publishGate.enabled}
        title={publishGate.reason ?? undefined}
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
          flex: "none",
          ...(publishGate.enabled
            ? {
                color: "#fff",
                background: "linear-gradient(150deg,#d4a24c,#c0392b 55%,#6d3b26)",
                border: "1px solid #e69a5a",
                boxShadow:
                  "inset 0 1px 0 rgba(255,225,190,.55),0 6px 16px rgba(198,85,43,.4)",
              }
            : {
                color: "#a99b85",
                background: "#0f0b07",
                border: "1px solid rgba(230,180,120,.24)",
                boxShadow: "none",
                opacity: 0.5,
                cursor: "default",
              }),
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

      {/* Share — item 3. Renamed from "Render & Share ▸": with a first-class Render
          button beside Commit, this control's only job is the share popover, and the old
          label promised a render it never started (the popover has no submit at all).
          `Share ▸` rather than a bare `Share` keeps the house copy rule (buttons are
          verb-first and specific) and the glyph grammar (▸ = opens something else),
          matching `Publish v0.0.2 ▸` next to it. The testid is UNCHANGED because
          studio-publish.e2e.ts E-RND1 identifies this control by it. */}
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
        {"Share ▸"}
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
