import { describe, expect, it } from "vitest";

// Not yet implemented — RED until `lib/studio/project.ts` exists (Step 9 →
// GREEN). The `/studio/[id]` project model: the id → project lookup that
// replaces the bare `/studio` static storyboard, plus the version-branch
// derivations the 13b top bar (Commit/Publish) reads.
import {
  findStudioProject,
  nextVersion,
  publishLabel,
  studioChipUrl,
  studioUrl,
} from "./project";

describe("findStudioProject", () => {
  it("U-SP1: resolves the two wizard demo ids at their seeded branches", () => {
    const psalm = findStudioProject("psalm-121");
    expect(psalm, "psalm-121 resolves").not.toBeNull();
    expect(psalm!.projectName).toBe("psalm-121");
    expect(psalm!.repo).toBe("ashsrinivas/psalm-121");
    expect(psalm!.versionBranch).toBe("v0.0.1");

    const exodus = findStudioProject("exodus-red-sea");
    expect(exodus, "exodus-red-sea resolves").not.toBeNull();
    expect(exodus!.versionBranch).toBe("v0.2.3");
  });

  it("U-SP2: resolves a workspace demo project id", () => {
    const genesis = findStudioProject("genesis-light");
    expect(genesis, "genesis-light resolves").not.toBeNull();
    expect(genesis!.projectName).toBe("genesis-light");
  });

  it("U-SP3: an unknown id resolves to null (→ notFound() / 404)", () => {
    expect(findStudioProject("does-not-exist")).toBeNull();
  });
});

describe("nextVersion", () => {
  it("U-SP4: increments the patch, integer-wise", () => {
    expect(nextVersion("v0.0.1")).toBe("v0.0.2");
    expect(nextVersion("v0.2.3")).toBe("v0.2.4");
    expect(nextVersion("v0.0.9")).toBe("v0.0.10"); // not v0.0.91
  });
});

describe("publishLabel", () => {
  it("U-SP5: labels the Publish button with the NEXT version", () => {
    expect(publishLabel("v0.0.1")).toBe("Publish v0.0.2 ▸");
    expect(publishLabel("v0.2.3")).toBe("Publish v0.2.4 ▸");
  });
});

describe("studio url helpers", () => {
  it("U-SP6: studioUrl is the app route; studioChipUrl is the terminal-card display", () => {
    expect(studioUrl("psalm-121")).toBe("/studio/psalm-121");
    expect(studioChipUrl("psalm-121")).toBe("supagloo.com/studio/psalm-121");
  });
});
