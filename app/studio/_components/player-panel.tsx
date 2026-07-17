"use client";

import { useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import styles from "../studio.module.css";
import { useStudio } from "./studio-context";
import { StoryboardVideo, type StoryboardVideoProps } from "./storyboard-video";
import { aspectDimensions, fitDisplayBox } from "@/lib/studio/aspect";
import {
  sceneAtFrame,
  sceneBoundaryFractions,
  sceneEntryFrame,
  totalDurationSeconds,
  totalFrames,
} from "@/lib/studio/storyboard";
import { formatTimecode, framesToSeconds } from "@/lib/studio/time";

// Display bounds for the 9:16 frame (matches the 300×534 wireframe); other
// aspects fit within these bounds preserving ratio.
const MAX_W = 300;
const MAX_H = 534;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export default function PlayerPanel() {
  const { state, dispatch, playerRef } = useStudio();
  const { storyboard, aspect, isPlaying, selectedSceneId } = state;
  const fps = storyboard.fps;
  // Single source of truth for the composition length (sum of per-scene rounded
  // frame counts) — matches the composition's <Sequence> layout, so the Player,
  // the scrubber clamp, and the timeline never diverge (the [4] fix).
  const durationInFrames = totalFrames(storyboard, fps);
  // Open mid the SELECTED scene (derived from state, not a hardcoded "s2") so its
  // caption is faded in and visible on load (the [0]/[3] fix).
  const initialFrame = sceneEntryFrame(storyboard, selectedSceneId, fps);

  const [frame, setFrame] = useState(initialFrame);

  const comp = aspectDimensions(aspect);
  const box = fitDisplayBox(aspect, MAX_W, MAX_H);

  const inputProps = useMemo<StoryboardVideoProps>(
    () => ({
      scenes: storyboard.scenes,
      reference: storyboard.reference,
      fps,
    }),
    [storyboard.scenes, storyboard.reference, fps],
  );

  // Drive transport state (play/pause) and the local frame from Player events.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) =>
      setFrame(e.detail.frame);
    const onPlay = () => dispatch({ type: "PLAY" });
    const onPause = () => dispatch({ type: "PAUSE" });
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  }, [playerRef, dispatch]);

  const currentScene = sceneAtFrame(storyboard, frame, fps);
  const progress = durationInFrames > 0 ? frame / durationInFrames : 0;
  const ticks = sceneBoundaryFractions(storyboard);
  const lastFrame = Math.max(0, durationInFrames - 1);

  const seekTo = (target: number) => {
    playerRef.current?.seekTo(Math.max(0, Math.min(lastFrame, target)));
  };

  const seekToClientX = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    seekTo(Math.round(fraction * durationInFrames));
  };

  // [1] The scrubber is a keyboard-operable slider: arrows nudge by a step, Home
  // and End jump to the ends. seekTo → frameupdate keeps `frame` (and thus the
  // aria-valuenow / data-current-frame seams) in sync. Read the live frame from
  // the Player so repeated presses compound correctly.
  const step = Math.max(1, Math.round(fps)); // ~1 second per arrow press
  const onScrubberKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const cur = playerRef.current?.getCurrentFrame() ?? frame;
    let target: number;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        target = cur - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        target = cur + step;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = lastFrame;
        break;
      default:
        return;
    }
    e.preventDefault();
    seekTo(target);
  };

  return (
    <div
      data-testid="player-panel"
      data-aspect={aspect}
      data-comp-w={comp.width}
      data-comp-h={comp.height}
      data-playing={isPlaying ? "true" : "false"}
      data-current-frame={frame}
      style={{
        // §7 D-13B-LAYOUT: the player column is the center flex-filler (was a
        // fixed 434px). The visual is still capped + centered by MAX_W, so it
        // sits center-stage in the wider column.
        flex: 1,
        minWidth: 0,
        padding: 26,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        background:
          "radial-gradient(120% 80% at 50% 0%,rgba(60,42,28,.5),transparent 60%)",
      }}
    >
      <div
        data-testid="player-frame"
        style={{
          width: box.width,
          height: box.height,
          borderRadius: 12,
          position: "relative",
          overflow: "hidden",
          border: "1px solid rgba(230,180,120,.25)",
          boxShadow: "0 24px 60px rgba(0,0,0,.6)",
          background: "#160f14",
        }}
      >
        <Player
          ref={playerRef}
          component={StoryboardVideo}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          fps={fps}
          compositionWidth={comp.width}
          compositionHeight={comp.height}
          initialFrame={initialFrame}
          controls={false}
          clickToPlay={false}
          spaceKeyToPlayOrPause={false}
          acknowledgeRemotionLicense
          style={{ width: "100%", height: "100%" }}
        />

        {/* DOM overlay chrome (not part of the rendered video) */}
        <div
          data-testid="scene-chip"
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            zIndex: 2,
            fontFamily:
              "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: ".16em",
            color: "#fff",
            background: "rgba(198,85,43,.9)",
            padding: "4px 9px",
            borderRadius: 5,
            boxShadow: "0 2px 8px rgba(0,0,0,.4)",
          }}
        >
          {`SCENE ${pad2(currentScene.index)} / ${pad2(storyboard.scenes.length)}`}
        </div>
        <div
          style={{
            position: "absolute",
            top: 43,
            left: 14,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontFamily:
              "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
            fontWeight: 600,
            fontSize: 9,
            letterSpacing: ".12em",
            color: "rgba(255,240,220,.9)",
            background: "rgba(20,12,6,.55)",
            padding: "3px 8px",
            borderRadius: 5,
          }}
        >
          {"🔊 NARRATED · JEJ-STYLE"}
        </div>
        <div
          style={{
            position: "absolute",
            top: 15,
            right: 14,
            zIndex: 2,
            fontFamily:
              "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
            fontWeight: 600,
            fontSize: 9.5,
            letterSpacing: ".14em",
            color: "rgba(255,240,220,.8)",
            border: "1px solid rgba(255,240,220,.35)",
            padding: "3px 8px",
            borderRadius: 20,
          }}
        >
          {"ROUGH"}
        </div>
      </div>

      {/* transport */}
      <div
        style={{
          width: 300,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <button
          type="button"
          data-testid="transport-play"
          aria-label={isPlaying ? "Pause" : "Play"}
          aria-pressed={isPlaying}
          onClick={() => playerRef.current?.toggle()}
          className={styles.hoverable}
          style={{
            width: 44,
            height: 44,
            flex: "none",
            borderRadius: "50%",
            background: "linear-gradient(180deg,#e07a3e,#c6552b)",
            border: "1px solid #e69a5a",
            boxShadow:
              "inset 0 1px 0 rgba(255,225,190,.5),0 6px 14px rgba(198,85,43,.4)",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            fontSize: 15,
            paddingLeft: isPlaying ? 0 : 3,
          }}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>

        <div
          role="slider"
          aria-label="Scrubber"
          aria-valuemin={0}
          aria-valuemax={durationInFrames}
          aria-valuenow={frame}
          tabIndex={0}
          onClick={seekToClientX}
          onKeyDown={onScrubberKeyDown}
          style={{
            flex: 1,
            position: "relative",
            height: 6,
            borderRadius: 3,
            background: "rgba(230,180,120,.16)",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${progress * 100}%`,
              background: "linear-gradient(90deg,#c6552b,#e6a43b)",
              borderRadius: 3,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${progress * 100}%`,
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 2px 6px rgba(0,0,0,.5)",
            }}
          />
          {ticks.map((t, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${t * 100}%`,
                top: -4,
                bottom: -4,
                width: 1,
                background: "rgba(230,180,120,.35)",
              }}
            />
          ))}
        </div>

        <span
          style={{
            fontFamily:
              "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
            fontWeight: 600,
            fontSize: 12,
            color: "#a99b85",
            letterSpacing: ".04em",
            whiteSpace: "nowrap",
          }}
        >
          {`${formatTimecode(framesToSeconds(frame, fps))} / ${formatTimecode(
            totalDurationSeconds(storyboard),
          )}`}
        </span>
      </div>
    </div>
  );
}
