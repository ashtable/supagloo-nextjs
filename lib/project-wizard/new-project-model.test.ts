import { describe, expect, it } from "vitest";

// Not yet implemented — RED until `lib/project-wizard/new-project-model.ts`
// exists (Step 9 → GREEN). The pure 3-step New-project state machine covering
// BOTH the 12a "create new repo" tab and the 13a "use existing empty repo" tab.
import {
  canScaffold,
  ctaLabel,
  defaultProjectName,
  deriveProjectId,
  progressFill,
  stepEyebrow,
} from "./new-project-model";
// Type-only — stripped at transpile, so this suite goes RED purely on the
// missing `./new-project-model` value import above (not on repos-model).
import type { MockRepo } from "./repos-model";

const EMPTY_REPO: MockRepo = {
  fullName: "ashsrinivas/psalm-121",
  shortName: "psalm-121",
  owner: "ashsrinivas",
  isEmpty: true,
  isSupaglooProject: false,
  updatedLabel: "Empty · created just now",
  latestBranch: null,
};

const NON_EMPTY_REPO: MockRepo = {
  fullName: "ashsrinivas/genesis-light",
  shortName: "genesis-light",
  owner: "ashsrinivas",
  isEmpty: false,
  isSupaglooProject: true,
  updatedLabel: "Already contains a project",
  latestBranch: "v0.0.1",
};

describe("progressFill", () => {
  it("U-NP1: 33 / 66 / 100 across the 3 steps", () => {
    expect(progressFill("configure")).toBe(33);
    expect(progressFill("scaffolding")).toBe(66);
    expect(progressFill("ready")).toBe(100);
  });
});

describe("stepEyebrow", () => {
  it("U-NP2: STEP 1/2 OF 3 eyebrows; the terminal ready step has none", () => {
    expect(stepEyebrow("configure")).toBe("NEW PROJECT · STEP 1 OF 3");
    expect(stepEyebrow("scaffolding")).toBe("NEW PROJECT · STEP 2 OF 3");
    expect(stepEyebrow("ready")).toBeNull();
  });
});

describe("ctaLabel", () => {
  it("U-NP3: the primary CTA differs per tab", () => {
    expect(ctaLabel("create-new")).toBe("Create & scaffold →");
    expect(ctaLabel("existing-empty")).toBe("Scaffold into this repo →");
  });
});

describe("defaultProjectName", () => {
  it("U-NP4: defaults the project name to the repo short name", () => {
    expect(defaultProjectName("psalm-121")).toBe("psalm-121");
  });
});

describe("canScaffold", () => {
  it("U-NP5: create-new requires a non-empty repo name", () => {
    expect(
      canScaffold({ tab: "create-new", repoName: "", selectedRepo: null }),
    ).toBe(false);
    expect(
      canScaffold({ tab: "create-new", repoName: "   ", selectedRepo: null }),
    ).toBe(false);
    expect(
      canScaffold({
        tab: "create-new",
        repoName: "psalm-121",
        selectedRepo: null,
      }),
    ).toBe(true);
  });

  it("U-NP6: existing-empty requires a SELECTED repo that is empty", () => {
    // no selection
    expect(
      canScaffold({ tab: "existing-empty", repoName: "", selectedRepo: null }),
    ).toBe(false);
    // a NON-empty repo is disabled — not scaffoldable
    expect(
      canScaffold({
        tab: "existing-empty",
        repoName: "",
        selectedRepo: NON_EMPTY_REPO,
      }),
    ).toBe(false);
    // an EMPTY repo selected → scaffoldable
    expect(
      canScaffold({
        tab: "existing-empty",
        repoName: "",
        selectedRepo: EMPTY_REPO,
      }),
    ).toBe(true);
  });
});

describe("deriveProjectId", () => {
  it("U-NP7: create-new derives the id from the typed repo name", () => {
    expect(
      deriveProjectId({
        tab: "create-new",
        repoName: "psalm-121",
        selectedRepo: null,
      }),
    ).toBe("psalm-121");
  });

  it("U-NP8: existing-empty derives the id from the selected repo", () => {
    expect(
      deriveProjectId({
        tab: "existing-empty",
        repoName: "",
        selectedRepo: EMPTY_REPO,
      }),
    ).toBe("psalm-121");
  });
});
