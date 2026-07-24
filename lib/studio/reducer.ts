/**
 * The pure editor-state machine (no React). Drives `useReducer` in the studio
 * context; seeking the Player, and the mocked publish-log / render tickers, are
 * component side-effects, so this stays pure.
 */
import type { Aspect } from "./aspect";
import type { OnScreenText, Storyboard } from "./storyboard";
import {
  setMusicMood,
  setSceneOnScreenText,
  setSceneVisual,
  setSceneVisualUrl,
  setVoiceDescription,
  setNarrationAsset,
  setMusicAsset,
  storyboardFromGenerated,
  totalFrames,
  updateSceneScript,
  updateSceneVisualPrompt,
} from "./storyboard";
import {
  GeneratedScriptSchema,
  GeneratedStoryboardSchema,
  type AiGenerationDto,
} from "../api/contracts";
import {
  nextVersion,
  postPublishBranch,
  publishedVersion,
  type StudioProject,
} from "./project";
import {
  advanceLog,
  initLog,
  publishLogRows,
  type LogSequence,
} from "../project-wizard/provisioning-log";
import {
  advanceRender,
  initRender,
  type RenderState,
} from "./render-model";
import type { JobLike, LogRow } from "../project-wizard/job-log";

export type PostingKey =
  | "tiktok"
  | "ytShorts"
  | "recurring"
  | "approveEachCut"
  | "postAutomatically";

/** The 14a publish wizard's step. */
export type PublishFlow = "closed" | "review" | "publishing" | "published";

// ── Task #35: AI-generation slots + state ────────────────────────────────────

/** A generation "slot" keys an in-flight/failed generation in `StudioState.generations`.
 *  Scene-scoped kinds (image/script) are keyed per scene; whole-project kinds
 *  (storyboard/narration/music) have a single fixed slot. */
export const imageSlot = (sceneId: string): string => `image:${sceneId}`;
export const scriptSlot = (sceneId: string): string => `script:${sceneId}`;
export const STORYBOARD_SLOT = "storyboard" as const;
export const NARRATION_SLOT = "narration" as const;
export const MUSIC_SLOT = "music" as const;

/** The pending/failed state of one generation slot (success clears the slot). */
export interface GenerationEntry {
  status: "running" | "failed";
  error?: string;
}

export interface StudioState {
  storyboard: Storyboard;
  selectedSceneId: string;
  aspect: Aspect;
  isPlaying: boolean;
  rerollMenuOpen: boolean;
  shipMenuOpen: boolean;
  posting: Record<PostingKey, boolean>;
  /** Turn 13b: the version branch the editor is on (Publish bumps it). */
  versionBranch: string;
  /** true once a content edit is made; Commit/Publish clear it. */
  dirty: boolean;
  /** mocked-async pending flags (caller-owned timers flip them). */
  committing: boolean;
  publishing: boolean;
  /** Task 27: the last commit's terminal error (a real network/ProjectJob failure),
   *  or null. Set by COMMIT_FAILED (the edit stays dirty so the user can retry);
   *  cleared by a fresh COMMIT_BEGIN or a successful COMMIT_DONE. The mocked
   *  setTimeout commit never had a failure path — a real one does. */
  commitError: string | null;
  // ── Turn 14 overlays (all pure; timers live in the components) ──────────────
  /** 14a: which step of the publish wizard is open. */
  publishFlow: PublishFlow;
  /** 14a MOCK: the publishing-log sequence, seeded on PUBLISH_BEGIN (mock two-step
   *  PR dance). Null in real mode — the real path renders `publishStages` instead. */
  publishLog: LogSequence | null;
  /** 14a REAL (Task 28): the polled publish-job stage rows (from `stagesToLogRows`),
   *  or null in mock mode. Its presence (with a null `publishLog`) is what the wizard
   *  renders on the publishing step in real mode. */
  publishStages: LogRow[] | null;
  /** 14a REAL (Task 28): the last publish's terminal error (a real network / ProjectJob
   *  failure), or null. Set by PUBLISH_FAILED; cleared by a fresh real begin / OPEN /
   *  CLOSE. Mirrors `commitError` — the mocked publish never had a failure path. */
  publishError: string | null;
  /** 14a/14b/14c: the tag that last went live on main (null until published). */
  lastPublishedVersion: string | null;
  /** 14b: the version dropdown (joins the reroll/ship mutual-exclusion family). */
  versionMenuOpen: boolean;
  /** 14c: the render-progress overlay state (null when no render is running). */
  render: RenderState | null;
  /** Task #35: in-flight/failed AI generations, keyed by slot (see `imageSlot`
   *  etc.). A slot is added on GENERATION_BEGIN and removed on success; a failure
   *  leaves a `{status:"failed"}` entry so the inspector can offer a retry. */
  generations: Record<string, GenerationEntry>;
}

