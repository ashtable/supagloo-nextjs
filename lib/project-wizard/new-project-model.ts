/**
 * The pure New-project state machine covering BOTH the 12a "create new repo" tab and the
 * 13a "use existing empty repo" tab. No React/DOM — the container holds the transient
 * `useState` and owns the mocked-async log timer.
 *
 * Feature 2 / figure 18a: FOUR steps now — repo → scripture → scaffold → ready. A new
 * INPUT step is inserted between the repo choice and the scaffold so the passage is
 * collected before the project exists, and seeded into the scaffolded manifest.
 *
 * 13a was never redrawn for this (design review flag F1), so its eyebrow, its rail and
 * its CTA all still described a 3-step flow whose step 1 scaffolded. All three are
 * corrected here — a wrong step count on the first screen of the main creation flow, and
 * a CTA promising an action the click no longer performs.
 */
import { deriveShortName, type MockRepo } from "./repos-model";

export type NewProjectStep =
  | "configure"
  | "scripture"
  | "scaffolding"
  | "ready";
export type RepoTab = "create-new" | "existing-empty";

/**
 * The passage picked in step 2, exactly as it will be persisted.
 *
 * `passageId` is a YouVersion USFM **echoed** by the provider — never constructed.
 * `contracts.ts` closed constructing one as residual risk ("`passageId` is ECHOED, never
 * constructed") and that still holds; what changed on 2026-07-30 is what "echoed" reaches.
 * For a whole chapter it is the chapters route's own `passage_id`. For 18a's verse RANGE it
 * is the id the PASSAGE route hands back for a `+`-joined list of ids the VERSES route
 * issued — every character sent came from the provider and every character stored came from
 * the provider, so the range is echoed rather than constructed. See
 * `lib/project-wizard/verse-range.ts`, whose docblock records the live probes: the
 * both-sides `PSA.121.1-PSA.121.4` form a naive construction produces is a 404, while
 * `PSA.121.1+PSA.121.2` is a 200 the host normalises to `{id: "PSA.121.1-2"}`.
 *
 * This docblock previously said the range selection was NOT built, because a range was a
 * constructed usfm with no live verification of that form. Both halves are now false: the
 * tray ships, and the verification exists.
 *
 * A `null` in place of this value means "no passage is currently confirmed", and it is a
 * state the step reports on every input change until the provider answers about the new
 * input — see the re-run rule in `scripture-step.tsx`'s passage effect. `canScaffold` below
 * is the only reader, and that null is what stops Create arming on a stale passage.
 */
export interface ScriptureSelection {
  reference: string;
  translation: string;
  language?: string;
  passageId?: string;
}

/** The inputs the step gates and `deriveProjectId` read. */
export interface ScaffoldInput {
  tab: RepoTab;
  repoName: string;
  selectedRepo: MockRepo | null;
  /** Null until step 2 has a chapter. Absent on the step-1 gate, which does not ask. */
  scripture?: ScriptureSelection | null;
}

/** Progress-bar fill % across the 4 steps (25 / 50 / 75 / 100). */
export function progressFill(step: NewProjectStep): number {
  switch (step) {
    case "configure":
      return 25;
    case "scripture":
      return 50;
    case "scaffolding":
      return 75;
    case "ready":
      return 100;
  }
}

/** Step-chrome eyebrow; the terminal ready card has none (its own icon header). */
export function stepEyebrow(step: NewProjectStep): string | null {
  switch (step) {
    case "configure":
      return "NEW PROJECT · STEP 1 OF 4";
    case "scripture":
      return "NEW PROJECT · STEP 2 OF 4";
    case "scaffolding":
      return "NEW PROJECT · STEP 3 OF 4";
    case "ready":
      return null;
  }
}

