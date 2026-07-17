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
  totalFrames,
  updateSceneScript,
  updateSceneVisualPrompt,
} from "./storyboard";
import {
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

export type PostingKey =
  | "tiktok"
  | "ytShorts"
  | "recurring"
  | "approveEachCut"
  | "postAutomatically";

/** The 14a publish wizard's step. */
export type PublishFlow = "closed" | "review" | "publishing" | "published";

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
  // ── Turn 14 overlays (all pure; timers live in the components) ──────────────
  /** 14a: which step of the publish wizard is open. */
  publishFlow: PublishFlow;
  /** 14a: the publishing-log sequence, seeded on PUBLISH_BEGIN. */
  publishLog: LogSequence | null;
  /** 14a/14b/14c: the tag that last went live on main (null until published). */
  lastPublishedVersion: string | null;
  /** 14b: the version dropdown (joins the reroll/ship mutual-exclusion family). */
  versionMenuOpen: boolean;
  /** 14c: the render-progress overlay state (null when no render is running). */
  render: RenderState | null;
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
  // 14a publish wizard
  | { type: "OPEN_PUBLISH" }
  | { type: "PUBLISH_BEGIN" }
  | { type: "ADVANCE_PUBLISH_LOG" }
  | { type: "PUBLISH_DONE" }
  | { type: "CLOSE_PUBLISH" }
  // 14c render overlay
  | { type: "OPEN_RENDER" }
  | { type: "ADVANCE_RENDER" }
  | { type: "RENDER_BACKGROUND" }
  | { type: "CANCEL_RENDER" };

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
    selectedSceneId: sb.scenes[1]?.id ?? sb.scenes[0].id,
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
    publishFlow: "closed",
    publishLog: null,
    lastPublishedVersion: null,
    versionMenuOpen: false,
    render: null,
  };
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
      return { ...state, committing: true };
    case "COMMIT_DONE":
      return { ...state, committing: false, dirty: false };
    // ── 14a publish wizard (two-step bump, D-PUBLISH-SEMANTICS) ───────────────
    case "OPEN_PUBLISH":
      return { ...state, publishFlow: "review", versionMenuOpen: false };
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
      return { ...state, publishFlow: "closed" };
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
    default:
      return state;
  }
}
