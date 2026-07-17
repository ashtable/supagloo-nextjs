/**
 * The pure 2-step Import state machine + its "not a Supagloo project" error
 * branch (12b). No React/DOM.
 */
import type { MockRepo } from "./repos-model";

export type ImportStep = "pick" | "verifying" | "ready" | "error";

/** The red-toned eyebrow the error card shows in place of the step eyebrow. */
export const IMPORT_FAILED_EYEBROW = "IMPORT FAILED";

/** Progress-bar fill % (50 on pick, 88 on verify — an approximate per-step
 *  feel, not an exact half/full; the terminal ready/error cards have no track). */
export function progressFill(step: ImportStep): number {
  return step === "pick" ? 50 : 88;
}

/** Step-chrome eyebrow for the two real steps. */
export function stepEyebrow(step: ImportStep): string {
  return step === "pick"
    ? "IMPORT PROJECT · STEP 1 OF 2"
    : "IMPORT PROJECT · STEP 2 OF 2";
}

/** May the wizard import? — a repo must be selected. */
export function canImport(selectedRepo: MockRepo | null): boolean {
  return selectedRepo !== null;
}

/** Verify a selected repo: a Supagloo project succeeds; anything else fails into
 *  the "NOT A SUPAGLOO PROJECT" error card. */
export function verifyOutcome(repo: MockRepo): "success" | "failure" {
  return repo.isSupaglooProject ? "success" : "failure";
}

/** The `/studio/[id]` id is the selected repo's short name. */
export function deriveProjectId(repo: MockRepo): string {
  return repo.shortName;
}
