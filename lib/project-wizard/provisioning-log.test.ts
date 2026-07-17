import { describe, expect, it } from "vitest";

// Not yet implemented — RED until `lib/project-wizard/provisioning-log.ts`
// exists (Step 9 → GREEN). The pure log sequencer + row copy shared by
// New-project step 2 (scaffolding) and Import step 2 (verifying).
import {
  PROVISION_ROW_DELAY_MS,
  advanceLog,
  importLogRows,
  initLog,
  isLogComplete,
  logRowStatus,
  newProjectLogRows,
  // RED until `publishLogRows` is added to `provisioning-log.ts` (Step 9). The
  // module resolves (it already exists), so this fails with a missing-export
  // error, the intended TDD signal for the new 14a publishing-log copy.
  publishLogRows,
} from "./provisioning-log";

const NP_CTX = { fullName: "ashsrinivas/psalm-121", branch: "v0.0.1" };

describe("newProjectLogRows", () => {
  it("U-PL1: create-new = the full 7-line git dance (v0.0.0 → PR → v0.0.1)", () => {
    expect(newProjectLogRows("create-new", NP_CTX)).toEqual([
      "Created repo ashsrinivas/psalm-121",
      "Cloned to Railway workspace",
      "Scaffolded Remotion project",
      "Checked out v0.0.0 · committed initial files",
      "Pushed → opened & merged PR into main",
      "Pulled main · branching v0.0.1 · pushing…",
      "Opening studio",
    ]);
  });

  it("U-PL2: existing-empty drops ONLY the 'Created repo' row (the 13a gap)", () => {
    const rows = newProjectLogRows("existing-empty", NP_CTX);
    expect(rows).toEqual([
      "Cloned to Railway workspace",
      "Scaffolded Remotion project",
      "Checked out v0.0.0 · committed initial files",
      "Pushed → opened & merged PR into main",
      "Pulled main · branching v0.0.1 · pushing…",
      "Opening studio",
    ]);
    expect(rows).toHaveLength(6);
    expect(rows.some((r) => r.startsWith("Created repo"))).toBe(false);
  });
});

describe("publishLogRows", () => {
  it("U-PL9: = the 5 publish-flow git lines (commit → push → PR → merge/tag → cut next branch)", () => {
    expect(
      publishLogRows({
        workingBranch: "v0.0.1",
        publishedVersion: "v0.0.2",
        nextBranch: "v0.0.3",
      }),
    ).toEqual([
      "Committed to v0.0.1",
      "Pushed branch to origin",
      "Opened PR #7 → main",
      "Merging PR & tagging v0.0.2…",
      "Pull main · cut branch v0.0.3",
    ]);
  });
});

describe("importLogRows", () => {
  it("U-PL3: = the 4 verifying lines, templated with the latest branch", () => {
    expect(importLogRows({ latestBranch: "v0.2.3" })).toEqual([
      "Cloned to Railway workspace",
      "Found valid Remotion project · remotion.config.ts",
      "Latest version branch v0.2.3",
      "Checking out v0.2.3 · opening studio…",
    ]);
  });
});

describe("log sequencer", () => {
  const ROWS = ["a", "b", "c"] as const;

  it("U-PL4: initLog starts at activeIndex 0, not complete", () => {
    const seq = initLog(ROWS);
    expect(seq.activeIndex).toBe(0);
    expect(seq.rows).toEqual(["a", "b", "c"]);
    expect(isLogComplete(seq)).toBe(false);
  });

  it("U-PL5: logRowStatus maps cursor → completed/active/queued", () => {
    const seq = initLog(ROWS);
    expect(logRowStatus(seq, 0)).toBe("active");
    expect(logRowStatus(seq, 1)).toBe("queued");
    expect(logRowStatus(seq, 2)).toBe("queued");

    const one = advanceLog(seq);
    expect(one.activeIndex).toBe(1);
    expect(logRowStatus(one, 0)).toBe("completed");
    expect(logRowStatus(one, 1)).toBe("active");
    expect(logRowStatus(one, 2)).toBe("queued");
  });

  it("U-PL6: advancing past the last row completes and clamps at rows.length", () => {
    let seq = initLog(ROWS);
    seq = advanceLog(advanceLog(advanceLog(seq)));
    expect(seq.activeIndex).toBe(3);
    expect(isLogComplete(seq)).toBe(true);
    // every row reads completed at the terminal cursor
    expect(logRowStatus(seq, 0)).toBe("completed");
    expect(logRowStatus(seq, 1)).toBe("completed");
    expect(logRowStatus(seq, 2)).toBe("completed");
    // clamped — never runs off the end
    expect(advanceLog(seq).activeIndex).toBe(3);
  });

  it("U-PL7: advanceLog is pure — it does not mutate its input", () => {
    const seq = initLog(ROWS);
    advanceLog(seq);
    expect(seq.activeIndex).toBe(0);
  });

  it("U-PL8: PROVISION_ROW_DELAY_MS is a positive tick interval", () => {
    expect(typeof PROVISION_ROW_DELAY_MS).toBe("number");
    expect(PROVISION_ROW_DELAY_MS).toBeGreaterThan(0);
  });
});
