import { describe, expect, it } from "vitest";

import { DEMO_STORYBOARD } from "./storyboard";
import type { StudioProject } from "./project";
// RED until `lib/studio/publish-review.ts` exists (Step 9 → GREEN). The pure
// 14a review model: the mock commit title/body + the diff-file list whose paths
// are templated off the project id and whose tone is derived from the file
// extension (D-DIFF-TONE). Missing module → clean
// "Cannot find module './publish-review'" RED.
import { publishReview } from "./publish-review";

const PROJECT: StudioProject = {
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
};

describe("publishReview", () => {
  it("U-PR1: produces a non-empty commit title and body", () => {
    const review = publishReview(PROJECT);
    expect(review.title.length).toBeGreaterThan(0);
    expect(review.body.length).toBeGreaterThan(0);
  });

  it("U-PR2: lists exactly 3 modified files, all status M", () => {
    const { files } = publishReview(PROJECT);
    expect(files).toHaveLength(3);
    expect(files.every((f) => f.status === "M")).toBe(true);
  });

  it("U-PR3: tone is derived from the extension — .tsx = code (green), .json = data (gold) [D-DIFF-TONE]", () => {
    const { files } = publishReview(PROJECT);
    const tsx = files.filter((f) => f.path.endsWith(".tsx"));
    const json = files.filter((f) => f.path.endsWith(".json"));
    expect(tsx).toHaveLength(2);
    expect(json).toHaveLength(1);
    expect(tsx.every((f) => f.tone === "code")).toBe(true);
    expect(json.every((f) => f.tone === "data")).toBe(true);
  });

  it("U-PR4: diff paths are derived off the project id, NOT the design-tool's psalm-23 mock", () => {
    const { files } = publishReview(PROJECT);
    const dataRow = files.find((f) => f.tone === "data")!;
    expect(dataRow.path).toContain("psalm-121");
    expect(files.some((f) => f.path.includes("psalm-23"))).toBe(false);
  });
});