export type StudioAction =
  | { type: "SELECT_SCENE"; id: string }
  | { type: "SET_ASPECT"; aspect: Aspect }
  | { type: "EDIT_SCRIPT"; script: string }
  | { type: "EDIT_VISUAL_PROMPT"; prompt: string }
  | { type: "SET_ON_SCREEN_TEXT"; value: OnScreenText }
  | { type: "SET_MUSIC_MOOD"; mood: string }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TOGGLE_REROLL_MENU" }
  | { type: "TOGGLE_SHIP_MENU" }
  | { type: "TOGGLE_VERSION_MENU" }
  | { type: "CLOSE_MENUS" }
  | { type: "TOGGLE_POSTING"; key: PostingKey }
  | { type: "COMMIT_BEGIN" }
  | { type: "COMMIT_DONE" }
  | { type: "COMMIT_FAILED"; error: string }
  // 14a publish wizard — MOCK (two-step)
  | { type: "OPEN_PUBLISH" }
  | { type: "PUBLISH_BEGIN" }
  | { type: "ADVANCE_PUBLISH_LOG" }
  | { type: "PUBLISH_DONE" }
  | { type: "CLOSE_PUBLISH" }
  // 14a publish wizard — REAL (Task 28, one-step; driven by the polled publish job)
  | { type: "PUBLISH_REAL_BEGIN" }
  | { type: "PUBLISH_STAGES"; rows: LogRow[] }
  | { type: "PUBLISH_REAL_DONE"; publishedTag: string; nextBranch: string }
  | { type: "PUBLISH_FAILED"; error: string }
  // 14c render overlay
  | { type: "OPEN_RENDER" }
  | { type: "ADVANCE_RENDER" }
  | { type: "RENDER_BACKGROUND" }
  | { type: "CANCEL_RENDER" }
  // Task #35 AI generation
  | { type: "GENERATION_BEGIN"; slot: string }
  | { type: "GENERATION_FAILED"; slot: string; error: string }
  | { type: "IMAGE_GENERATED"; sceneId: string; assetKey: string; url: string | null }
  | { type: "SET_SCENE_VISUAL_URL"; sceneId: string; url: string | null }
  | { type: "SCRIPT_GENERATED"; sceneId: string; scriptText: string }
  | { type: "NARRATION_GENERATED"; assetKey: string; url: string | null }
  | { type: "MUSIC_GENERATED"; assetKey: string; url: string | null }
  | { type: "STORYBOARD_GENERATED"; storyboard: Storyboard }
  | { type: "EDIT_VOICE_DESCRIPTION"; description: string };

/** Mocked-async delay for the 13b Commit transition (ms). (Publish no longer has
 *  a single direct-bump delay — 14a's log ticks the mocked PR dance instead.) */
export const MOCK_COMMIT_DELAY_MS = 320;

/** A content edit dirties the project AND dismisses the version dropdown (a
 *  content edit is an interaction elsewhere in the editor — the dropdown, like
 *  any menu, closes; the 14b spec "reopen the menu" after a dirty edit relies on
 *  this). */
