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

/** The import-job stage key whose failure genuinely means "this repo isn't a
 *  Supagloo project". It is the ONLY failure that should surface the "NOT A
 *  SUPAGLOO PROJECT" card. Mirrors the real import job's `verifySupaglooProject`
 *  stage (see `lib/project-wizard/job-log.ts` / the API import workflow). */
export const VERIFY_STAGE_KEY = "verifySupaglooProject";

/** Which error card the wizard should render on a terminal import failure. */
export type ImportErrorKind = "not-a-project" | "generic";

/**
 * Decide which error card to show from the stage that failed. Only a
 * `verifySupaglooProject` failure means the repo genuinely isn't a Supagloo
 * project ("not-a-project"); ANY other failed stage — or `null` (e.g. a poll
 * timeout / network blip with no job) — is a "generic" import failure that must
 * NOT be mislabeled as "not a Supagloo project".
 */
export function importErrorKind(failedStage: string | null): ImportErrorKind {
  return failedStage === VERIFY_STAGE_KEY ? "not-a-project" : "generic";
}
