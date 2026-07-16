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
  | { type: "TOGGLE_POSTING"; key: PostingKey };

/** Initial editor state: scene 2 selected, 9:16, paused, menus closed. */
export function initialStudioState(sb: Storyboard): StudioState {
  return {
    storyboard: sb,
    selectedSceneId: "s2",
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
        storyboard: updateSceneScript(
          state.storyboard,
          state.selectedSceneId,
          action.script,
        ),
      };
    case "EDIT_VISUAL_PROMPT":
      return {
        ...state,
        storyboard: updateSceneVisualPrompt(
          state.storyboard,
          state.selectedSceneId,
          action.prompt,
        ),
      };
    case "SET_ON_SCREEN_TEXT":
      return {
        ...state,
        storyboard: setSceneOnScreenText(
          state.storyboard,
          state.selectedSceneId,
          action.value,
        ),
      };
    case "SET_MUSIC_MOOD":
      return {
        ...state,
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
    default:
      return state;
  }
}
