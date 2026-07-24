"use client";

import { useEffect } from "react";
import type { StudioProject } from "@/lib/studio/project";
import { isRenderComplete, RENDER_TICK_MS } from "@/lib/studio/render-model";
import { STORYBOARD_SLOT } from "@/lib/studio/reducer";
import { StudioProvider, useStudio } from "./studio-context";
import SceneTree from "./scene-tree";
import TopBar from "./top-bar";
import PlayerPanel from "./player-panel";
import SceneInspector from "./scene-inspector";
import Timeline from "./timeline";
import RerollMenu from "./reroll-menu";
import ShipMenu from "./ship-menu";
import VersionMenu from "./version-menu";
import PublishWizard from "./publish-wizard";
import RenderOverlay from "./render-overlay";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='140'%20height='140'%3E%3Cfilter%20id='n'%3E%3CfeTurbulence%20type='fractalNoise'%20baseFrequency='0.85'%20numOctaves='2'%20stitchTiles='stitch'/%3E%3C/filter%3E%3Crect%20width='100%25'%20height='100%25'%20filter='url(%23n)'/%3E%3C/svg%3E\")";

function StudioFrame() {
  const { state, dispatch } = useStudio();
  const menuOpen =
    state.rerollMenuOpen || state.shipMenuOpen || state.versionMenuOpen;

  // Dismiss whichever companion popover is open (reroll / ship / version) on
  // Escape or an outside pointerdown — mirroring the landing nav-auth dismiss.
  // There is NO blocking overlay, so a pointerdown on ANOTHER popover's trigger
  // is skipped here and reaches the trigger, whose click drives the reducer's
  // mutual exclusion to switch popovers in ONE click (the [2] fix). Clicks on an
  // open panel or any menu trigger are ignored; everything else closes.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target;
      if (
        t instanceof Element &&
        (t.closest("[data-menu-panel]") || t.closest("[data-menu-trigger]"))
      ) {
        return;
      }
      dispatch({ type: "CLOSE_MENUS" });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "CLOSE_MENUS" });
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, dispatch]);

  // The 14c render advance ticker lives HERE (not in RenderOverlay) so it is NOT
  // tied to the overlay's mount — a backgrounded render (overlay hidden) keeps
  // climbing to completion in reducer state, matching D-RENDER-DISMISS ("Run in
  // background" hides the surface while the mocked render advances to done). The
  // guard stops the ticker ONLY at terminal state (isRenderComplete) or when
  // there's no render; Cancel (render → null) stops it at once. Once complete no
  // further timeout is scheduled, so it can't loop or leak an interval past the
  // final frame — completion is state-only (no visible surface), so it's untested.
  useEffect(() => {
    const r = state.render;
    if (!r || isRenderComplete(r)) return;
    const t = setTimeout(() => dispatch({ type: "ADVANCE_RENDER" }), RENDER_TICK_MS);
    return () => clearTimeout(t);
  }, [state.render, dispatch]);

  return (
    <div
      data-testid="studio-frame"
      style={{
        // Flush to the viewport edges — the editor fills the browser frame with
        // no letterboxing (was a fixed 1300×950 card floating in the backdrop).
        // `fixed` escapes the page backdrop's centering + padding entirely.
        position: "fixed",
        inset: 0,
        background: "var(--ws-bg)",
        display: "flex",
        overflow: "hidden",
        fontFamily: "var(--font-barlow), sans-serif",
        color: "var(--ws-ink)",
      }}
    >
      {/* grain overlay — non-interactive so clicks pass through */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 40,
          opacity: 0.05,
          mixBlendMode: "overlay",
          backgroundImage: GRAIN,
          backgroundSize: "140px 140px",
        }}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          zIndex: 10,
        }}
      >
        <TopBar />
        {state.storyboard.scenes.length === 0 ? (
          <StudioEmpty />
        ) : (
          <>
            <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
              <SceneTree />
              <PlayerPanel />
              <SceneInspector />
            </div>
            <Timeline />
          </>
        )}
      </div>

      {state.rerollMenuOpen ? <RerollMenu /> : null}
      {state.shipMenuOpen ? <ShipMenu /> : null}
      {state.versionMenuOpen ? <VersionMenu /> : null}
      {state.publishFlow !== "closed" ? <PublishWizard /> : null}
      {state.render && !state.render.backgrounded ? <RenderOverlay /> : null}
    </div>
  );
}

/**
 * A freshly-scaffolded real project has an EMPTY manifest (`scenes: []`) until the
 * generation flow populates it, so the scene panels (which assume ≥1 scene) can't
 * render. Rather than crash, show a themed empty state that keeps the TopBar (identity
 * / back / version chip) live. Task #35 adds the FIRST-TIME generation entry point:
 * "Generate storyboard" → kind `storyboard` (populates the scenes, then Commit
 * persists them). A no-op for the mock catalog (no manifest).
 */
function StudioEmpty() {
  const { state, generateStoryboard, project } = useStudio();
  const status = state.generations[STORYBOARD_SLOT]?.status;
  const canGenerate = Boolean(project.manifest);

  return (
    <div
      data-testid="studio-empty"
      style={{
        flex: 1,
        display: "grid",
        placeItems: "center",
        padding: 40,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <div
          style={{
            fontFamily: "var(--font-anton), sans-serif",
            fontSize: 32,
            lineHeight: 1.05,
            color: "var(--ws-ink)",
          }}
        >
          {"NO SCENES YET"}
        </div>
        <div
          style={{
            fontFamily: "var(--font-zilla), 'Zilla Slab', Georgia, serif",
            fontSize: 15,
            lineHeight: 1.55,
            color: "var(--ws-dim)",
            marginTop: 12,
          }}
        >
          {
            "This project's storyboard is empty. Generate your scenes to start editing, then commit them to your version branch."
          }
        </div>
        {canGenerate ? (
          <div style={{ marginTop: 22 }}>
            <button
              type="button"
              data-testid="generate-storyboard"
              data-state={status ?? "idle"}
              disabled={status === "running"}
              onClick={generateStoryboard}
              style={{
                padding: "11px 22px",
                borderRadius: 9,
                fontFamily:
                  "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: ".05em",
                textTransform: "uppercase",
                color: "#fff",
                background: "linear-gradient(150deg,#d4a24c,#c0392b 55%,#6d3b26)",
                border: "1px solid #e69a5a",
                cursor: status === "running" ? "default" : "pointer",
                opacity: status === "running" ? 0.7 : 1,
              }}
            >
              {status === "running" ? "Generating…" : "✦ Generate storyboard"}
            </button>
            {status === "failed" ? (
              <div
                data-testid="generate-storyboard-error"
                style={{ marginTop: 10, fontSize: 12, color: "#e0745a" }}
              >
                {"Generation failed — try again"}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function StudioApp({ project }: { project: StudioProject }) {
  return (
    <StudioProvider project={project}>
      <StudioFrame />
    </StudioProvider>
  );
}
