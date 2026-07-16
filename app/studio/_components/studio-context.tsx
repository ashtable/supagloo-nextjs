"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
} from "react";
import type { PlayerRef } from "@remotion/player";
import {
  initialStudioState,
  studioReducer,
  type StudioAction,
  type StudioState,
} from "@/lib/studio/reducer";
import { sceneEntryFrame, type Storyboard } from "@/lib/studio/storyboard";
import { useReducer } from "react";

interface StudioContextValue {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
  playerRef: RefObject<PlayerRef | null>;
  /** Select a scene AND seek the Player to its start (the side-effect the pure reducer omits). */
  selectScene: (id: string) => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({
  storyboard,
  children,
}: {
  storyboard: Storyboard;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    studioReducer,
    storyboard,
    initialStudioState,
  );
  const playerRef = useRef<PlayerRef>(null);

  const selectScene = (id: string) => {
    dispatch({ type: "SELECT_SCENE", id });
    // Seek to the scene's SETTLED entry frame (start + a clamped offset) so its
    // caption has faded in — seeking to the exact start lands on the invisible
    // fade-in frame 0 (the [0] bug).
    playerRef.current?.seekTo(
      sceneEntryFrame(state.storyboard, id, state.storyboard.fps),
    );
  };

  // A fresh value each render is fine: this provider re-renders only on editor
  // actions (select/edit/toggle/play-pause), never at the Player's 30Hz frame
  // rate — the current frame lives in local component state (see usePlayerFrame).
  const value: StudioContextValue = { state, dispatch, playerRef, selectScene };

  return (
    <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
  );
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within <StudioProvider>");
  return ctx;
}

/**
 * Subscribe to the Player's `frameupdate` (fires ~30×/s). Kept as isolated local
 * state so only the subscribing leaf (transport, scene chip, timeline playhead)
 * re-renders — never the whole editor tree.
 */
export function usePlayerFrame(
  playerRef: RefObject<PlayerRef | null>,
  initialFrame: number,
): number {
  const [frame, setFrame] = useState(initialFrame);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) =>
      setFrame(e.detail.frame);
    player.addEventListener("frameupdate", onFrame);
    return () => player.removeEventListener("frameupdate", onFrame);
  }, [playerRef]);
  return frame;
}