function edited(state: StudioState, storyboard: Storyboard): StudioState {
  return { ...state, dirty: true, versionMenuOpen: false, storyboard };
}

/** Initial editor state seeded from the resolved `/studio/[id]` project: 2nd
 *  scene selected (matches the 5a mock; falls back to the 1st for short
 *  storyboards — never a hardcoded id that a differently-shaped storyboard could
 *  miss and crash on), 9:16, paused, all menus/overlays closed, on the project's
 *  version branch and CLEAN (a freshly opened project has no local edits). */
export function initialStudioState(project: StudioProject): StudioState {
  const sb = project.storyboard;
  return {
    storyboard: sb,
    // 2nd scene by index (matches 5a), 1st for short storyboards, and "" for a
    // freshly-scaffolded EMPTY manifest (real projects start with zero scenes until
    // generation) — never `scenes[0].id`, which would throw on an empty storyboard.
    selectedSceneId: sb.scenes[1]?.id ?? sb.scenes[0]?.id ?? "",
    aspect: "9:16",
    isPlaying: false,
    rerollMenuOpen: false,
    shipMenuOpen: false,
    posting: {
      tiktok: true,
      ytShorts: true,
      recurring: true,
      approveEachCut: true,
      postAutomatically: false,
    },
    versionBranch: project.versionBranch,
    dirty: false,
    committing: false,
    publishing: false,
    commitError: null,
    publishFlow: "closed",
    publishLog: null,
    publishStages: null,
    publishError: null,
    lastPublishedVersion: null,
    versionMenuOpen: false,
    render: null,
    generations: {},
  };
}

/** Immutably drop one generation slot (a success clears the slot). */
function clearSlot(
  generations: Record<string, GenerationEntry>,
  slot: string,
): Record<string, GenerationEntry> {
  const next = { ...generations };
  delete next[slot];
  return next;
}

