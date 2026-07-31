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
  videoSlot,
  videoGenerationOutcome,
  scriptGenerationOutcome,
  narrationGenerationOutcome,
  musicGenerationOutcome,
  storyboardGenerationOutcome,
  renderOutcome,
  activeGeneration,
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
import { serializeManifest, commitMessage } from "@/lib/studio/manifest-adapter";
import {
  scriptGenerationInput,
  storyboardGenerationInput,
} from "@/lib/studio/generation-input";
import {
  commitVersion,
  publishVersion,
  fetchVersions,
} from "@/lib/studio/studio-data";
import {
  createGeneration,
  pollGenerationUntilTerminal,
  presignDownload,
  cancelGeneration as cancelGenerationRequest,
  type CreateGenerationBody,
  type PresignedAsset,
} from "@/lib/studio/ai-generation-data";
import { fetchModelCatalogue } from "@/lib/studio/model-catalogue-data";
import {
  shouldWarnBeforeVideo,
  suppressVideoWarning,
} from "@/lib/studio/video-warning-preference";
import { refreshStalePresigns } from "@/lib/studio/presign-refresh-driver";
import { EMPTY_RESIGN_LEDGER } from "@/lib/studio/presign-refresh";
import {
  resolveChoice,
  type SelectableKind,
} from "@/lib/studio/ai-settings";
import { effectiveSceneDurationSeconds } from "@/lib/studio/scene-duration";
import {
  effectiveVoiceId,
  voicesForModelId,
} from "@/lib/studio/speech-voices";
import type {
  AiGenerationDto,
  AiProvider,
  FaithAlignment,
} from "@/lib/api/contracts";
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
  // ── Genesis-1: the Inspector's GENERATION section ──────────────────────────
  /** Item 1: choose the provider for one generation kind (project-level). */
  setAiProvider: (kind: SelectableKind, provider: AiProvider) => void;
  /** Item 1: pin a model for one generation kind (project-level). */
  setAiModel: (kind: SelectableKind, model: string | null) => void;
  /** Item 2: choose the faith alignment sent to Gloo (project-level). */
  setFaithAlignment: (value: FaithAlignment | null) => void;
  /** Item 4: generate a VIDEO for a scene instead of a still image. */
  generateSceneVideo: (sceneId?: string) => void;
  /** Pick the narrator from the resolved model's OWN published voice vocabulary. */
  setVoiceId: (voiceId: string) => void;
  /** 20a: cancel the running generation — the ONLY live control behind the lock. */
  cancelGeneration: () => void;
  /** 20b: `▶ Generate video` now opens the confirmation instead of spending. */
  requestSceneVideo: (sceneId?: string) => void;
  /** 20b: which scene the confirmation is open for, or null. */
  videoWarningSceneId: string | null;
  /** 20b: dismiss the confirmation without generating anything. */
  closeVideoWarning: () => void;
  /** 20b: confirm — optionally suppressing the warning for this project from now on. */
  confirmSceneVideo: (dontWarnAgain: boolean) => void;
  /** 20b: take the recommended cheap path instead (an existing image generation). */
  useStillImageInstead: (dontWarnAgain: boolean) => void;
}

/**
 * Item 4's poll budget.
 *
 * `pollGenerationUntilTerminal` defaults to 300 s, which is right for an image or a line
 * of text and badly wrong for a video: `generateVideo` submits an async provider job and
 * then polls it with durable ~30 s sleeps for up to 40 attempts — **20 minutes**. At the
 * 300 s default the studio would report a failure while the workflow was still running,
 * and the clip that eventually landed would never attach to the scene. 25 minutes is the
 * workflow's own bound plus slack for the queue.
 */
const VIDEO_GENERATION_POLL_TIMEOUT_MS = 1_500_000;

/**
 * Feature 6: how often the studio checks whether any preview URL is about to expire.
 *
 * Well inside the 300 s presign TTL, and cheap: a tick that finds nothing stale issues no
 * requests at all (`stalePresignTargets` returns an empty list and the driver short-
 * circuits). 30 s means the worst case is a URL replaced ~15–45 s before it dies, which is
 * comfortably ahead of `RESIGN_SAFETY_MARGIN_SECONDS`.
 */
