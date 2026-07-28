/**
 * The two top-bar button gates — task items 6 (Render) and 7 (Publish) — as pure
 * predicates, so the reasoning is testable without a DOM and the components stay thin.
 *
 * ══ Why `hasUnpublishedCommits` is THREE-valued ═════════════════════════════════════
 *
 * Step 5 proposed the biconditional
 *   `workingRow.headCommitSha === (highest published ?? base).headCommitSha`
 *     ⟺ nothing to publish.
 * I re-read every writer of `ProjectVersion.headCommitSha` before building on it. It does
 * not hold in general:
 *
 *  - **After scaffold it IS sound by construction.**
 *    `scaffold-project/workspace.ts:262-271` cuts the working branch AT `pr.mergeSha`
 *    and `scaffold-project/finalize.ts:43-82` writes that same value to both rows.
 *  - **After publish it is only an OBSERVATION.**
 *    `publish-version/workspace.ts:97-111` calls `checkoutBranch(path, nextBranch)` with
 *    NO start-ref, so the new working row holds whatever `main` pointed at when its clone
 *    ran — `merge.mergeSha` is never passed in. (Scaffold does pass its ref; publish does
 *    not. That asymmetry is the whole gap.) A push to `main` in between, or a crash
 *    between the merge step and the cut step, breaks the equality.
 *  - **An IMPORTED project has no comparand at all.** `import-project/finalize.ts:39-60`
 *    creates exactly one row (`state:"working"`) — no base row, no published row.
 *  - **`headCommitSha` is nullable** on the column and on the wire, and `null === null`
 *    would read as "nothing to publish".
 *  - **The DB can be stale.** A commit whose push succeeded but whose row write exhausted
 *    its retries, or any commit pushed to the version branch outside supagloo (it is the
 *    user's own repo), leaves the row behind the branch.
 *
 * So: `null` means "I cannot tell", and the gate FAILS OPEN on it. A Publish button the
 * user cannot un-stick is a worse bug than a publish that reaches the server and gets the
 * honest 422 ("No commits between…") it already gets today. The one wrong-BLOCKING case
 * left (a stale row) is escapable, and the tooltip names the escape: a commit rewrites
 * `headCommitSha`.
 *
 * I deliberately did NOT "fix" the workflow by passing `merge.mergeSha` into
 * `cutNextBranch`. Branching the next working version from `main`'s actual tip is the
 * correct git semantics; pinning it to a possibly-stale merge sha would silently drop a
 * commit that landed in between. Reshaping a git workflow to make a UI predicate exact is
 * the wrong trade — the server stays the authority, and this button is a front door.
 */
import type { ProjectVersionDto } from "../api/contracts";

export interface GateResult {
  enabled: boolean;
  /** The `title` tooltip when disabled — always actionable, never a bare state. */
  reason: string | null;
}

const ENABLED: GateResult = { enabled: true, reason: null };
const disabled = (reason: string): GateResult => ({ enabled: false, reason });

/**
 * Does the working branch hold commits that `main` does not?
 * `true` / `false` / `null` = undecidable.
 *
 * `workingBranch` is `state.versionBranch`, which is seeded from `ProjectDto.currentBranch`
 * (`studio-data.ts:192`) — literally the field the api resolves a publish target with
 * (`project-jobs-service.ts:504-506` matches on `branchName === project.currentBranch`,
 * with no `state` filter). Matching the server's own choice matters: a publish finalize
 * that died between its two writes leaves the row on the current branch marked
 * `published`, and the server would still publish it.
 */
export function hasUnpublishedCommits(
  versions: readonly ProjectVersionDto[] | null,
  workingBranch: string,
): boolean | null {
  if (!versions || versions.length === 0) return null;

  // Matched by BRANCH NAME only, with no `state` fallback. A `state === "working"`
  // fallback would let a versions list that has no row for the branch the editor thinks
  // it is on still produce a confident answer — and that disagreement is exactly the
  // case where we know least.
  const working = versions.find((v) => v.branchName === workingBranch);
  if (!working?.headCommitSha) return null;

  // `GET /v1/projects/:id/versions` is ordered by REAL semver descending
  // (`projects-service.ts:97-108` uses compareSemver), so the first `published` row is
  // the highest one. Re-sorting here lexically would rank v0.9.0 above v0.10.0.
  const baseline =
    versions.find((v) => v.state === "published" && v.branchName !== workingBranch) ??
    versions.find((v) => v.state === "base");
  if (!baseline?.headCommitSha) return null;

  return working.headCommitSha !== baseline.headCommitSha;
}

export interface PublishGateInput {
  versions: readonly ProjectVersionDto[] | null;
  /** A source manifest is present ⇒ the real API path. The mock catalogue has no
   *  versions list at all, and `studio-project.e2e.ts` E-SP3 / `studio-publish.e2e.ts`
   *  E-PUB4 click Publish against it. */
  isRealProject: boolean;
  publishing: boolean;
  committing: boolean;
  workingBranch: string;
}

export function publishButtonGate(input: PublishGateInput): GateResult {
  if (input.publishing) return disabled("Publishing…");
  // Per-project git-ops serialization: the four git-ops endpoints 409 while another
  // ProjectJob is queued or running (design-delta §2.9/§8). Named BEFORE the
  // nothing-to-publish reason, because it is the thing the user must actually wait for.
  if (input.committing) {
    return disabled("A commit is still running — publish when it finishes.");
  }
  if (!input.isRealProject) return ENABLED;

  return hasUnpublishedCommits(input.versions, input.workingBranch) === false
    ? disabled("Nothing new to publish — commit a change first.")
    : ENABLED;
}

export interface RenderGateInput {
  dirty: boolean;
  committing: boolean;
  /** The 14c overlay is up (`state.render !== null`). The authoritative in-flight guard
   *  is still `renderRunRef` inside the provider — a `state` read can never be it (see
   *  `studio-context.tsx`) — but the overlay's presence is the honest thing to SHOW. */
  renderOpen: boolean;
  sceneCount: number;
}

export function renderButtonGate(input: RenderGateInput): GateResult {
  if (input.renderOpen) return disabled("A render is already running.");
  if (input.committing) return disabled("Committing…");
  if (input.sceneCount === 0) {
    return disabled("Generate a storyboard first — there are no scenes yet.");
  }
  // `renderWorkflow` does `cloneAtVersion`, so a render is built from the last COMMIT.
  // Rendering while dirty would produce a video without the edits on screen and give no
  // hint why — the exact class of silent wrongness this task exists to remove.
  if (input.dirty) {
    return disabled("Commit your changes first — a render is built from the last commit.");
  }
  return ENABLED;
}