export function studioReducer(
  state: StudioState,
  action: StudioAction,
): StudioState {
  switch (action.type) {
    case "SELECT_SCENE":
      return { ...state, selectedSceneId: action.id };
    case "SET_ASPECT":
      return { ...state, aspect: action.aspect };
    case "EDIT_SCRIPT":
      return edited(
        state,
        updateSceneScript(state.storyboard, state.selectedSceneId, action.script),
      );
    case "EDIT_VISUAL_PROMPT":
      return edited(
        state,
        updateSceneVisualPrompt(
          state.storyboard,
          state.selectedSceneId,
          action.prompt,
        ),
      );
    case "SET_ON_SCREEN_TEXT":
      return edited(
        state,
        setSceneOnScreenText(
          state.storyboard,
          state.selectedSceneId,
          action.value,
        ),
      );
    case "SET_MUSIC_MOOD":
      return edited(state, setMusicMood(state.storyboard, action.mood));
    case "PLAY":
      return { ...state, isPlaying: true };
    case "PAUSE":
      return { ...state, isPlaying: false };
    case "TOGGLE_REROLL_MENU":
      return {
        ...state,
        rerollMenuOpen: !state.rerollMenuOpen,
        shipMenuOpen: false,
        versionMenuOpen: false,
      };
    case "TOGGLE_SHIP_MENU":
      return {
        ...state,
        shipMenuOpen: !state.shipMenuOpen,
        rerollMenuOpen: false,
        versionMenuOpen: false,
      };
    case "TOGGLE_VERSION_MENU":
      return {
        ...state,
        versionMenuOpen: !state.versionMenuOpen,
        rerollMenuOpen: false,
        shipMenuOpen: false,
      };
    case "CLOSE_MENUS":
      return {
        ...state,
        rerollMenuOpen: false,
        shipMenuOpen: false,
        versionMenuOpen: false,
      };
    case "TOGGLE_POSTING":
      return {
        ...state,
        posting: {
          ...state.posting,
          [action.key]: !state.posting[action.key],
        },
      };
    case "COMMIT_BEGIN":
      return { ...state, committing: true, commitError: null };
    case "COMMIT_DONE":
      return { ...state, committing: false, dirty: false, commitError: null };
    case "COMMIT_FAILED":
      // The commit did NOT land — clear the pending flag and record the error, but
      // KEEP the edit dirty so the chip stays gold and Commit is retryable.
      return { ...state, committing: false, commitError: action.error };
    // ── 14a publish wizard (two-step bump, D-PUBLISH-SEMANTICS) ───────────────
    case "OPEN_PUBLISH":
      return {
        ...state,
        publishFlow: "review",
        versionMenuOpen: false,
        // clear any stale real-publish error/log so a re-open starts clean
        publishError: null,
        publishStages: null,
      };
    case "PUBLISH_BEGIN":
      return {
        ...state,
        publishFlow: "publishing",
        publishing: true,
        publishLog: initLog(
          publishLogRows({
            workingBranch: state.versionBranch,
            publishedVersion: publishedVersion(state.versionBranch),
            nextBranch: postPublishBranch(state.versionBranch),
          }),
        ),
      };
    case "ADVANCE_PUBLISH_LOG":
      return state.publishLog
        ? { ...state, publishLog: advanceLog(state.publishLog) }
        : state;
    case "PUBLISH_DONE":
      return {
        ...state,
        publishFlow: "published",
        publishing: false,
        dirty: false,
        lastPublishedVersion: publishedVersion(state.versionBranch),
        versionBranch: postPublishBranch(state.versionBranch),
        publishLog: null,
      };
    case "CLOSE_PUBLISH":
      return {
        ...state,
        publishFlow: "closed",
        publishError: null,
        publishStages: null,
      };
    // ── 14a publish wizard — REAL one-step (Task 28); mock cases above untouched ──
    case "PUBLISH_REAL_BEGIN":
      // Open the publishing step WITHOUT seeding the mock `publishLog` — the real
      // path renders `publishStages` (polled) instead, and a null `publishLog` also
      // keeps the wizard's mock ticker `useEffect` a no-op in real mode.
      return {
        ...state,
        publishFlow: "publishing",
        publishing: true,
        publishError: null,
        publishStages: null,
        publishLog: null,
      };
    case "PUBLISH_STAGES":
      // Only while a real publish is in flight (ignore a late poll after terminal).
      return state.publishFlow === "publishing"
        ? { ...state, publishStages: action.rows }
        : state;
    case "PUBLISH_REAL_DONE":
      // The authoritative bump rides the payload (Model A one-step): the published tag
      // went live on main, and the editor now sits on the next working branch.
      return {
        ...state,
        publishFlow: "published",
        publishing: false,
        dirty: false,
        lastPublishedVersion: action.publishedTag,
        versionBranch: action.nextBranch,
        publishStages: null,
        publishError: null,
        publishLog: null,
      };
    case "PUBLISH_FAILED":
      // The publish did NOT land — clear the pending flag + record the error, but STAY
      // on the publishing step so the wizard can surface the error + a close/retry.
      return { ...state, publishing: false, publishError: action.error };
    // ── 14c render overlay ────────────────────────────────────────────────────
    case "OPEN_RENDER":
      return {
        ...state,
        publishFlow: "closed",
        render: initRender(
          totalFrames(state.storyboard, state.storyboard.fps),
          state.lastPublishedVersion ?? publishedVersion(state.versionBranch),
        ),
      };
    case "ADVANCE_RENDER":
      return state.render
        ? { ...state, render: advanceRender(state.render) }
        : state;
    case "RENDER_BACKGROUND":
      return state.render
        ? { ...state, render: { ...state.render, backgrounded: true } }
        : state;
    case "CANCEL_RENDER":
      return { ...state, render: null };
    // ── Task #35 AI generation ────────────────────────────────────────────────
    case "GENERATION_BEGIN":
      // A fresh begin clears any prior failure on that slot; storyboard/dirty
      // untouched (nothing has changed yet).
      return {
        ...state,
        generations: { ...state.generations, [action.slot]: { status: "running" } },
      };
    case "GENERATION_FAILED":
      // The generation did NOT land — record the error on the slot so the inspector
      // can surface a retry. No storyboard/dirty change.
      return {
        ...state,
        generations: {
          ...state.generations,
          [action.slot]: { status: "failed", error: action.error },
        },
      };
    case "IMAGE_GENERATED":
      // A reroll landed: set the scene's persisted key + ephemeral preview URL,
      // clear the slot, and dirty so the new ref is committed.
      return {
        ...edited(
          state,
          setSceneVisual(state.storyboard, action.sceneId, {
            assetKey: action.assetKey,
            url: action.url,
          }),
        ),
        generations: clearSlot(state.generations, imageSlot(action.sceneId)),
      };
    case "SET_SCENE_VISUAL_URL":
      // Hydrate-time presign of an already-persisted key — a display-only URL, NOT
      // an edit (dirty must stay as-is).
      return {
        ...state,
        storyboard: setSceneVisualUrl(state.storyboard, action.sceneId, action.url),
      };
    case "SCRIPT_GENERATED":
      return {
        ...edited(
          state,
          updateSceneScript(state.storyboard, action.sceneId, action.scriptText),
        ),
        generations: clearSlot(state.generations, scriptSlot(action.sceneId)),
      };
    case "NARRATION_GENERATED":
      return {
        ...edited(
          state,
          setNarrationAsset(state.storyboard, action.assetKey, action.url),
        ),
        generations: clearSlot(state.generations, NARRATION_SLOT),
      };
    case "MUSIC_GENERATED":
      return {
        ...edited(
          state,
          setMusicAsset(state.storyboard, action.assetKey, action.url),
        ),
        generations: clearSlot(state.generations, MUSIC_SLOT),
      };
    case "STORYBOARD_GENERATED":
      // A (re)planned storyboard replaces the scenes wholesale; select the first,
      // dirty, and clear the whole-project slot.
      return {
        ...state,
        storyboard: action.storyboard,
        selectedSceneId: action.storyboard.scenes[0]?.id ?? "",
        dirty: true,
        versionMenuOpen: false,
        generations: clearSlot(state.generations, STORYBOARD_SLOT),
      };
    case "EDIT_VOICE_DESCRIPTION":
      return edited(
        state,
        setVoiceDescription(state.storyboard, action.description),
      );
    default:
      return state;
  }
}

