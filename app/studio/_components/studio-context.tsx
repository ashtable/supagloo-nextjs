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
  commitOutcome,
  MOCK_COMMIT_DELAY_MS,
  type StudioAction,
  type StudioState,
} from "@/lib/studio/reducer";
import { sceneEntryFrame } from "@/lib/studio/storyboard";
import type { StudioProject } from "@/lib/studio/project";
import {
  serializeManifest,
  commitMessage,
} from "@/lib/studio/manifest-adapter";
import { commitVersion } from "@/lib/studio/studio-data";
import { pollJobUntilTerminal } from "@/lib/project-wizard/provision-effects";
import { useReducer } from "react";

interface StudioContextValue {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
  playerRef: RefObject<PlayerRef | null>;
  /** Immutable project identity (id / name / repo) read from the route. */
  project: StudioProject;
  /** Select a scene AND seek the Player to its start (the side-effect the pure reducer omits). */
  selectScene: (id: string) => void;
  /** Mocked-async Commit — pends, then clears `dirty` (D-COMMIT-PUBLISH). */
  commit: () => void;
  // ── Turn 14 overlay drivers (the wizard/overlay components own the tickers) ──
  /** 14a: open the publish wizard's review step (the Publish button's action). */
  openPublish: () => void;
  /** 14a: begin publishing (step-1 CTA → seeds the log, starts the ticker). */
  confirmPublish: () => void;
  /** 14a: close the publish wizard (step-1 ✕/Cancel/backdrop, step-3 ✕). */
  closePublish: () => void;
  /** 14b: toggle the version dropdown (mutually exclusive with reroll/ship). */
  toggleVersionMenu: () => void;
  /** 14c: open the render overlay (14a step-3 CTA → seeds the render). */
  startRender: () => void;
  /** 14c: hide the overlay while the render keeps ticking in state. */
  backgroundRender: () => void;
  /** 14c: abort + clear the render. */
  cancelRender: () => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({
  project,
  children,
}: {
  project: StudioProject;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    studioReducer,
    project,
    initialStudioState,
  );
  const playerRef = useRef<PlayerRef>(null);
  // Mounted guard for the async commit flow (the task-26 `drivePolling` idiom): a
  // commit that resolves after the editor unmounts must not dispatch into a dead
  // reducer.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const selectScene = (id: string) => {
    dispatch({ type: "SELECT_SCENE", id });
    // Seek to the scene's SETTLED entry frame (start + a clamped offset) so its
    // caption has faded in — seeking to the exact start lands on the invisible
    // fade-in frame 0 (the [0] bug).
    playerRef.current?.seekTo(
      sceneEntryFrame(state.storyboard, id, state.storyboard.fps),
    );
  };

  // Commit (D-1/D-2). MOCK catalog projects (no source manifest) keep the mocked
  // pending→settled timer — the reducer stays pure; the side-effect lives here,
  // matching the Turn 5/5a precedent. REAL projects (a source manifest is present)
  // serialize the edited manifest, `POST /api/projects/:id/commit`, and poll the
  // commit ProjectJob to a terminal status — `commitOutcome` maps that to
  // COMMIT_DONE (clean) or COMMIT_FAILED (stays dirty, retryable). One-click: the
  // commit message is auto-generated from the edit (publish is the reviewed step).
  const commit = () => {
    if (state.committing) return;

    const base = project.manifest;
    if (!base) {
      dispatch({ type: "COMMIT_BEGIN" });
      setTimeout(() => dispatch({ type: "COMMIT_DONE" }), MOCK_COMMIT_DELAY_MS);
      return;
    }

    const manifest = serializeManifest(state.storyboard, base);
    const message = commitMessage(state.storyboard, base);
    dispatch({ type: "COMMIT_BEGIN" });
    void (async () => {
      const jobId = await commitVersion(project.id, manifest, message);
      if (!aliveRef.current) return;
      if (!jobId) {
        dispatch(commitOutcome(null));
        return;
      }
      const job = await pollJobUntilTerminal(project.id, jobId);
      if (!aliveRef.current) return;
      dispatch(commitOutcome(job));
    })();
  };
  const openPublish = () => dispatch({ type: "OPEN_PUBLISH" });
  const confirmPublish = () => dispatch({ type: "PUBLISH_BEGIN" });
  const closePublish = () => dispatch({ type: "CLOSE_PUBLISH" });
  const toggleVersionMenu = () => dispatch({ type: "TOGGLE_VERSION_MENU" });
  const startRender = () => dispatch({ type: "OPEN_RENDER" });
  const backgroundRender = () => dispatch({ type: "RENDER_BACKGROUND" });
  const cancelRender = () => dispatch({ type: "CANCEL_RENDER" });

  // A fresh value each render is fine: this provider re-renders only on editor
  // actions (select/edit/toggle/play-pause), never at the Player's 30Hz frame
  // rate — the current frame lives in local component state (see usePlayerFrame).
  const value: StudioContextValue = {
    state,
    dispatch,
    playerRef,
    project,
    selectScene,
    commit,
    openPublish,
    confirmPublish,
    closePublish,
    toggleVersionMenu,
    startRender,
    backgroundRender,
    cancelRender,
  };

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
