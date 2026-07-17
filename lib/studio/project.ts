/**
 * The `/studio/[id]` project model: the id → project lookup that replaces the
 * bare `/studio` static storyboard, plus the version-branch derivations the 13b
 * top bar (Commit / Publish) reads. Pure — no React/DOM.
 *
 * FRONTEND-ONLY, MOCKED: every project maps to the single `DEMO_STORYBOARD` the
 * repo ships (there is only one storyboard), differing only in identity + working
 * branch. Unknown ids resolve to null → `notFound()` (A6).
 */
import { DEMO_STORYBOARD, type Storyboard } from "./storyboard";

export interface StudioProject {
  /** the `/studio/[id]` route id. */
  id: string;
  /** display name in the top bar (= the repo short name). */
  projectName: string;
  /** owner/name of the backing GitHub repo. */
  repo: string;
  /** the version branch the editor loads on (Publish bumps its patch). */
  versionBranch: string;
  storyboard: Storyboard;
}

function project(
  id: string,
  versionBranch: string,
): StudioProject {
  return {
    id,
    projectName: id,
    repo: `ashsrinivas/${id}`,
    versionBranch,
    storyboard: DEMO_STORYBOARD,
  };
}

/** The resolvable demo ids: the 3 workspace `DEMO_PROJECTS` (on distinct working
 *  branches, not the card's released `main`) + the 2 wizard demo ids. */
export const STUDIO_PROJECTS: Record<string, StudioProject> = {
  "genesis-light": project("genesis-light", "v0.3.0"),
  "psalm-23": project("psalm-23", "v0.1.2"),
  beatitudes: project("beatitudes", "v0.0.4"),
  "psalm-121": project("psalm-121", "v0.0.1"),
  "exodus-red-sea": project("exodus-red-sea", "v0.2.3"),
};

/** Resolve a project by id, or null on an unknown id (→ 404). */
export function findStudioProject(id: string): StudioProject | null {
  return STUDIO_PROJECTS[id] ?? null;
}

/** Increment the patch of a `vMAJ.MIN.PATCH` branch, integer-wise
 *  (`v0.0.9 → v0.0.10`, not `v0.0.91`). Defensive: passes an unparseable
 *  string through unchanged. */
export function nextVersion(branch: string): string {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(branch);
  if (!m) return branch;
  const [, major, minor, patch] = m;
  return `v${major}.${minor}.${Number(patch) + 1}`;
}

/** Decrement the patch of a `vMAJ.MIN.PATCH` branch, integer-wise, CLAMPED at
 *  patch 0 (never negative — `v0.0.0 → v0.0.0`). Defensive: passes an
 *  unparseable string through unchanged. The inverse of `nextVersion`, used to
 *  derive the archived / template rows of the 14b version history. */
export function prevVersion(branch: string): string {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(branch);
  if (!m) return branch;
  const [, major, minor, patch] = m;
  return `v${major}.${minor}.${Math.max(0, Number(patch) - 1)}`;
}

/**
 * The two-step publish version semantics (D-PUBLISH-SEMANTICS). Publishing from
 * working branch `b`:
 *  - `publishedVersion(b)` (= one patch up) is the tag that goes LIVE on main,
 *  - `postPublishBranch(b)` (= two patches up) is the fresh working branch cut
 *    afterwards, so the studio never sits on a version that 14b would render as
 *    both "working · uncommitted" AND "live on main".
 * e.g. publish v0.0.1 → tag v0.0.2 live, land on new working v0.0.3.
 */
export function publishedVersion(branch: string): string {
  return nextVersion(branch);
}

export function postPublishBranch(branch: string): string {
  return nextVersion(nextVersion(branch));
}

/** The dynamic Publish button label — targets the NEXT version. */
export function publishLabel(branch: string): string {
  return `Publish ${nextVersion(branch)} ▸`;
}

/** The app route for a project id. */
export function studioUrl(id: string): string {
  return `/studio/${id}`;
}

/** The terminal-card display URL (no scheme) for a project id. */
export function studioChipUrl(id: string): string {
  return `supagloo.com/studio/${id}`;
}
