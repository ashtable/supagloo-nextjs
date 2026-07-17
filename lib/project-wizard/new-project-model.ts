/**
 * The pure 3-step New-project state machine covering BOTH the 12a "create new
 * repo" tab and the 13a "use existing empty repo" tab. No React/DOM — the
 * container holds the transient `useState` and owns the mocked-async log timer.
 */
import { deriveShortName, type MockRepo } from "./repos-model";

export type NewProjectStep = "configure" | "scaffolding" | "ready";
export type RepoTab = "create-new" | "existing-empty";

/** The inputs both `canScaffold` and `deriveProjectId` read (the step-1 form). */
export interface ScaffoldInput {
  tab: RepoTab;
  repoName: string;
  selectedRepo: MockRepo | null;
}

/** Progress-bar fill % across the 3 steps (33 / 66 / 100). */
export function progressFill(step: NewProjectStep): number {
  switch (step) {
    case "configure":
      return 33;
    case "scaffolding":
      return 66;
    case "ready":
      return 100;
  }
}

/** Step-chrome eyebrow; the terminal ready card has none (its own icon header). */
export function stepEyebrow(step: NewProjectStep): string | null {
  switch (step) {
    case "configure":
      return "NEW PROJECT · STEP 1 OF 3";
    case "scaffolding":
      return "NEW PROJECT · STEP 2 OF 3";
    case "ready":
      return null;
  }
}

/** The primary CTA label differs per tab (same gradient pill). */
export function ctaLabel(tab: RepoTab): string {
  return tab === "create-new"
    ? "Create & scaffold →"
    : "Scaffold into this repo →";
}

/** The project name defaults to the repo short name. */
export function defaultProjectName(shortName: string): string {
  return shortName;
}

/** May the wizard scaffold from the current step-1 form?
 *  - create-new: a non-blank repo name.
 *  - existing-empty: a SELECTED repo that is empty (non-empty rows are disabled). */
export function canScaffold({
  tab,
  repoName,
  selectedRepo,
}: ScaffoldInput): boolean {
  if (tab === "create-new") return repoName.trim().length > 0;
  return selectedRepo !== null && selectedRepo.isEmpty;
}

/** The `/studio/[id]` id the wizard opens into. create-new derives it from the
 *  typed repo name; existing-empty reads the selected repo's short name. */
export function deriveProjectId({
  tab,
  repoName,
  selectedRepo,
}: ScaffoldInput): string {
  if (tab === "create-new") return deriveShortName(repoName);
  return selectedRepo ? selectedRepo.shortName : "";
}
