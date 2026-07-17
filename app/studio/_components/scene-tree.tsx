"use client";

import styles from "../studio.module.css";
import { useStudio } from "./studio-context";
import { sceneTreeLabel } from "@/lib/studio/storyboard";
import { aspectDimensions } from "@/lib/studio/aspect";

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const MONO = "ui-monospace, Menlo, monospace";

/**
 * §7 — the 236px COMPOSITION panel that replaces the deleted nav-rail
 * (D-NAVRAIL-REPLACE). Its rows are a SECOND surface onto the SAME `selectScene`
 * (D-SCENE-TREE-SELECTION): no parallel selection state — the selected styling
 * reads the one `selectedSceneId` the timeline/inspector/player also read.
 * Structure is DERIVED from the real storyboard (root · audio · N real scenes ·
 * add), NOT transcribed from the wireframe's Psalm mock, and drops a separate
 * EndCard node (the model's final scene IS the end card — §7.5). Warm skin.
 */
export default function SceneTree() {
  const { state, project, selectScene } = useStudio();
  const { storyboard, selectedSceneId, aspect } = state;
  const dims = aspectDimensions(aspect);

  return (
    <div
      data-testid="scene-tree"
      style={{
        width: 236,
        flex: "none",
        background: "linear-gradient(180deg,#1d160f,#130e09)",
        borderRight: "1px solid rgba(230,180,120,.12)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          height: 40,
          flex: "none",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          fontFamily: SEMI,
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: ".18em",
          color: "#a99b85",
          borderBottom: "1px solid rgba(230,180,120,.12)",
        }}
      >
        {"COMPOSITION"}
      </div>

      <div
        style={{
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflow: "auto",
        }}
      >
        {/* root — 🎬 project + derived aspect dimensions (tracks the toggle) */}
        <div
          data-testid="scene-tree-root"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            color: "#f1e7d6",
          }}
        >
          <span style={{ color: "#7a6650", fontSize: 10 }}>{"▾"}</span>
          <span>{"🎬 "}{project.projectName}</span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 400,
              color: "#a99b85",
            }}
          >
            {`${dims.width}×${dims.height}`}
          </span>
        </div>

        {/* whole-video audio node — inert, maps to a real whole-video property */}
        <div
          data-testid="scene-tree-audio"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px 7px 26px",
            borderRadius: 8,
            fontSize: 12.5,
            color: "#a99b85",
          }}
        >
          {"◷ AudioTrack"}
        </div>

        {/* the real scenes — a second surface onto selectScene */}
        {storyboard.scenes.map((scene) => {
          const selected = scene.id === selectedSceneId;
          return (
            <button
              key={scene.id}
              type="button"
              data-testid="scene-tree-row"
              data-scene-id={scene.id}
              data-selected={selected ? "true" : "false"}
              aria-pressed={selected}
              onClick={() => selectScene(scene.id)}
              className={styles.hoverable}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px 7px 26px",
                borderRadius: 8,
                fontSize: 12.5,
                textAlign: "left",
                fontWeight: selected ? 600 : 400,
                color: selected ? "#f1e7d6" : "#a99b85",
                background: selected ? "rgba(198,85,43,.14)" : "transparent",
                border: selected
                  ? "1px solid rgba(198,85,43,.34)"
                  : "1px solid transparent",
              }}
            >
              {`▦ ${sceneTreeLabel(scene)}`}
            </button>
          );
        })}

        {/* inert add affordance */}
        <div
          data-testid="scene-tree-add"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "8px 10px",
            marginTop: 6,
            border: "1px dashed rgba(230,180,120,.24)",
            borderRadius: 8,
            fontSize: 12,
            color: "#a99b85",
          }}
        >
          {"＋ Add scene"}
        </div>
      </div>
    </div>
  );
}
