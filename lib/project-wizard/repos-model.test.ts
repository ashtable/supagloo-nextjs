import { describe, expect, it } from "vitest";

// Not yet implemented — RED until `lib/project-wizard/repos-model.ts` exists
// (Step 9 turns this GREEN). This suite is the authoritative contract for the
// mock repo dataset the New-project (13a existing-empty tab) and Import (12b)
// wizards read.
import {
  MOCK_REPOS,
  OWNER,
  deriveShortName,
  findRepo,
  reposForImport,
  reposForNewProject,
  searchRepos,
} from "./repos-model";

describe("MOCK_REPOS", () => {
  it("U-RM1: carries the four wireframe repos with glyph-exact flags", () => {
    expect(MOCK_REPOS).toHaveLength(4);

    const psalm = findRepo("ashsrinivas/psalm-121");
    expect(psalm, "psalm-121 present").toBeTruthy();
    expect(psalm!.shortName).toBe("psalm-121");
    expect(psalm!.owner).toBe("ashsrinivas");
    expect(psalm!.isEmpty).toBe(true);
    expect(psalm!.isSupaglooProject).toBe(false);

    const genesis = findRepo("ashsrinivas/genesis-light");
    expect(genesis, "genesis-light present").toBeTruthy();
    expect(genesis!.isEmpty).toBe(false); // the 13a "NOT EMPTY" disabled row

    const exodus = findRepo("ashsrinivas/exodus-red-sea");
    expect(exodus, "exodus-red-sea present").toBeTruthy();
    expect(exodus!.isSupaglooProject).toBe(true);
    expect(exodus!.latestBranch).toBe("v0.2.3");
    expect(exodus!.updatedLabel).toBe("Updated 5 days ago");

    const notes = findRepo("ashsrinivas/notes-app");
    expect(notes, "notes-app present").toBeTruthy();
    expect(notes!.isSupaglooProject).toBe(false); // → the 12b IMPORT FAILED branch
    expect(notes!.updatedLabel).toBe("Updated 2 weeks ago");
  });

  it("U-RM2: OWNER is the demo GitHub account", () => {
    expect(OWNER).toBe("ashsrinivas");
  });
});

describe("findRepo", () => {
  it("U-RM3: resolves by fullName, else undefined", () => {
    expect(findRepo("ashsrinivas/exodus-red-sea")?.shortName).toBe(
      "exodus-red-sea",
    );
    expect(findRepo("ashsrinivas/does-not-exist")).toBeUndefined();
  });
});

describe("searchRepos", () => {
  it("U-RM4: filters case-insensitively by fullName", () => {
    // exact-substring, upper-cased query still matches
    const exodus = searchRepos(MOCK_REPOS, "EXODUS");
    expect(exodus.map((r) => r.shortName)).toEqual(["exodus-red-sea"]);

    const psalm = searchRepos(MOCK_REPOS, "psalm");
    expect(psalm.map((r) => r.shortName)).toEqual(["psalm-121"]);
  });

  it("U-RM5: an empty query returns every repo (no filter)", () => {
    expect(searchRepos(MOCK_REPOS, "")).toHaveLength(MOCK_REPOS.length);
    expect(searchRepos(MOCK_REPOS, "   ")).toHaveLength(MOCK_REPOS.length);
  });
});

describe("wizard views over MOCK_REPOS", () => {
  it("U-RM6: reposForNewProject offers the empty + non-empty candidates (13a)", () => {
    const names = reposForNewProject().map((r) => r.shortName);
    expect(names).toContain("psalm-121"); // EMPTY, selectable
    expect(names).toContain("genesis-light"); // NOT EMPTY, disabled
  });

  it("U-RM7: reposForImport offers the existing-content candidates (12b)", () => {
    const names = reposForImport().map((r) => r.shortName);
    expect(names).toContain("exodus-red-sea"); // valid Supagloo project
    expect(names).toContain("notes-app"); // not a Supagloo project → error
  });
});

describe("deriveShortName", () => {
  it("U-RM8: passes an already-slug repo name through unchanged", () => {
    expect(deriveShortName("psalm-121")).toBe("psalm-121");
  });

  it("U-RM9: slugifies a typed display name (lowercase, spaces → hyphens, trim)", () => {
    expect(deriveShortName("Psalm 121")).toBe("psalm-121");
    expect(deriveShortName("  Genesis Light  ")).toBe("genesis-light");
  });
});
