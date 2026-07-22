/**
 * The REAL-mode repo source for the wizard pickers (Task #26 §5.3): the New-project
 * "use existing empty repo" tab (13a) and the Import picker (12b) read live repos
 * from `GET /api/github/repos?filter=empty|all` (the BFF proxy of the task-11
 * endpoint, which mints a fresh installation token per request). The response is
 * mapped into the existing `RepoPicker` shape (`MockRepo`) so the view is unchanged.
 *
 * Pure + injectable `fetch` → zero-network unit tests. Best-effort: any failure
 * (non-200 incl. 409 not-connected, bad body, thrown fetch) → `[]`, so a missing
 * GitHub connection surfaces as an empty list rather than a crash.
 */
import type { MockRepo } from "./repos-model";
import { GithubRepoListResponseSchema, type GithubRepo } from "../api/contracts";

const REPOS_URL = "/api/github/repos";

/** The API filter: `empty` keeps size-0 repos (the existing-empty scaffold tab);
 *  `all` lists everything (the import picker). */
export type WizardRepoFilter = "empty" | "all";

/** Map a live `GithubRepo` into the picker's `MockRepo` shape. `isSupaglooProject`
 *  is not known client-side (verification is a server-side import-job stage), so it
 *  is `false` here and never gates the real import (the JOB does). */
export function mapGithubRepo(repo: GithubRepo): MockRepo {
  return {
    fullName: repo.fullName,
    shortName: repo.name,
    owner: repo.owner,
    isEmpty: repo.empty,
    isSupaglooProject: false,
    updatedLabel: repo.private ? "Private repo" : "Public repo",
    latestBranch: repo.defaultBranch,
  };
}

export interface FetchReposDeps {
  fetchImpl?: typeof fetch;
}

export async function fetchWizardRepos(
  filter: WizardRepoFilter,
  deps: FetchReposDeps = {},
): Promise<MockRepo[]> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${REPOS_URL}?filter=${filter}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const parsed = GithubRepoListResponseSchema.safeParse(await res.json());
    if (!parsed.success) return [];
    return parsed.data.repositories.map(mapGithubRepo);
  } catch {
    return [];
  }
}
