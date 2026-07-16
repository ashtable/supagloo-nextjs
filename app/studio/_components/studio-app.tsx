"use client";

import { useEffect } from "react";
import type { Storyboard } from "@/lib/studio/storyboard";
import { StudioProvider, useStudio } from "./studio-context";
import NavRail from "./nav-rail";
import TopBar from "./top-bar";
import PlayerPanel from "./player-panel";
import SceneInspector from "./scene-inspector";
import Timeline from "./timeline";
import RerollMenu from "./reroll-menu";
import ShipMenu from "./ship-menu";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='140'%20height='140'%3E%3Cfilter%20id='n'%3E%3CfeTurbulence%20type='fractalNoise'%20baseFrequency='0.85'%20numOctaves='2'%20stitchTiles='stitch'/%3E%3C/filter%3E%3Crect%20width='100%25'%20height='100%25'%20filter='url(%23n)'/%3E%3C/svg%3E\")";

function StudioFrame() {
  const { state, dispatch } = useStudio();
  const menuOpen = state.rerollMenuOpen || state.shipMenuOpen;

  // Escape dismisses whichever companion popover is open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "CLOSE_MENUS" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, dispatch]);

  return (
    <div
      data-testid="studio-frame"
      style={{
        width: 1300,
        height: 950,
        background: "var(--ws-bg)",
        borderRadius: 16,
        border: "1px solid rgba(230,180,120,.16)",
        boxShadow: "0 40px 90px rgba(0,0,0,.45)",
        display: "flex",
        position: "relative",
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

      <NavRail />

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
          <PlayerPanel />
          <SceneInspector />
        </div>
        <Timeline />
      </div>

      {state.rerollMenuOpen ? <RerollMenu /> : null}
      {state.shipMenuOpen ? <ShipMenu /> : null}
    </div>
  );
}

export default function StudioApp({ storyboard }: { storyboard: Storyboard }) {
  return (
    <StudioProvider storyboard={storyboard}>
      <StudioFrame />
    </StudioProvider>
  );
}
