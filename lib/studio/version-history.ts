/**
 * The pure version-row model behind the 14b version dropdown (no React/DOM).
 * Derives the working / live-on-main / archived / template rows from the current
 * working branch, the last-published tag, and the dirty flag — reproducing the
 * 14b wireframe's 4-row list, and collapsing rows that would duplicate the
 * template floor. Every value is DERIVED (D-14B-INERT: the view never mutates
 * these), so the dropdown stays consistent with the chip + the published card.
 */
import { prevVersion } from "./project";
import type { ProjectVersionDto } from "../api/contracts";

export type VersionState = "working" | "live" | "archived" | "template";

export interface VersionRow {
  /** the `vMAJ.MIN.PATCH` branch this row represents. */
  branch: string;
  /** which lane of the history this is. */
  state: VersionState;
  /** the sub-caption shown under the branch (non-empty). */
  label: string;
  /** the gold unsaved dot — only ever true on the WORKING row, iff dirty. */
  showDot: boolean;
  /** does this row expose an (inert) "restore" affordance? archived only. */
  canRestore: boolean;
}

/** The scaffold floor for a working branch: patch pinned to 0 (`v0.0.x → v0.0.0`). */
function templateBranch(branch: string): string {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(branch);
  if (!m) return "v0.0.0";
  return `v${m[1]}.${m[2]}.0`;
}

/**
 * The version rows for the 14b dropdown, top→bottom:
 *  - the WORKING branch (always),
 *  - the LIVE-on-main tag + its ARCHIVED predecessor (only once something has
 *    been published; the archived row COLLAPSES when it would equal the
 *    template floor, so the list never shows a duplicate `v0.0.0`),
 *  - the empty TEMPLATE floor (always).
 * Fresh project (`lastPublishedVersion === null`) ⇒ working + template only.
 */
export function versionHistory(
  workingBranch: string,
  lastPublishedVersion: string | null,
  dirty: boolean,
): VersionRow[] {
  const template = templateBranch(workingBranch);
  const rows: VersionRow[] = [
    {
      branch: workingBranch,
      state: "working",
      label: dirty ? "working branch · uncommitted edits" : "working branch",
      showDot: dirty,
      canRestore: false,
    },
  ];

  if (lastPublishedVersion) {
    rows.push({
      branch: lastPublishedVersion,
      state: "live",
      label: "published to main",
      showDot: false,
      canRestore: false,
    });
    const archived = prevVersion(lastPublishedVersion);
    // Collapse the archived row when it would just be the template floor again.
    if (archived !== template) {
      rows.push({
        branch: archived,
        state: "archived",
        label: "previous release",
        showDot: false,
        canRestore: true,
      });
    }
  }

  rows.push({
    branch: template,
    state: "template",
    label: "empty template",
    showDot: false,
    canRestore: false,
  });

  return rows;
}

/**
 * The REAL-mode counterpart of `versionHistory` (Task #28): map the wire
 * `ProjectVersionDto[]` from `GET /v1/projects/:id/versions` onto the SAME `VersionRow`
 * shape the 14b dropdown already renders, so `version-menu.tsx` renders both mock + real
 * with one code path. The API returns versions DESCENDING by real semver (newest first),
 * so the FIRST `published` row is the highest = LIVE ON MAIN; any later `published`
 * (or an explicit wire `archived`) is restorable history. `branch` is the DTO's
 * `branchName` (verified `v<semver>`). Like the mock rows, everything is DERIVED — the
 * dropdown never mutates it (D-14B-INERT: restore stays inert, no backend supports it).
 */
export function versionRowsFromDtos(
  versions: readonly ProjectVersionDto[],
  dirty: boolean,
): VersionRow[] {
  let seenLive = false;
  return versions.map((v): VersionRow => {
    switch (v.state) {
      case "working":
        return {
          branch: v.branchName,
          state: "working",
          label: dirty ? "working branch · uncommitted edits" : "working branch",
          showDot: dirty,
          canRestore: false,
        };
      case "published":
        if (!seenLive) {
          seenLive = true;
          return {
            branch: v.branchName,
            state: "live",
            label: "published to main",
            showDot: false,
            canRestore: false,
          };
        }
        return {
          branch: v.branchName,
          state: "archived",
          label: "previous release",
          showDot: false,
          canRestore: true,
        };
      case "archived":
        return {
          branch: v.branchName,
          state: "archived",
          label: "previous release",
          showDot: false,
          canRestore: true,
        };
      case "base":
      default:
        return {
          branch: v.branchName,
          state: "template",
          label: "empty template",
          showDot: false,
          canRestore: false,
        };
    }
  });
}
