/**
 * The two top-bar button gates (task items 6 and 7), as pure predicates.
 *
 * ── Why the publish predicate is THREE-valued ────────────────────────────────────
 * I re-read every writer of `ProjectVersion.headCommitSha` before building on Step 5's
 * proposed biconditional, and it does not hold in general:
 *
 *  - after SCAFFOLD it is sound by construction — `scaffold-project/workspace.ts:262-271`
 *    cuts the working branch AT `pr.mergeSha`, and both rows are written that value;
 *  - after PUBLISH it is only an observation — `publish-version/workspace.ts:97-111`
 *    calls `checkoutBranch(path, nextBranch)` with no start-ref, so the new working row
 *    holds whatever `main` pointed at when its clone ran, not `merge.mergeSha`;
 *  - an IMPORTED project has exactly one row (`import-project/finalize.ts:39-60`) — no
 *    base row and no published row, so there is nothing to compare against;
 *  - `headCommitSha` is nullable on the wire, and `null === null` would read as
 *    "nothing to publish".
 *
 * So the predicate answers `null` for "I cannot tell" and the gate FAILS OPEN. A dead
 * Publish button that a user cannot escape is a worse bug than a publish that reaches
 * the server and gets the honest 422 it already gets today.
 */
import { describe, expect, it } from "vitest";

import type { ProjectVersionDto } from "../api/contracts";
import {
  hasUnpublishedCommits,
  publishButtonGate,
  renderButtonGate,
} from "./top-bar-gates";

function version(
  over: Partial<ProjectVersionDto> & Pick<ProjectVersionDto, "branchName" | "state">,
): ProjectVersionDto {
  return {
    id: `id-${over.branchName}`,
    projectId: "p1",
    semver: over.branchName.replace(/^v/, ""),
    commitMessage: null,
    autoSummary: null,
    changedFiles: [],
    headCommitSha: null,
    prNumber: null,
    prUrl: null,
    publishedAt: null,
    ...over,
  } as ProjectVersionDto;
}

/** The shape `GET /v1/projects/:id/versions` returns: real-semver DESCENDING. */
const AFTER_PUBLISH = [
  version({ branchName: "v0.0.3", state: "working", headCommitSha: "aaa" }),
  version({ branchName: "v0.0.2", state: "published", headCommitSha: "aaa" }),
  version({ branchName: "v0.0.0", state: "base", headCommitSha: "root" }),
];

const AFTER_COMMIT = [
  version({ branchName: "v0.0.3", state: "working", headCommitSha: "bbb" }),
  version({ branchName: "v0.0.2", state: "published", headCommitSha: "aaa" }),
  version({ branchName: "v0.0.0", state: "base", headCommitSha: "root" }),
];

describe("hasUnpublishedCommits", () => {
  it("U-TG1: FALSE when the working head equals the highest published head", () => {
    expect(hasUnpublishedCommits(AFTER_PUBLISH, "v0.0.3")).toBe(false);
  });

  it("U-TG2: TRUE once a commit has moved the working head", () => {
    expect(hasUnpublishedCommits(AFTER_COMMIT, "v0.0.3")).toBe(true);
  });

  it("U-TG3: falls back to the BASE row when nothing has been published yet", () => {
    const freshScaffold = [
      version({ branchName: "v0.0.1", state: "working", headCommitSha: "merge" }),
      version({ branchName: "v0.0.0", state: "base", headCommitSha: "merge" }),
    ];
    expect(hasUnpublishedCommits(freshScaffold, "v0.0.1")).toBe(false);

    const committed = [
      version({ branchName: "v0.0.1", state: "working", headCommitSha: "new" }),
      version({ branchName: "v0.0.0", state: "base", headCommitSha: "merge" }),
    ];
    expect(hasUnpublishedCommits(committed, "v0.0.1")).toBe(true);
  });

  it("U-TG3b: the HIGHEST published row wins — wire order is real-semver descending, so it is the FIRST published row", () => {
    // A lexical `semver desc` would rank 0.9.0 above 0.10.0; the API already sorts by
    // compareSemver, so taking the first published row in wire order is the sound read.
    const many = [
      version({ branchName: "v0.0.11", state: "working", headCommitSha: "x" }),
      version({ branchName: "v0.0.10", state: "published", headCommitSha: "x" }),
      version({ branchName: "v0.0.9", state: "published", headCommitSha: "older" }),
      version({ branchName: "v0.0.0", state: "base", headCommitSha: "root" }),
    ];
    expect(hasUnpublishedCommits(many, "v0.0.11")).toBe(false);
  });

  it("U-TG4a: NULL (undecidable) for an IMPORTED project — it has one working row and no comparand", () => {
    const imported = [
      version({ branchName: "v0.2.0", state: "working", headCommitSha: "tip" }),
    ];
    expect(hasUnpublishedCommits(imported, "v0.2.0")).toBeNull();
  });

  it("U-TG4b: NULL when either head sha is null — null === null must never read as 'nothing to publish'", () => {
    const nulls = [
      version({ branchName: "v0.0.3", state: "working", headCommitSha: null }),
      version({ branchName: "v0.0.0", state: "base", headCommitSha: null }),
    ];
    expect(hasUnpublishedCommits(nulls, "v0.0.3")).toBeNull();
  });

  it("U-TG4c: NULL when there is no list, an empty list, or no row on the working branch", () => {
    expect(hasUnpublishedCommits(null, "v0.0.3")).toBeNull();
    expect(hasUnpublishedCommits([], "v0.0.3")).toBeNull();
    expect(hasUnpublishedCommits(AFTER_PUBLISH, "v9.9.9")).toBeNull();
  });

  it("U-TG4d: the working row is chosen by BRANCH NAME (the server's own choice), not by state", () => {
    // A publish finalize that died between its two writes leaves the row on the current
    // branch marked `published`. The server still treats it as the publish target
    // (project-jobs-service.ts:504-506 filters by branchName only), so we must too.
    const halfFinalized = [
      version({ branchName: "v0.0.3", state: "published", headCommitSha: "aaa" }),
      version({ branchName: "v0.0.0", state: "base", headCommitSha: "aaa" }),
    ];
    expect(hasUnpublishedCommits(halfFinalized, "v0.0.3")).toBe(false);
  });
});