/**
 * Map a POLLED terminal commit ProjectJob (or a null job = a POST failure / poll
 * timeout) to the reducer action that settles the commit. This is the real
 * replacement for the mocked `setTimeout(COMMIT_DONE)` — the transition is now
 * driven by the job's actual terminal status. `succeeded` → COMMIT_DONE (clean);
 * anything else (`failed`/`canceled`/timeout) → COMMIT_FAILED (stays dirty).
 */
export function commitOutcome(job: JobLike | null): StudioAction {
  if (job && job.status === "succeeded") return { type: "COMMIT_DONE" };
  const error =
    job && job.error ? job.error : job ? "commit_failed" : "commit_timeout";
  return { type: "COMMIT_FAILED", error };
}

/**
 * Map a POLLED terminal publish ProjectJob (or a null job = a POST failure / poll
 * timeout) to the action that settles the real publish. Mirrors `commitOutcome`.
 * On success this is the Model-A ONE-step bump: the CURRENT working `versionBranch` is
 * the version that went live, and the editor lands on `nextVersion(versionBranch)` (at
 * publish time the working branch is always the highest existing semver, so this equals
 * the server's next branch; the dropdown re-reads authoritatively regardless).
 * `succeeded` → PUBLISH_REAL_DONE; anything else (`failed`/`canceled`/timeout) →
 * PUBLISH_FAILED (the wizard stays open to surface the error).
 */