const PRESIGN_REFRESH_INTERVAL_MS = 30_000;

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

  // Genesis-1 items 1/3: read the live provider/model catalogue once per studio open.
  // Real projects only — the mock catalogue has no session and the mock e2e lane's whole
  // guarantee is zero network egress. A failed read dispatches null, which the picker
  // renders as "checking/unavailable" rather than as a confident "no models".
  useEffect(() => {
    if (!hasManifest) return;
    void (async () => {
      const catalogue = await fetchModelCatalogue();
      if (aliveRef.current) dispatch({ type: "MODELS_LOADED", catalogue });
    })();
  }, [hasManifest]);

  // ── Feature 6: keep the presigned preview URLs alive ───────────────────────
  //
  // Every preview URL in the studio is signed for 300 s (`FilesService` default, no
  // override anywhere), and the studio signed them exactly twice: once at hydration and
  // once when a generation landed. Five minutes into an editing session every image,
  // clip, narration clip and music bed URL was dead — and because `storyboard-video.tsx`
  // branches on `visualUrl ?`, a stale-but-truthy URL took the media branch, so the studio
  // rendered BROKEN media instead of the gradient fallback it already had.
  //
  // This ticks well inside the TTL and only issues a request when something is actually
  // within `RESIGN_SAFETY_MARGIN_SECONDS` of expiry, so a short session costs nothing.
  // The whole decision lives in `refreshStalePresigns`; this is the timer.
  //
  // The ledger is a ref, not state: it must survive across ticks without re-rendering the
  // studio, and re-rendering on a failed re-sign would be a render loop.
  const resignLedgerRef = useRef(EMPTY_RESIGN_LEDGER);
  // A pass can outlive its tick. `refreshStalePresigns` awaits one presign per stale
  // target, and the ledger + the fresh urls are only written when that settles — so a
  // slow round-trip lets the NEXT tick see the same still-stale targets and re-issue the
  // same requests, N times over for as long as the API is slow, which is exactly when
  // piling on more requests is worst. Each pass also reads `resignLedgerRef.current` at
  // its start and overwrites it at its end, so overlapping passes discard each other's
  // failure counts and the `MAX_RESIGN_FAILURES` stop can be pushed out indefinitely.
  //
  // A ref, not state: this must not re-render the studio, and it is read and written
  // inside the timer callback, which holds no closure over a state value.
  //
  // NOT addressed here, deliberately: the UNBOUNDED re-sign ceiling. `canResign` bounds
  // consecutive FAILURES, not total successful re-signs, so a studio left open all day
  // re-signs every 30 s forever. Changing `canResign`'s semantics is a design decision
  // this run did not scope and it would churn U-P16..U-P21; it is one request per 30 s of
  // an idle tab — resource waste, not a correctness defect.
  const refreshInFlightRef = useRef(false);
  // The timer below must read the CURRENT storyboard without re-subscribing on every
  // edit, so the latest value is mirrored into a ref from an effect (never during render,
  // which would be a side effect in the render pass).
  const storyboardRef = useRef(state.storyboard);
  useEffect(() => {
    storyboardRef.current = state.storyboard;
  }, [state.storyboard]);
  useEffect(() => {
    if (!hasManifest) return; // mock catalogue: nothing is presigned, nothing to refresh
    const id = setInterval(() => {
      if (refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      void (async () => {
        try {
          const { actions, ledger } = await refreshStalePresigns({
            storyboard: storyboardRef.current,
            nowMs: Date.now(),
            ledger: resignLedgerRef.current,
            presign: (assetKey) => presignDownload(assetKey),
          });
          if (!aliveRef.current) return;
          resignLedgerRef.current = ledger;
          for (const action of actions) dispatch(action);
        } finally {
          // `finally`, not the end of the try: a throw here would otherwise wedge the
          // flag true and silently kill every future refresh for the session — a worse
          // failure than the pile-on it prevents.
          refreshInFlightRef.current = false;
        }
      })();
    }, PRESIGN_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasManifest]);

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
        // The POST itself did not produce a job: a non-2xx (409 `git_ops_in_flight`,
        // 422 `manifest_invalid`), an unparseable body, or a thrown fetch. NOTHING
        // started, so nothing can have timed out — and the api answers a 422 in
        // milliseconds, which D3's shipped workflow makes easy to reach (duplicate a
        // verse, clear a Script textarea to retype it, commit: `scriptText` is
        // `z.string().min(1)` in both manifest mirrors). Routing this through
        // `commitOutcome(null)` reported it as `commit_timeout`, naming a failure mode
        // that did not occur. The POLL branch below keeps `commitOutcome`, where a null
        // job really does mean the poll gave up.
        dispatch({ type: "COMMIT_FAILED", error: "commit_request_failed" });
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
    settle: (
      gen: AiGenerationDto | null,
      asset: PresignedAsset | null,
    ) => StudioAction,
    presignResult: boolean,
    options: { timeoutMs?: number } = {},
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
      // 20a: retain the id so Cancel has something to address. It used to live only in
      // this closure, which is why `POST /v1/ai/generations/:id/cancel` — shipped in the
      // api since task #31 — had no client path at all.
      dispatch({ type: "GENERATION_STARTED", slot, generationId: genId });
      const gen = await pollGenerationUntilTerminal(
        genId,
        options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {},
      );
      if (!aliveRef.current) return;
      // Feature 6: the presign's EXPIRY travels with its url. A landed generation is one
      // of only two moments the studio ever signs anything, and its url dies 300 s later
      // like every other; without the date the refresh pass could not tell a
      // just-generated url from a dead one.
      let asset: PresignedAsset | null = null;
      if (presignResult && gen?.status === "succeeded" && gen.resultAssetKey) {
        asset = await presignDownload(gen.resultAssetKey);
        if (!aliveRef.current) return;
      }
      dispatch(settle(gen, asset));
    })();
  };

  /**
   * The `{provider, model}` a generation of this kind should run on, plus the faith
   * alignment to send with it.
   *
   * Sent from the CLIENT rather than left to the BFF's env defaults, because the whole
   * point of item 1 is that the user's choice — which they can see on screen — wins. The
   * BFF still fills in its default when nothing is sent, so a project that has never
   * touched the picker behaves exactly as before.
   *
   * `faithAlignment` rides in `input` rather than as a top-level field: every kind's input
   * schema is `.passthrough()`, so it needs no api or db-lib contract change. It is only
   * attached for GLOO, because OpenRouter has no such concept and sending it would be
   * meaningless noise in the request body.
   */
  const generationTarget = (kind: SelectableKind) => {
    const settings = state.storyboard.aiSettings;
    const choice = resolveChoice(
      kind,
      settings,
      state.modelCatalogue?.defaults ?? {},
      state.modelCatalogue?.models ?? [],
    );
    return {
      // Only sent when BOTH are known — a provider without a model would make the BFF
      // send this deployment's default model for a different provider.
      target: choice.model
        ? { provider: choice.provider, model: choice.model }
        : {},
      // Gloo ONLY: `tradition` is a Gloo request field with no OpenRouter equivalent, so
      // attaching it elsewhere would be meaningless noise in the request body.
      faithAlignment:
        choice.provider === "gloo" ? settings?.faithAlignment : undefined,
    };
  };

  const rerollVisual = (sceneId?: string) => {
    if (!project.manifest) return; // mock catalog: no real generation
    const id = sceneId ?? state.selectedSceneId;
    const scene = state.storyboard.scenes.find((s) => s.id === id);
    if (!scene) return;
    const { target, faithAlignment } = generationTarget("image");
    runGeneration(
      imageSlot(id),
      {
        kind: "image",
        projectId: project.id,
        sceneId: id,
        ...target,
        input: {
          prompt: scene.visualPrompt,
          ...(faithAlignment ? { faithAlignment } : {}),
        },
      },
      (gen, asset) => imageGenerationOutcome(id, gen, asset),
      true,
    );
  };

  /**
   * Item 4 — generate a VIDEO for this scene instead of a still.
   *
   * Needs no dbos change to be per-scene: `generateVideo` already writes
   * `buildAssetKey(projectId, generationId)`, the same 4-segment extensionless shape as an
   * image, and the `AiGeneration` row already carries `sceneId`. What was missing is the
   * studio half — posting the request against a scene and writing `visualAssetKind` when
   * the clip lands (see `VIDEO_GENERATED`).
   *
   * The clip is REQUESTED at the scene's effective length rather than the scene being
   * stretched to fit the clip. That is the opposite of the narration rule, deliberately: a
   * verse cut off mid-sentence is semantically broken, a clip that ends before its scene is
   * only a visual choice — and folding a third input into `effectiveSceneDurationSeconds`
   * would put the six mutation-pinned length functions in `scene-duration.ts` at risk of a
   * scrubber/<Sequence> desync for no semantic gain.
   */
  const generateSceneVideo = (sceneId?: string) => {
    if (!project.manifest) return;
    const id = sceneId ?? state.selectedSceneId;
    const scene = state.storyboard.scenes.find((s) => s.id === id);
    if (!scene) return;
    const { target } = generationTarget("video");
    runGeneration(
      videoSlot(id),
      {
        kind: "video",
        projectId: project.id,
        sceneId: id,
        ...target,
        input: {
          prompt: scene.visualPrompt,
          durationSeconds: Math.max(1, Math.ceil(effectiveSceneDurationSeconds(scene))),
        },
      },
      (gen, asset) => videoGenerationOutcome(id, gen, asset),
      true,
      // A video job is minutes, not seconds — the default 300 s budget would report a
      // failure while the workflow was still running.
      { timeoutMs: VIDEO_GENERATION_POLL_TIMEOUT_MS },
    );
  };

  const setAiProvider = (kind: SelectableKind, provider: AiProvider) =>
    dispatch({ type: "SET_AI_PROVIDER", kind, provider });
  const setAiModel = (kind: SelectableKind, model: string | null) =>
    dispatch({ type: "SET_AI_MODEL", kind, model });
  const setFaithAlignment = (value: FaithAlignment | null) =>
    dispatch({ type: "SET_FAITH_ALIGNMENT", value });
  const setVoiceId = (voiceId: string) => dispatch({ type: "SET_VOICE_ID", voiceId });

  /**
   * 20a's Cancel — the only interactive control behind the lock.
   *
   * A REFUSAL (409 `generation_not_cancelable`) leaves the lock UP on purpose. The
   * generation is past the point of no return, and dropping the scrim would hand the
   * editor back seconds before a result lands into it — the exact race the lock exists to
   * prevent. The card says so instead.
   */
  const cancelActiveGeneration = () => {
    const active = activeGeneration(state);
    if (!active?.generationId) return;
    void (async () => {
      const outcome = await cancelGenerationRequest(active.generationId!);
      if (!aliveRef.current) return;
      if (outcome === "canceled") {
        dispatch({
          type: "GENERATION_FAILED",
          slot: active.slot,
          error: "canceled",
        });
        return;
      }
      dispatch({ type: "GENERATION_CANCEL_REFUSED", slot: active.slot });
    })();
  };

  // ── 20b: the video confirmation ────────────────────────────────────────────
  //
  // `▶ Generate video` no longer spends directly. `71e32a9`'s availability gate (can this
  // run at all?) is UPSTREAM of this and still applies — the two compose: 20b only ever
  // fires when video is already runnable.
  const [videoWarningSceneId, setVideoWarningSceneId] = useState<string | null>(null);

  const requestSceneVideo = (sceneId?: string) => {
    if (!project.manifest) return;
    const id = sceneId ?? state.selectedSceneId;
    if (!state.storyboard.scenes.some((s) => s.id === id)) return;
    // The per-project preference is read at the moment of the click, never cached: it can
    // be set from another tab, and a stale `true` here would be a dialog the user already
    // told us to stop showing.
    if (!shouldWarnBeforeVideo(project.id)) {
      generateSceneVideo(id);
      return;
    }
    setVideoWarningSceneId(id);
  };

  const closeVideoWarning = () => setVideoWarningSceneId(null);

  const applyDontWarn = (dontWarnAgain: boolean) => {
    if (dontWarnAgain) suppressVideoWarning(project.id);
  };

  const confirmSceneVideo = (dontWarnAgain: boolean) => {
    const id = videoWarningSceneId;
    setVideoWarningSceneId(null);
    applyDontWarn(dontWarnAgain);
    if (id) generateSceneVideo(id);
  };

  const useStillImageInstead = (dontWarnAgain: boolean) => {
    const id = videoWarningSceneId;
    setVideoWarningSceneId(null);
    applyDontWarn(dontWarnAgain);
    // 20b's recommended path needs NO new endpoint: this is the existing image generation
    // for this scene, relabelled. Ken Burns is applied at render time to any
    // `visualAssetKind: "image"`, so the drawn copy is accurate about what it does.
    if (id) rerollVisual(id);
  };

  const rewriteScript = (sceneId?: string) => {
    if (!project.manifest) return;
    const id = sceneId ?? state.selectedSceneId;
    const scene = state.storyboard.scenes.find((s) => s.id === id);
    if (!scene) return;
    // Which values travel is a pure question, and it is where this used to be wrong: it sent
    // the scene's HUMAN reference into a field the provider parses as a USFM id, which is a
    // permanent 404 — so every rewrite against a real project failed. See
    // `lib/studio/generation-input.ts`. The manifest read is still the post-commit-REFRESHED
    // one (task #57's `projectWithManifest`), so a rewrite after a re-plan+commit sees the
    // committed scenes rather than the stale prop.
    const input = scriptGenerationInput(project.manifest, scene);
    runGeneration(
      scriptSlot(id),
      { kind: "script", projectId: project.id, sceneId: id, input },
      (gen) => scriptGenerationOutcome(id, gen),
      false,
    );
  };

  const generateStoryboard = () => {
    if (!project.manifest) return;
    // THE reported bug lived here: this read `manifest.scenes[0]`, which is `undefined` on a
    // freshly-scaffolded project, so it POSTed a brief with no `scripture` at all — the
    // workflow skipped its presence-gated passage fetch, and a schema that REQUIRES a
    // per-scene reference left the model to supply one (Genesis 1 / ASV). It now reads the
    // project's ORIGIN passage, which is the thing the wizard actually collected. See
    // `lib/studio/generation-input.ts`.
    const input = storyboardGenerationInput(
      project.manifest,
      state.storyboard,
      project.projectName,
    );
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
    const voice: { description: string; label?: string; voiceId?: string } = {
      description: state.storyboard.voiceDescription,
    };
    if (state.storyboard.voiceLabel) voice.label = state.storyboard.voiceLabel;
    const { target } = generationTarget("narration");
    /**
     * The voice that will ACTUALLY be used — the same rule the picker displays.
     *
     * Sending `state.storyboard.voiceId` raw was half of the reported bug. It is absent
     * whenever the user has not opened the picker, and it holds a stale id whenever the
     * narration model changed under a persisted choice; in both cases the picker showed a
     * voice while the request carried nothing, and the provider narrated in a voice
     * nobody chose. `effectiveVoiceId` keeps a valid pick, drops one the resolved model
     * does not publish, and otherwise resolves that model's own derived default.
     *
     * It is deliberately NOT written back to the manifest: a default frozen into a file
     * committed to the user's repo stops being a default.
     */
    const voiceId = effectiveVoiceId(
      state.storyboard.voiceId,
      voicesForModelId(target.model, state.modelCatalogue?.models ?? []),
    );
    if (voiceId) voice.voiceId = voiceId;
    runGeneration(
      NARRATION_SLOT,
      {
        kind: "narration",
        projectId: project.id,
        ...target,
        input: {
          voice,
          // The CHOSEN provider voice id, TOP-LEVEL — the only value the provider is
          // ever sent. It is a sibling of `voice` rather than a property of it because
          // `GenerateNarrationInputSchema` is `NarrationSpecSchema.passthrough()`: a
          // top-level key survives an api/dbos still pinned to an older db-lib, while a
          // key nested inside `voice` is stripped by `VoiceDescriptorSchema` (a plain
          // `z.object`). Same mechanism `faithAlignment` already rides.
          //
          // Omitted only when the resolved model publishes NO vocabulary at all — the one
          // case where there is nothing honest to send, and where `requestSpeech` asks the
          // provider itself rather than guessing.
          ...(voiceId ? { voiceId } : {}),
          scenes,
        },
      },
      (gen, asset) => narrationGenerationOutcome(gen, asset),
      true,
    );
  };

  const regenerateMusic = () => {
    if (!project.manifest) return;
    const { target: musicTarget } = generationTarget("music");
    runGeneration(
      MUSIC_SLOT,
      {
        kind: "music",
        projectId: project.id,
        ...musicTarget,
        input: {
          style: state.storyboard.musicMood || "Cinematic score",
          durationSeconds: totalDurationSeconds(state.storyboard) || 30,
        },
      },
      (gen, asset) => musicGenerationOutcome(gen, asset),
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
    setAiProvider,
    setAiModel,
    setFaithAlignment,
    setVoiceId,
    cancelGeneration: cancelActiveGeneration,
    requestSceneVideo,
    videoWarningSceneId,
    closeVideoWarning,
    confirmSceneVideo,
    useStillImageInstead,
    generateSceneVideo,
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