describe("publishButtonGate", () => {
  const base = {
    versions: AFTER_COMMIT,
    isRealProject: true,
    publishing: false,
    committing: false,
    workingBranch: "v0.0.3",
  };

  it("U-TG5a: disabled with an actionable reason when there is nothing to publish", () => {
    const gate = publishButtonGate({ ...base, versions: AFTER_PUBLISH });
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toBe("Nothing new to publish — commit a change first.");
  });

  it("U-TG5b: enabled, with no reason, once a commit is ahead", () => {
    expect(publishButtonGate(base)).toEqual({ enabled: true, reason: null });
  });

  it("U-TG5c: ALWAYS enabled for the mock catalogue — it has no versions list at all", () => {
    // E-PUB4 / E-SP3 click Publish against the mock catalog; disabling there would be a
    // regression dressed as a fix.
    expect(
      publishButtonGate({ ...base, isRealProject: false, versions: null }).enabled,
    ).toBe(true);
    expect(
      publishButtonGate({ ...base, isRealProject: false, versions: AFTER_PUBLISH })
        .enabled,
    ).toBe(true);
  });

  it("U-TG5d: FAILS OPEN — an undecidable versions list leaves the button live", () => {
    expect(publishButtonGate({ ...base, versions: null }).enabled).toBe(true);
    expect(publishButtonGate({ ...base, versions: [] }).enabled).toBe(true);
  });

  it("U-TG6a: disabled while a commit job is in flight (the per-project git-ops 409 guard)", () => {
    const gate = publishButtonGate({ ...base, committing: true });
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toBe("A commit is still running — publish when it finishes.");
  });

  it("U-TG6b: disabled while publishing (pre-existing behaviour, preserved)", () => {
    expect(publishButtonGate({ ...base, publishing: true }).enabled).toBe(false);
  });

  it("U-TG6c: an in-flight commit outranks 'nothing to publish' — the reason names the blocking thing", () => {
    const gate = publishButtonGate({
      ...base,
      versions: AFTER_PUBLISH,
      committing: true,
    });
    expect(gate.reason).toBe("A commit is still running — publish when it finishes.");
  });
});

describe("renderButtonGate", () => {
  const base = { dirty: false, committing: false, renderOpen: false, sceneCount: 5 };

  it("U-TG7a: enabled on a clean project with scenes", () => {
    expect(renderButtonGate(base)).toEqual({ enabled: true, reason: null });
  });

  it("U-TG7b: disabled while DIRTY — a render clones the committed branch, so uncommitted edits would not be in the video", () => {
    const gate = renderButtonGate({ ...base, dirty: true });
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toBe(
      "Commit your changes first — a render is built from the last commit.",
    );
  });

  it("U-TG8a: disabled while the render overlay is already up", () => {
    const gate = renderButtonGate({ ...base, renderOpen: true });
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toBe("A render is already running.");
  });

  it("U-TG8b: disabled while a commit is in flight", () => {
    expect(renderButtonGate({ ...base, committing: true }).enabled).toBe(false);
  });

  it("U-TG8c: disabled with an honest reason when there is nothing to render", () => {
    const gate = renderButtonGate({ ...base, sceneCount: 0 });
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toBe("Generate a storyboard first — there are no scenes yet.");
  });
});