export function publishOutcome(
  job: JobLike | null,
  versionBranch: string,
): StudioAction {
  if (job && job.status === "succeeded") {
    return {
      type: "PUBLISH_REAL_DONE",
      publishedTag: versionBranch,
      nextBranch: nextVersion(versionBranch),
    };
  }
  const error =
    job && job.error ? job.error : job ? "publish_failed" : "publish_timeout";
  return { type: "PUBLISH_FAILED", error };
}

// ── Task #35: generation outcome mappers (polled terminal generation → action) ──
// Pure, like commitOutcome/publishOutcome. Each maps a POLLED terminal AiGeneration
// (or null = a POST failure / poll timeout) — plus the presigned preview URL (media)
// or a parsed resultJson (text) — to the settling action.

/** Error string for a non-succeeded (or absent) generation. */
function genError(gen: AiGenerationDto | null): string {
  if (gen && gen.error) return gen.error;
  return gen ? "generation_failed" : "generation_timeout";
}

/** image reroll → IMAGE_GENERATED (needs a resultAssetKey), else GENERATION_FAILED. */
export function imageGenerationOutcome(
  sceneId: string,
  gen: AiGenerationDto | null,
  url: string | null,
): StudioAction {
  if (gen && gen.status === "succeeded" && gen.resultAssetKey) {
    return { type: "IMAGE_GENERATED", sceneId, assetKey: gen.resultAssetKey, url };
  }
  return { type: "GENERATION_FAILED", slot: imageSlot(sceneId), error: genError(gen) };
}

/** script rewrite → SCRIPT_GENERATED (parses GeneratedScript from resultJson), else
 *  GENERATION_FAILED (a malformed result is a failure, never a crash). */
export function scriptGenerationOutcome(
  sceneId: string,
  gen: AiGenerationDto | null,
): StudioAction {
  if (gen && gen.status === "succeeded") {
    const parsed = GeneratedScriptSchema.safeParse(gen.resultJson);
    if (parsed.success) {
      return { type: "SCRIPT_GENERATED", sceneId, scriptText: parsed.data.scriptText };
    }
  }
  return { type: "GENERATION_FAILED", slot: scriptSlot(sceneId), error: genError(gen) };
}

/** narration synth → NARRATION_GENERATED (needs a resultAssetKey; url optional). */
export function narrationGenerationOutcome(
  gen: AiGenerationDto | null,
  url: string | null,
): StudioAction {
  if (gen && gen.status === "succeeded" && gen.resultAssetKey) {
    return { type: "NARRATION_GENERATED", assetKey: gen.resultAssetKey, url };
  }
  return { type: "GENERATION_FAILED", slot: NARRATION_SLOT, error: genError(gen) };
}

/** music synth → MUSIC_GENERATED (needs a resultAssetKey; url optional). */
export function musicGenerationOutcome(
  gen: AiGenerationDto | null,
  url: string | null,
): StudioAction {
  if (gen && gen.status === "succeeded" && gen.resultAssetKey) {
    return { type: "MUSIC_GENERATED", assetKey: gen.resultAssetKey, url };
  }
  return { type: "GENERATION_FAILED", slot: MUSIC_SLOT, error: genError(gen) };
}

/** storyboard (re)plan → STORYBOARD_GENERATED (parses GeneratedStoryboard from
 *  resultJson, projected onto the base composition frame), else GENERATION_FAILED. */
export function storyboardGenerationOutcome(
  gen: AiGenerationDto | null,
  base: Storyboard,
): StudioAction {
  if (gen && gen.status === "succeeded") {
    const parsed = GeneratedStoryboardSchema.safeParse(gen.resultJson);
    if (parsed.success) {
      return {
        type: "STORYBOARD_GENERATED",
        storyboard: storyboardFromGenerated(parsed.data, base),
      };
    }
  }
  return { type: "GENERATION_FAILED", slot: STORYBOARD_SLOT, error: genError(gen) };
}
