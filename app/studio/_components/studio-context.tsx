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
  publishOutcome,
  MOCK_COMMIT_DELAY_MS,
  imageSlot,
  scriptSlot,
  STORYBOARD_SLOT,
  NARRATION_SLOT,
  MUSIC_SLOT,
  imageGenerationOutcome,
  scriptGenerationOutcome,
  narrationGenerationOutcome,
  musicGenerationOutcome,
  storyboardGenerationOutcome,
  type StudioAction,
  type StudioState,
} from "@/lib/studio/reducer";
import {
  sceneEntryFrame,
  narrationScenesOf,
  totalDurationSeconds,
} from "@/lib/studio/storyboard";
import type { StudioProject } from "@/lib/studio/project";
import {
  serializeManifest,
  commitMessage,
} from "@/lib/studio/manifest-adapter";
import { commitVersion, publishVersion } from "@/lib/studio/studio-data";
import {
  createGeneration,
  pollGenerationUntilTerminal,
  presignDownload,
  type CreateGenerationBody,
} from "@/lib/studio/ai-generation-data";
import type { AiGenerationDto } from "@/lib/api/contracts";
import { publishReview } from "@/lib/studio/publish-review";
import { pollJobUntilTerminal } from "@/lib/project-wizard/provision-effects";
import { stagesToLogRows } from "@/lib/project-wizard/job-log";
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
  // ── Task #35: AI generation triggers (real path when a manifest is present;
  //    a no-op for the mock catalog, exactly like commit/publish) ─────────────
  /** ↻ Reroll visual — POST kind `image` for a scene, poll, presign, update preview. */
  rerollVisual: (sceneId?: string) => void;
  /** ✍ Rewrite the script — POST kind `script` for a scene, poll, update the line. */
  rewriteScript: (sceneId?: string) => void;
  /** 🎬 Re-plan all scenes / first-time Generate — POST kind `storyboard`, replace scenes. */
  generateStoryboard: () => void;
  /** ↻ Regenerate narration — POST kind `narration` (whole-project), persist the asset. */
  regenerateNarration: () => void;
  /** ↻ Regenerate music — POST kind `music` (whole-project), persist the asset. */
  regenerateMusic: () => void;
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
  // Confirm publish (14a step 1 CTA). Mirrors `commit()`: MOCK catalog projects (no
  // source manifest) keep the mocked PR-dance ticker + two-step bump — the wizard's
  // own `useEffect` seeds/advances `publishLog` and fires PUBLISH_DONE. REAL projects
  // (a source manifest present) `POST /api/projects/:id/publish { message }`, poll the
  // publish ProjectJob (feeding its 7 stages into `publishStages`), and settle via
  // `publishOutcome` → PUBLISH_REAL_DONE (Model-A one-step bump) or PUBLISH_FAILED
  // (stays on the publishing step, retryable). The publish message is the reviewed
  // message shown in the review pane (no separate input — publish is one-click too).
  const confirmPublish = () => {
    if (state.publishing) return;

    const base = project.manifest;
    if (!base) {
      dispatch({ type: "PUBLISH_BEGIN" });
      return;
    }

    const branch = state.versionBranch;
    const message = publishReview(project).title || `Publish ${branch}`;
    dispatch({ type: "PUBLISH_REAL_BEGIN" });
    void (async () => {
      const jobId = await publishVersion(project.id, message);
      if (!aliveRef.current) return;
      if (!jobId) {
        dispatch(publishOutcome(null, branch));
        return;
      }
      const job = await pollJobUntilTerminal(project.id, jobId, {
        onUpdate: (j) => {
          if (aliveRef.current) {
            dispatch({ type: "PUBLISH_STAGES", rows: stagesToLogRows(j.stages) });
          }
        },
      });
      if (!aliveRef.current) return;
      dispatch(publishOutcome(job, branch));
    })();
  };
  const closePublish = () => dispatch({ type: "CLOSE_PUBLISH" });
  const toggleVersionMenu = () => dispatch({ type: "TOGGLE_VERSION_MENU" });
  const startRender = () => dispatch({ type: "OPEN_RENDER" });
  const backgroundRender = () => dispatch({ type: "RENDER_BACKGROUND" });
  const cancelRender = () => dispatch({ type: "CANCEL_RENDER" });

  // ── AI generation (design-delta §6b) ────────────────────────────────────────
  // Shared driver, mirroring commit()/confirmPublish(): dispatch GENERATION_BEGIN,
  // then a guarded async POST → poll → (media: presign) → settle. Guarded by the
  // mounted `aliveRef` so a late resolve never dispatches into a dead reducer. A
  // media generation presigns the terminal `resultAssetKey` for the scene preview.
  const runGeneration = (
    slot: string,
    body: CreateGenerationBody,
    settle: (gen: AiGenerationDto | null, url: string | null) => StudioAction,
    presignResult: boolean,
  ) => {
    if (state.generations[slot]?.status === "running") return;
    dispatch({ type: "GENERATION_BEGIN", slot });
    void (async () => {
      const genId = await createGeneration(body);
      if (!aliveRef.current) return;
      if (!genId) {
        dispatch(settle(null, null));
        return;
      }
      const gen = await pollGenerationUntilTerminal(genId);
      if (!aliveRef.current) return;
      let url: string | null = null;
      if (presignResult && gen?.status === "succeeded" && gen.resultAssetKey) {
        url = await presignDownload(gen.resultAssetKey);
        if (!aliveRef.current) return;
      }
      dispatch(settle(gen, url));
    })();
  };

  const rerollVisual = (sceneId?: string) => {
    if (!project.manifest) return; // mock catalog: no real generation
    const id = sceneId ?? state.selectedSceneId;
    const scene = state.storyboard.scenes.find((s) => s.id === id);
    if (!scene) return;
    runGeneration(
      imageSlot(id),
      {
        kind: "image",
        projectId: project.id,
        sceneId: id,
        input: { prompt: scene.visualPrompt },
      },
      (gen, url) => imageGenerationOutcome(id, gen, url),
      true,
    );
  };

  const rewriteScript = (sceneId?: string) => {
    if (!project.manifest) return;
    const id = sceneId ?? state.selectedSceneId;
    const scene = state.storyboard.scenes.find((s) => s.id === id);
    if (!scene) return;
    const baseScene = project.manifest.scenes.find((x) => x.id === id);
    const input: { brief: string; scripture?: { reference: string; translation: string; language: string } } = {
      brief: `Rewrite the narration line for this scene, staying faithful to the scripture. Current line: "${scene.script}".`,
    };
    if (baseScene) {
      input.scripture = {
        reference: baseScene.reference,
        translation: baseScene.translation,
        language: "eng",
      };
    }
    runGeneration(
      scriptSlot(id),
      { kind: "script", projectId: project.id, sceneId: id, input },
      (gen) => scriptGenerationOutcome(id, gen),
      false,
    );
  };

  const generateStoryboard = () => {
    if (!project.manifest) return;
    const firstScene = project.manifest.scenes[0];
    const input: { brief: string; scripture?: { reference: string; translation: string; language: string } } = {
      brief: state.storyboard.reference
        ? `Plan a short scripture-video storyboard for ${state.storyboard.reference}.`
        : `Plan a short scripture-video storyboard for ${project.projectName}.`,
    };
    if (firstScene) {
      input.scripture = {
        reference: firstScene.reference,
        translation: firstScene.translation,
        language: "eng",
      };
    }
    runGeneration(
      STORYBOARD_SLOT,
      { kind: "storyboard", projectId: project.id, input },
      (gen) => storyboardGenerationOutcome(gen, state.storyboard),
      false,
    );
  };

  const regenerateNarration = () => {
    if (!project.manifest) return;
    const scenes = narrationScenesOf(state.storyboard);
    if (scenes.length === 0) return;
    const voice: { description: string; label?: string } = {
      description: state.storyboard.voiceDescription,
    };
    if (state.storyboard.voiceLabel) voice.label = state.storyboard.voiceLabel;
    runGeneration(
      NARRATION_SLOT,
      { kind: "narration", projectId: project.id, input: { voice, scenes } },
      (gen, url) => narrationGenerationOutcome(gen, url),
      true,
    );
  };

  const regenerateMusic = () => {
    if (!project.manifest) return;
    runGeneration(
      MUSIC_SLOT,
      {
        kind: "music",
        projectId: project.id,
        input: {
          style: state.storyboard.musicMood || "Cinematic score",
          durationSeconds: totalDurationSeconds(state.storyboard) || 30,
        },
      },
      (gen, url) => musicGenerationOutcome(gen, url),
      true,
    );
  };

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
    rerollVisual,
    rewriteScript,
    generateStoryboard,
    regenerateNarration,
    regenerateMusic,
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
