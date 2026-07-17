import { describe, expect, it } from "vitest";

// Not yet implemented — RED until `lib/project-wizard/import-model.ts` exists
// (Step 9 → GREEN). The pure 2-step Import state machine + its error branch.
import {
  IMPORT_FAILED_EYEBROW,
  canImport,
  deriveProjectId,
  progressFill,
  stepEyebrow,
  verifyOutcome,
} from "./import-model";
// Type-only — stripped at transpile, so RED is on the missing `./import-model`
// value import above, not on repos-model.
import type { MockRepo } from "./repos-model";

const SUPAGLOO_REPO: MockRepo = {
  fullName: "ashsrinivas/exodus-red-sea",
  shortName: "exodus-red-sea",
  owner: "ashsrinivas",
  isEmpty: false,
  isSupaglooProject: true,
  updatedLabel: "Updated 5 days ago",
  latestBranch: "v0.2.3",
};

const NOT_A_PROJECT_REPO: MockRepo = {
  fullName: "ashsrinivas/notes-app",
  shortName: "notes-app",
  owner: "ashsrinivas",
  isEmpty: false,
  isSupaglooProject: false,
  updatedLabel: "Updated 2 weeks ago",
  latestBranch: null,
};

describe("progressFill", () => {
  it("U-IM1: 50 / 88 across the 2 steps (approximate per-step feel)", () => {
    expect(progressFill("pick")).toBe(50);
    expect(progressFill("verifying")).toBe(88);
  });
});

describe("stepEyebrow / IMPORT_FAILED_EYEBROW", () => {
  it("U-IM2: STEP 1/2 OF 2 eyebrows; a distinct failed eyebrow", () => {
    expect(stepEyebrow("pick")).toBe("IMPORT PROJECT · STEP 1 OF 2");
    expect(stepEyebrow("verifying")).toBe("IMPORT PROJECT · STEP 2 OF 2");
    expect(IMPORT_FAILED_EYEBROW).toBe("IMPORT FAILED");
  });
});

describe("canImport", () => {
  it("U-IM3: needs a selected repo", () => {
    expect(canImport(null)).toBe(false);
    expect(canImport(SUPAGLOO_REPO)).toBe(true);
  });
});

describe("verifyOutcome", () => {
  it("U-IM4: success iff the repo is a Supagloo project", () => {
    expect(verifyOutcome(SUPAGLOO_REPO)).toBe("success");
    expect(verifyOutcome(NOT_A_PROJECT_REPO)).toBe("failure");
  });
});

describe("deriveProjectId", () => {
  it("U-IM5: the id is the selected repo's short name", () => {
    expect(deriveProjectId(SUPAGLOO_REPO)).toBe("exodus-red-sea");
  });
});
