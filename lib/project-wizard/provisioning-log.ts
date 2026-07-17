/**
 * The pure log sequencer + row copy shared by New-project step 2 (scaffolding)
 * and Import step 2 (verifying). No React/DOM — a caller-owned timer ticks
 * `advanceLog` (the mocked-async precedent from `session-provider.tsx`), the view
 * prepends the ✓ / spinner / ○ glyph per `logRowStatus`.
 */

export type LogRowStatus = "completed" | "active" | "queued";

export interface LogSequence {
  /** label-only lines (no leading glyph). */
  rows: readonly string[];
  /** index of the row currently in flight; == rows.length once every row done. */
  activeIndex: number;
}

/** Interval between row completions (ms). Small — the E2E polls, never sleeps. */
export const PROVISION_ROW_DELAY_MS = 140;

/** Row copy is label-only; the two tabs of "create new repo". */
type NewProjectTab = "create-new" | "existing-empty";

export function initLog(rows: readonly string[]): LogSequence {
  return { rows, activeIndex: 0 };
}

/** Advance the cursor one row, clamped at `rows.length`. Pure — new object. */
export function advanceLog(seq: LogSequence): LogSequence {
  return {
    rows: seq.rows,
    activeIndex: Math.min(seq.activeIndex + 1, seq.rows.length),
  };
}

export function logRowStatus(seq: LogSequence, index: number): LogRowStatus {
  if (index < seq.activeIndex) return "completed";
  if (index === seq.activeIndex) return "active";
  return "queued";
}

export function isLogComplete(seq: LogSequence): boolean {
  return seq.activeIndex >= seq.rows.length;
}

/** New-project scaffolding lines. "create-new" is the full 7-line git dance;
 *  "existing-empty" drops the first "Created repo" line (the repo already
 *  exists) → 6 lines. Templated from the target repo + working branch. */
export function newProjectLogRows(
  tab: NewProjectTab,
  ctx: { fullName: string; branch: string },
): string[] {
  const rows = [
    `Created repo ${ctx.fullName}`,
    "Cloned to Railway workspace",
    "Scaffolded Remotion project",
    "Checked out v0.0.0 · committed initial files",
    "Pushed → opened & merged PR into main",
    `Pulled main · branching ${ctx.branch} · pushing…`,
    "Opening studio",
  ];
  return tab === "existing-empty" ? rows.slice(1) : rows;
}

/** Publish-flow git lines (14a step 2). The mocked PR dance: commit the working
 *  branch → push → open PR → merge & tag the published version onto main → cut
 *  the next working branch. Templated from the working / published / next
 *  branches the two-step bump derives (D-PUBLISH-SEMANTICS). */
export function publishLogRows(ctx: {
  workingBranch: string;
  publishedVersion: string;
  nextBranch: string;
}): string[] {
  return [
    `Committed to ${ctx.workingBranch}`,
    "Pushed branch to origin",
    "Opened PR #7 → main",
    `Merging PR & tagging ${ctx.publishedVersion}…`,
    `Pull main · cut branch ${ctx.nextBranch}`,
  ];
}

/** Import verifying lines: clone → detect remotion.config.ts → read the latest
 *  version branch → check it out. Templated from the imported repo's branch. */
export function importLogRows(ctx: { latestBranch: string }): string[] {
  return [
    "Cloned to Railway workspace",
    "Found valid Remotion project · remotion.config.ts",
    `Latest version branch ${ctx.latestBranch}`,
    `Checking out ${ctx.latestBranch} · opening studio…`,
  ];
}
