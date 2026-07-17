/**
 * The pure editor-state machine (no React). Drives `useReducer` in the studio
 * context; seeking the Player is a component side-effect, so this stays pure.
 */
import type { Aspect } from "./aspect";
import type { OnScreenText, Storyboard } from "./storyboard";
import {
  setMusicMood,
  setSceneOnScreenText,
  updateSceneScript,
  updateSceneVisualPrompt,
} from "./storyboard";
import { nextVersion, type StudioProject } from "./project";

export type PostingKey =
  | "tiktok"
  | "ytShorts"
  | "recurring"
  | "approveEachCut"
  | "postAutomatically";

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
  | { type: "CLOSE_MENUS" }
  | { type: "TOGGLE_POSTING"; key: PostingKey }
  | { type: "COMMIT_BEGIN" }
  | { type: "COMMIT_DONE" }
  | { type: "PUBLISH_BEGIN" }
  | { type: "PUBLISH_DONE" };

/** Mocked-async delays for the 13b Commit / Publish transitions (ms). */
export const MOCK_COMMIT_DELAY_MS = 320;
export const MOCK_PUBLISH_DELAY_MS = 480;

/** Initial editor state seeded from the resolved `/studio/[id]` project: 2nd
 *  scene selected (matches the 5a mock; falls back to the 1st for short
 *  storyboards — never a hardcoded id that a differently-shaped storyboard could
 *  miss and crash on), 9:16, paused, menus closed, on the project's version
 *  branch and CLEAN (a freshly opened project has no local edits). */
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
      return {
        ...state,
        dirty: true,
        storyboard: updateSceneScript(
          state.storyboard,
          state.selectedSceneId,
          action.script,
        ),
      };
    case "EDIT_VISUAL_PROMPT":
      return {
        ...state,
        dirty: true,
        storyboard: updateSceneVisualPrompt(
          state.storyboard,
          state.selectedSceneId,
          action.prompt,
        ),
      };
    case "SET_ON_SCREEN_TEXT":
      return {
        ...state,
        dirty: true,
        storyboard: setSceneOnScreenText(
          state.storyboard,
          state.selectedSceneId,
          action.value,
        ),
      };
    case "SET_MUSIC_MOOD":
      return {
        ...state,
        dirty: true,
        storyboard: setMusicMood(state.storyboard, action.mood),
      };
    case "PLAY":
      return { ...state, isPlaying: true };
    case "PAUSE":
      return { ...state, isPlaying: false };
    case "TOGGLE_REROLL_MENU":
      return {
        ...state,
        rerollMenuOpen: !state.rerollMenuOpen,
        shipMenuOpen: false,
      };
    case "TOGGLE_SHIP_MENU":
      return {
        ...state,
        shipMenuOpen: !state.shipMenuOpen,
        rerollMenuOpen: false,
      };
    case "CLOSE_MENUS":
      return { ...state, rerollMenuOpen: false, shipMenuOpen: false };
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
    case "PUBLISH_BEGIN":
      return { ...state, publishing: true };
    case "PUBLISH_DONE":
      return {
        ...state,
        publishing: false,
        dirty: false,
        versionBranch: nextVersion(state.versionBranch),
      };
    default:
      return state;
  }
}
