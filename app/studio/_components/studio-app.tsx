"use client";

import { useEffect } from "react";
import type { StudioProject } from "@/lib/studio/project";
import { isRenderComplete, RENDER_TICK_MS } from "@/lib/studio/render-model";
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

  // The 14c render advance ticker lives HERE (not in RenderOverlay) so it is not
  // tied to the overlay's mount. It PAUSES while backgrounded — the overlay is
  // hidden then and nothing observes the frame count, so continuing to churn the
  // DOM would only race the understudy's node geometry in later tests for no
  // visible benefit (backgrounded completion is state-only and untested). It
  // resumes if the overlay is reopened. Cancel (render → null) stops it at once.
  useEffect(() => {
    const r = state.render;
    if (!r || r.backgrounded || isRenderComplete(r)) return;
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
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <SceneTree />
          <PlayerPanel />
          <SceneInspector />
        </div>
        <Timeline />
      </div>

      {state.rerollMenuOpen ? <RerollMenu /> : null}
      {state.shipMenuOpen ? <ShipMenu /> : null}
      {state.versionMenuOpen ? <VersionMenu /> : null}
      {state.publishFlow !== "closed" ? <PublishWizard /> : null}
      {state.render && !state.render.backgrounded ? <RenderOverlay /> : null}
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
