import { describe, expect, it } from "vitest";

// RED until `lib/project-wizard/wizard-repos.ts` ships. The real-mode repo source for
// the New-project "use existing empty repo" tab (13a) and the Import picker (12b):
// `GET /api/github/repos?filter=empty|all` (the BFF proxy of the task-11 endpoint),
// mapped into the RepoPicker's shape. Pure + injectable fetch → zero-network tests.
import { mapGithubRepo, fetchWizardRepos } from "./wizard-repos";

const GH_EMPTY = {
  id: 1,
  name: "psalm-121",
  fullName: "acme/psalm-121",
  owner: "acme",
  private: true,
  defaultBranch: "main",
  empty: true,
};
const GH_FULL = {
  id: 2,
  name: "exodus-red-sea",
  fullName: "acme/exodus-red-sea",
  owner: "acme",
  private: false,
  defaultBranch: "v0.2.3",
  empty: false,
};

function jsonFetch(body: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 500,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("mapGithubRepo", () => {
  it("U-WR1: maps a GithubRepo into the picker shape (name→shortName, empty→isEmpty, defaultBranch→latestBranch)", () => {
    expect(mapGithubRepo(GH_EMPTY)).toMatchObject({
      fullName: "acme/psalm-121",
      shortName: "psalm-121",
      owner: "acme",
      isEmpty: true,
      latestBranch: "main",
    });
    expect(mapGithubRepo(GH_FULL)).toMatchObject({
      shortName: "exodus-red-sea",
      isEmpty: false,
      latestBranch: "v0.2.3",
    });
  });
});

describe("fetchWizardRepos", () => {
  it("U-WR2: requests the given filter and returns mapped repos", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(url);
      return new Response(JSON.stringify({ repositories: [GH_EMPTY, GH_FULL] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const repos = await fetchWizardRepos("empty", { fetchImpl });
    expect(seen[0]).toContain("/api/github/repos?filter=empty");
    expect(repos.map((r) => r.shortName)).toEqual(["psalm-121", "exodus-red-sea"]);
  });

  it("U-WR3: returns [] on a non-200 (e.g. 409 not-connected) — never throws", async () => {
    const repos = await fetchWizardRepos("all", { fetchImpl: jsonFetch({}, false) });
    expect(repos).toEqual([]);
  });

  it("U-WR4: returns [] on a thrown fetch", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await fetchWizardRepos("all", { fetchImpl })).toEqual([]);
  });
});