/**
 * The primary CTA label. Keyed on the STEP as well as the tab, because step 1 no longer
 * scaffolds — it advances.
 *
 * `"Choose scripture →"` is an INVENTION: 13a was not redrawn and NO DESIGN EXISTS for the
 * new step-1 string. 18a's own CTA (`"Generate storyboard →"`) is deliberately not used
 * anywhere: storyboard generation requires a project that already exists with a committed
 * manifest, so at step 2 it is a promise no contract can keep (flag F2). Generation stays
 * in the studio; the wizard persists the passage.
 */
export function ctaLabel(step: NewProjectStep, tab: RepoTab): string {
  if (step === "configure") return "Choose scripture →";
  return tab === "create-new"
    ? "Create & scaffold →"
    : "Scaffold into this repo →";
}

/** The project name defaults to the repo short name. */
export function defaultProjectName(shortName: string): string {
  return shortName;
}

/**
 * May the wizard leave step 1?
 *   - create-new: a non-blank repo name.
 *   - existing-empty: a SELECTED repo that is empty (non-empty rows are disabled).
 *
 * Deliberately does NOT consider the passage: step 1 has not asked for one yet, and a
 * gate that refused to advance for a reason the current screen does not show would be
 * unexplainable.
 */
export function canAdvanceFromRepo({
  tab,
  repoName,
  selectedRepo,
}: ScaffoldInput): boolean {
  if (tab === "create-new") return repoName.trim().length > 0;
  return selectedRepo !== null && selectedRepo.isEmpty;
}

/**
 * May the wizard scaffold? The repo gate AND a chosen passage.
 *
 * The passage half is what stops a user reaching the scaffold with an empty step 2 and
 * getting a silently blank `manifest.scripture` — the feature appearing to work and doing
 * nothing at all, with no error anywhere to notice.
 */
export function canScaffold(input: ScaffoldInput): boolean {
  if (!canAdvanceFromRepo(input)) return false;
  const s = input.scripture;
  return Boolean(s && s.reference.length > 0 && s.translation.length > 0);
}

/**
 * How long the terminal "PROJECT READY." card stays on screen before it takes the user to
 * the studio by itself.
 *
 * The card has always carried the caption `"Redirecting automatically…"` and has never
 * redirected — the copy was knowingly retained for design fidelity while the CTA was the
 * only way through. Every design artefact says the redirect is the intent (the wireframe
 * section is `<!-- STEP 3 — READY / REDIRECT -->`, the provisioning log's final pending row
 * is `○ Opening studio`, the sibling Import wizard lands straight in the studio, and the
 * structurally identical setup-wizard terminal card carries no such caption at all), so the
 * behaviour is being built rather than the copy deleted.
 *
 * NO countdown number is drawn anywhere, so none is invented on screen. The delay exists
 * because the card has real content the design means to be read — a ✓ roundel, the branch
 * name and the project's URL chip.
 */
export const READY_REDIRECT_MS = 2500;

/**
 * Where the ready card navigates. **Only ever an identifier the SERVER issued.**
 *
 * Both wizard tabs set their display slug from the PRE-CREATION typed value
 * (`completeCreateRepo` returns `slug: params.repoName`; the existing-empty tab uses the
 * picked repo's short name). The api assigns the real slug with `nextFreeSlug`, which
 * appends `-2`/`-3` when the same owner already has that slug, and `/studio/[slug]` resolves
 * owner-scoped — so the guess can route to a DIFFERENT project or to a 404.
 *
 * A human clicking a button could recover from that. An automatic redirect cannot, and it
 * gets there faster than a person would, which is why fixing it is part of building the
 * redirect rather than a follow-up. Preference order:
 *
 *  1. the slug read back from `GET /api/projects/:id` — the api's own answer;
 *  2. the project id, which came back from the create call and is therefore server-issued
 *     too (`resolveProjectBySlug` matches it, so `/studio/<id>` resolves);
 *  3. nothing. No target is better than a guessed one: the card stays put and its button
 *     is still there.
 */
export function readyRedirectTarget(input: {
  confirmedSlug: string | null;
  projectId: string;
}): string | null {
  return input.confirmedSlug || input.projectId || null;
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
