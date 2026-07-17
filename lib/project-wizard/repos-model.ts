/**
 * The mock GitHub repo dataset the New-project (13a "use existing empty repo"
 * tab) and Import (12b) wizards read. Pure — no React/DOM. FRONTEND-ONLY, MOCKED:
 * no real GitHub API. Glyph-exact demo content transcribed from the Turn 12/13
 * wireframes (`scratch/design/turn12a/12b/13a.raw.html`).
 */

export interface MockRepo {
  /** owner/name, e.g. "ashsrinivas/psalm-121" — the picker/search key. */
  fullName: string;
  /** the repo name alone, e.g. "psalm-121" — the `/studio/[id]` id. */
  shortName: string;
  owner: string;
  /** 13a gates scaffolding on this: empty → selectable, non-empty → disabled. */
  isEmpty: boolean;
  /** 12b's verify branch: a Supagloo project succeeds, else the error card. */
  isSupaglooProject: boolean;
  /** relative-update caption shown on the row. */
  updatedLabel: string;
  /** newest version branch (12b import target); null when there is none. */
  latestBranch: string | null;
}

/** The single demo GitHub account these repos live under. */
export const OWNER = "ashsrinivas";

export const MOCK_REPOS: readonly MockRepo[] = [
  {
    fullName: "ashsrinivas/psalm-121",
    shortName: "psalm-121",
    owner: OWNER,
    isEmpty: true,
    isSupaglooProject: false,
    updatedLabel: "Empty · created just now",
    latestBranch: null,
  },
  {
    fullName: "ashsrinivas/genesis-light",
    shortName: "genesis-light",
    owner: OWNER,
    isEmpty: false,
    isSupaglooProject: true,
    updatedLabel: "Already contains a project",
    latestBranch: "main",
  },
  {
    fullName: "ashsrinivas/exodus-red-sea",
    shortName: "exodus-red-sea",
    owner: OWNER,
    isEmpty: false,
    isSupaglooProject: true,
    updatedLabel: "Updated 5 days ago",
    latestBranch: "v0.2.3",
  },
  {
    fullName: "ashsrinivas/notes-app",
    shortName: "notes-app",
    owner: OWNER,
    isEmpty: false,
    isSupaglooProject: false,
    updatedLabel: "Updated 2 weeks ago",
    latestBranch: null,
  },
];

/** Candidates for the New-project "use existing empty repo" tab (13a): an empty
 *  repo (selectable) and a non-empty one (disabled). */
export function reposForNewProject(): MockRepo[] {
  return MOCK_REPOS.filter(
    (r) => r.shortName === "psalm-121" || r.shortName === "genesis-light",
  );
}

/** Candidates for the Import wizard (12b): a valid Supagloo project and a repo
 *  that is not one (drives the "NOT A SUPAGLOO PROJECT" error). */
export function reposForImport(): MockRepo[] {
  return MOCK_REPOS.filter(
    (r) => r.shortName === "exodus-red-sea" || r.shortName === "notes-app",
  );
}

/** Case-insensitive substring filter on `fullName`. An empty/whitespace query
 *  returns every repo (no filter). Pure — does not mutate its input. */
export function searchRepos(
  repos: readonly MockRepo[],
  query: string,
): MockRepo[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...repos];
  return repos.filter((r) => r.fullName.toLowerCase().includes(needle));
}

/** Resolve a repo by its `fullName`, else `undefined`. */
export function findRepo(fullName: string): MockRepo | undefined {
  return MOCK_REPOS.find((r) => r.fullName === fullName);
}

/** Slugify a typed display name into a repo short name (lowercase, trimmed,
 *  runs of whitespace → single hyphens). An already-slug name passes through. */
export function deriveShortName(typedName: string): string {
  return typedName.trim().toLowerCase().replace(/\s+/g, "-");
}
