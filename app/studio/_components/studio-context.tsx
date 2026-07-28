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
  renderOutcome,
  type StudioAction,
  type StudioState,
} from "@/lib/studio/reducer";
import {
  sceneEntryFrame,
  narrationScenesOf,
  totalDurationSeconds,
} from "@/lib/studio/storyboard";
import {
  projectWithManifest,
  publishedVersion,
  type StudioProject,
} from "@/lib/studio/project";
import {
  IDLE_RENDER_RUN_GATE,
  abandonRenderRun,
  canStartRender,
  finishRenderRun,
  isActiveRenderRun,
  pickRenderVersion,
  renderOutputSpecFor,
  startRenderRun,
  type RenderRunGate,
} from "@/lib/studio/render-model";
import {
  startRenderJob,
  cancelRenderJob,
  fetchRenderDownloadUrl,
  pollRenderUntilTerminal,
} from "@/lib/studio/render-data";
import {
  serializeManifest,
  commitMessage,
  sceneScriptureContext,
} from "@/lib/studio/manifest-adapter";
import {
  commitVersion,
  publishVersion,
  fetchVersions,
} from "@/lib/studio/studio-data";
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
  /** D3: add a scene after the selected one (bounded at MAX_SCENES by the model). */
  addScene: () => void;
  /** D3: delete a scene (bounded at MIN_SCENES by the model). */
  removeScene: (id: string) => void;
  /** Item 1: write a picked verse (script + reference + translation) onto the
   *  selected scene as one edit. */
  pickScripture: (pick: {
    script: string;
    reference: string;
    translation: string;
  }) => void;
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
  /** 14c: abort the render (optimistic close + a real cancel behind it). */
  cancelRender: () => void;
  /** 14c: dismiss a TERMINAL render card (complete / failed). */
  closeRender: () => void;
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
  project: initialProject,
  children,
}: {
  project: StudioProject;
  children: ReactNode;
}) {
  // Task #57: `project` lives in state (init from the prop) so a successful commit can
  // REFRESH `project.manifest` to the just-committed one. The prop was never refreshed,
  // so `rewriteScript`/`generateStoryboard` (which read `project.manifest` for scripture)
  // and the next commit's merge base kept reading the stale pre-commit manifest.
  const [project, setProject] = useState(initialProject);
  const [state, dispatch] = useReducer(
    studioReducer,
    initialProject,
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
  // The render in-flight guard. It CANNOT live in `state`: `startRender` is a function
  // object closed over the `state` snapshot of the render that created it, so
  // `closeRender()`/`cancelRender()` — which only dispatch — can never clear a
  // `if (state.render) return` guard for the closure that reads it next. That is what
  // made the failure card's "Try again ▸" a dead button. See `RenderRunGate` in
  // lib/studio/render-model.ts for the full rules; they are pure and unit-tested there
  // (U-RM20..23). NOTE: the unit lane's default is still `environment: "node"`, but a
  // `.test.tsx` can now opt into jsdom (`// @vitest-environment jsdom`, see
  // tests/unit/support/render.tsx), so "not component-testable" is no longer why —
  // these rules are simply better held as pure ones.
  const renderRunRef = useRef<RenderRunGate>(IDLE_RENDER_RUN_GATE);

  /**
   * Task item 7: keep the version rows in state so the top bar can answer "is there
   * anything to publish?".
   *
   * Refreshed on mount and after every LANDED commit/publish, because those are the only
   * two things that move `headCommitSha`. Real projects only — the mock catalogue has no
   * versions endpoint and disabling Publish there would break `E-PUB4`/`E-SP3`.
   *
   * A failed read dispatches `null`, which the gate reads as "undecidable" and leaves the
   * button live. Never a stale answer that could deaden Publish forever.
   */
  const refreshVersions = () => {
    if (!project.manifest) return;
    void (async () => {
      const versions = await fetchVersions(project.id);
      if (aliveRef.current) dispatch({ type: "VERSIONS_LOADED", versions });
    })();
  };
  const hasManifest = Boolean(project.manifest);
  useEffect(() => {
    if (!hasManifest) return;
    void (async () => {
      const versions = await fetchVersions(project.id);
      if (aliveRef.current) dispatch({ type: "VERSIONS_LOADED", versions });
    })();
  }, [project.id, hasManifest]);

  const addScene = () => dispatch({ type: "ADD_SCENE" });
  const removeScene = (id: string) => dispatch({ type: "DELETE_SCENE", id });
  const pickScripture = (pick: {
    script: string;
    reference: string;
    translation: string;
  }) => dispatch({ type: "PICK_SCRIPTURE", ...pick });

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
      // Task #57: on a landed commit, refresh `project.manifest` to what we just
      // committed so subsequent scripture reads (rewriteScript / generateStoryboard /
      // the next commit's merge base) see the new scenes, not the stale prop.
      if (job?.status === "succeeded") {
        setProject((p) => projectWithManifest(p, manifest));
        // A landed commit moves the working row's `headCommitSha`, which is exactly what
        // the Publish gate reads — re-read it or Publish stays disabled after the very
        // commit that made it publishable.
        refreshVersions();
      }
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
      // Publish rewrites the whole version table (old working → published, a fresh
      // working row cut from main), so the gate's inputs are stale the moment it lands.
      if (job?.status === "succeeded") refreshVersions();
    })();
  };
  const closePublish = () => dispatch({ type: "CLOSE_PUBLISH" });
  const toggleVersionMenu = () => dispatch({ type: "TOGGLE_VERSION_MENU" });

  // Start a render (14a step-3 CTA → the 14c overlay). Mirrors commit()/confirmPublish():
  // MOCK catalog projects (no source manifest) keep the fake frame ticker; REAL projects
  // resolve the version, `POST /api/projects/:id/renders`, and poll `GET /api/renders/:id`
  // to a terminal status, feeding every read into the overlay.
  //
  // The driver lives HERE, in the provider — which sits ABOVE StudioFrame and stays
  // mounted whether or not the overlay is rendered — so "Run in background" (which only
  // hides the overlay) cannot interrupt polling. Same `aliveRef` guard as every other
  // async flow: a late resolve must never dispatch into a dead reducer.
  const startRender = () => {
    // One render at a time — read off the REF, never `state` (see `renderRunRef` above:
    // a `state`-based guard is permanently latched for the failure card's retry, whose
    // whole job is to start a render while `state.render` is non-null). `OPEN_RENDER_REAL`
    // reseeds `render` wholesale, so retrying needs no CLOSE_RENDER first.
    if (!canStartRender(renderRunRef.current)) return;
    const started = startRenderRun(renderRunRef.current);
    const myRun = started.run;
    renderRunRef.current = started.gate;

    /** May THIS driver still write? Mounted AND still the active run — an abandoned
     *  driver (cancelled, or superseded by a retry) must never dispatch into a newer
     *  render. `RENDER_POLLED` has an id guard in the reducer; `renderOutcome`,
     *  `RENDER_FAILED` and `RENDER_DOWNLOAD_READY` have none, so this is theirs. */
    const mine = () =>
      aliveRef.current && isActiveRenderRun(renderRunRef.current, myRun);
    /** Release the gate — conditional, so a late release from an abandoned run cannot
     *  clear the gate of the render that replaced it. */
    const release = () => {
      renderRunRef.current = finishRenderRun(renderRunRef.current, myRun);
    };

    const tag =
      state.lastPublishedVersion ?? publishedVersion(state.versionBranch);

    if (!project.manifest) {
      // MOCK: the fake ticker in StudioFrame owns the lifecycle, so nothing async holds
      // the gate — `cancelRender`/`closeRender` release it.
      dispatch({ type: "OPEN_RENDER" });
      return;
    }

    const branch = state.versionBranch;
    const outputSpec = renderOutputSpecFor(state.aspect, state.storyboard.fps);
    dispatch({ type: "OPEN_RENDER_REAL", publishedVersion: tag });
    void (async () => {
      try {
        // The studio holds a branch name and a tag, never a ProjectVersion cuid — the id
        // comes from the same versions list the 14b dropdown reads.
        const versions = await fetchVersions(project.id);
        if (!mine()) return;
        const version = pickRenderVersion(versions, state.lastPublishedVersion, branch);
        if (!version) {
          dispatch({ type: "RENDER_FAILED", error: "no_version" });
          return;
        }

        const renderJobId = await startRenderJob(project.id, {
          versionId: version.id,
          outputSpec,
          runInBackground: false,
        });
        if (!mine()) return;
        if (!renderJobId) {
          dispatch({ type: "RENDER_FAILED", error: "render_start_failed" });
          return;
        }
        dispatch({ type: "RENDER_STARTED", renderJobId });

        const job = await pollRenderUntilTerminal(renderJobId, {
          onUpdate: (j) => {
            if (mine()) {
              dispatch({
                type: "RENDER_POLLED",
                renderJobId,
                job: j,
                atMs: Date.now(),
              });
            }
          },
        });
        if (!mine()) return;
        dispatch(renderOutcome(renderJobId, job, Date.now()));

        // The download link is a separate presign (the API is the only S3 signer).
        if (job?.status === "completed") {
          const url = await fetchRenderDownloadUrl(renderJobId);
          if (mine() && url) {
            dispatch({ type: "RENDER_DOWNLOAD_READY", url });
          }
        }
      } finally {
        // EVERY exit path releases the gate — the two RENDER_FAILED returns, the terminal
        // outcome, an early `!mine()` bail (a no-op there, by design), and a throw. A
        // driver that dies without releasing would make the retry CTA dead all over again.
        release();
      }
    })();
  };

  const backgroundRender = () => dispatch({ type: "RENDER_BACKGROUND" });

  // Cancel is OPTIMISTIC (D-RENDER-DISMISS): the overlay clears immediately and the real
  // POST goes out behind it. The API cancels the DBOS workflow first and then flips the
  // row conditionally, so a render that finished in the window is never mislabeled. A
  // poll still in flight is absorbed by the reducer's RENDER_POLLED guard.
  const cancelRender = () => {
    const id = state.render?.renderJobId ?? null;
    // Release the run gate here, not just in the driver: the abandoned poll loop keeps
    // running until it observes a terminal status or exhausts its 30-MINUTE budget, and a
    // gate held for that long would make "start another render" dead — trading one dead
    // button for another. The abandoned driver's own dispatches are already fenced off by
    // its run token, so releasing early is safe.
    renderRunRef.current = abandonRenderRun(renderRunRef.current);
    dispatch({ type: "CANCEL_RENDER" });
    if (id) void cancelRenderJob(id);
  };

  const closeRender = () => {
    // Same reason. A terminal card's driver has usually released already (this is then a
    // no-op), but "Back to studio" must leave the studio able to render again in every
    // case — including a driver still fetching the download presign.
    renderRunRef.current = abandonRenderRun(renderRunRef.current);
    dispatch({ type: "CLOSE_RENDER" });
  };

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
    // Task #57: read the scene's scripture from the CURRENT (post-commit-refreshed)
    // manifest, not the never-refreshed prop that used to reattach a stale reference.
    const scripture = sceneScriptureContext(project.manifest, id);
    const input: { brief: string; scripture?: { reference: string; translation: string; language: string } } = {
      brief: `Rewrite the narration line for this scene, staying faithful to the scripture. Current line: "${scene.script}".`,
    };
    if (scripture) input.scripture = scripture;
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
    // Task #57: seed from the current manifest's first scene (refreshed post-commit).
    const scripture = firstScene
      ? sceneScriptureContext(project.manifest, firstScene.id)
      : undefined;
    if (scripture) input.scripture = scripture;
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
    addScene,
    removeScene,
    pickScripture,
    commit,
    openPublish,
    confirmPublish,
    closePublish,
    toggleVersionMenu,
    startRender,
    backgroundRender,
    cancelRender,
    closeRender,
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
