import { describe, expect, it } from "vitest";

// Not yet implemented — RED until `lib/project-wizard/new-project-model.ts`
// exists (Step 9 → GREEN). The pure 3-step New-project state machine covering
// BOTH the 12a "create new repo" tab and the 13a "use existing empty repo" tab.
import {
  canAdvanceFromRepo,
  canScaffold,
  ctaLabel,
  defaultProjectName,
  deriveProjectId,
  progressFill,
  READY_REDIRECT_MS,
  readyRedirectTarget,
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

/**
 * Feature 2 / figure 18a — the wizard became FOUR steps: repo → scripture → scaffold →
 * ready. The counts, the rail and the step-1 CTA are all collateral of that insertion
 * (design review flag F1: 13a was never redrawn, so it still claimed "STEP 1 OF 3" and a
 * CTA that scaffolds — which step 1 no longer does).
 */
describe("progressFill", () => {
  it("U-NP1: quartered across the 4 steps", () => {
    expect(progressFill("configure")).toBe(25);
    expect(progressFill("scripture")).toBe(50);
    expect(progressFill("scaffolding")).toBe(75);
    expect(progressFill("ready")).toBe(100);
  });
});

describe("stepEyebrow", () => {
  it("U-NP2: STEP 1/2/3 OF 4 eyebrows; the terminal ready step has none", () => {
    expect(stepEyebrow("configure")).toBe("NEW PROJECT · STEP 1 OF 4");
    expect(stepEyebrow("scripture")).toBe("NEW PROJECT · STEP 2 OF 4");
    expect(stepEyebrow("scaffolding")).toBe("NEW PROJECT · STEP 3 OF 4");
    expect(stepEyebrow("ready")).toBeNull();
  });

  it("U-NP2b: no step still claims a 3-step flow", () => {
    // A leftover "OF 3" would be a wrong count on the first screen of the product's main
    // creation flow — and it is exactly what shipped, because 13a was not redrawn.
    for (const step of ["configure", "scripture", "scaffolding", "ready"] as const) {
      expect(stepEyebrow(step) ?? "", step).not.toContain("OF 3");
    }
  });
});

describe("ctaLabel", () => {
  it("U-NP3: step 1 ADVANCES; the scaffold labels move to where they are true", () => {
    // NO DESIGN EXISTS for the new step-1 string — an invention, and the only phrasing
    // that describes what the click now does.
    expect(ctaLabel("configure", "create-new")).toBe("Choose scripture →");
    expect(ctaLabel("configure", "existing-empty")).toBe("Choose scripture →");
    expect(ctaLabel("scripture", "create-new")).toBe("Create & scaffold →");
    expect(ctaLabel("scripture", "existing-empty")).toBe(
      "Scaffold into this repo →",
    );
  });

  it("U-NP3b: nothing promises to GENERATE a storyboard", () => {
    // 18a draws "Generate storyboard →" (flag F2). Storyboard generation needs a project
    // that already exists with a committed manifest — `generateStoryboard()` short-circuits
    // on `!project.manifest` and `POST /v1/ai/generations` takes a projectId — so at step 2
    // no contract that exists could keep that promise.
    for (const step of ["configure", "scripture"] as const) {
      for (const tab of ["create-new", "existing-empty"] as const) {
        expect(ctaLabel(step, tab).toLowerCase(), `${step}/${tab}`).not.toContain(
          "storyboard",
        );
      }
    }
  });
});

describe("canAdvanceFromRepo / canScaffold", () => {
  const PASSAGE = {
    reference: "Psalm 121",
    translation: "ASV",
    passageId: "PSA.121",
  };

  it("U-NP5b: step 1's gate is the repo choice ALONE (scripture is not asked for yet)", () => {
    expect(
      canAdvanceFromRepo({ tab: "create-new", repoName: "psalm-121", selectedRepo: null }),
    ).toBe(true);
    expect(
      canAdvanceFromRepo({ tab: "existing-empty", repoName: "", selectedRepo: EMPTY_REPO }),
    ).toBe(true);
    expect(
      canAdvanceFromRepo({ tab: "existing-empty", repoName: "", selectedRepo: null }),
    ).toBe(false);
  });

  it("U-NP5c: scaffolding additionally requires a CHOSEN PASSAGE", () => {
    // Without this the user reaches the scaffold with an empty scripture step and the
    // seeded manifest is silently blank — the feature appearing to work and doing nothing.
    const base = { tab: "create-new" as const, repoName: "psalm-121", selectedRepo: null };
    expect(canScaffold({ ...base, scripture: null })).toBe(false);
    expect(canScaffold({ ...base, scripture: PASSAGE })).toBe(true);
  });

  it("U-NP5d: a chosen passage cannot rescue an unchosen repo", () => {
    expect(
      canScaffold({
        tab: "existing-empty",
        repoName: "",
        selectedRepo: null,
        scripture: PASSAGE,
      }),
    ).toBe(false);
    expect(
      canScaffold({
        tab: "existing-empty",
        repoName: "",
        selectedRepo: NON_EMPTY_REPO,
        scripture: PASSAGE,
      }),
    ).toBe(false);
  });
});

describe("defaultProjectName", () => {
  it("U-NP4: defaults the project name to the repo short name", () => {
    expect(defaultProjectName("psalm-121")).toBe("psalm-121");
  });
});

describe("canScaffold", () => {
  // Every case here holds the passage FIXED and valid, so what is being measured is
  // still the repo half of the gate.
  const PASSAGE = {
    reference: "Psalm 121",
    translation: "ASV",
    passageId: "PSA.121",
  };

  it("U-NP5: create-new requires a non-empty repo name", () => {
    expect(
      canScaffold({ tab: "create-new", repoName: "", selectedRepo: null, scripture: PASSAGE }),
    ).toBe(false);
    expect(
      canScaffold({ tab: "create-new", repoName: "   ", selectedRepo: null, scripture: PASSAGE }),
    ).toBe(false);
    expect(
      canScaffold({
        tab: "create-new",
        repoName: "psalm-121",
        selectedRepo: null,
        scripture: PASSAGE,
      }),
    ).toBe(true);
  });

  it("U-NP6: existing-empty requires a SELECTED repo that is empty", () => {
    // no selection
    expect(
      canScaffold({ tab: "existing-empty", repoName: "", selectedRepo: null, scripture: PASSAGE }),
    ).toBe(false);
    // a NON-empty repo is disabled — not scaffoldable
    expect(
      canScaffold({
        tab: "existing-empty",
        repoName: "",
        selectedRepo: NON_EMPTY_REPO,
        scripture: PASSAGE,
      }),
    ).toBe(false);
    // an EMPTY repo selected → scaffoldable
    expect(
      canScaffold({
        tab: "existing-empty",
        repoName: "",
        selectedRepo: EMPTY_REPO,
        scripture: PASSAGE,
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

/**
 * Where the "PROJECT READY." card navigates (2026-07-30).
 *
 * The caption "Redirecting automatically…" has been on that card since turn 12 describing
 * behaviour that was never built — there is no `setTimeout`, no effect and no `router.push`
 * outside the button's own handler. The design authority is unanimous that the redirect is
 * the intent (the wireframe section is literally `<!-- STEP 3 — READY / REDIRECT -->`, the
 * provisioning log's final row is `○ Opening studio`, and the structurally identical setup
 * wizard's terminal card carries no such caption), so the redirect is being made real
 * rather than the copy deleted.
 *
 * That makes WHERE it goes safety-critical, which is what this function is for. Both wizard
 * tabs set the slug from the pre-creation typed value; the api assigns it with
 * `nextFreeSlug`, which de-duplicates on a same-owner collision. A human clicking a button
 * can recover from landing on a 404. An automatic redirect cannot, and it gets there faster
 * than a person would. So the target is only ever an identifier the SERVER issued.
 */
describe("readyRedirectTarget", () => {
  it("U-NP9: prefers the slug the server confirmed", () => {
    expect(readyRedirectTarget({ confirmedSlug: "psalm-121-2", projectId: "clx1" })).toBe(
      "psalm-121-2",
    );
  });

  it("U-NP10: falls back to the PROJECT ID — never to the client's guess", () => {
    // `GET /api/projects/:id` can fail transiently. The project id came back from the
    // create call, so it is server-issued too, and `/studio/<id>` resolves it.
    expect(readyRedirectTarget({ confirmedSlug: null, projectId: "clx1" })).toBe("clx1");
    expect(readyRedirectTarget({ confirmedSlug: "", projectId: "clx1" })).toBe("clx1");
  });

  it("U-NP11: with neither, there is NO target — the card stays put rather than guessing", () => {
    // The mock/demo path has no server at all; it passes its own derived id explicitly.
    expect(readyRedirectTarget({ confirmedSlug: null, projectId: "" })).toBeNull();
  });

  it("U-NP12: the delay is a real, non-instant pause the user can read the card in", () => {
    // No countdown number is drawn anywhere in the wireframes, so none is invented on
    // screen — but the card has a ✓, a branch name and a URL chip to take in, so an
    // instant redirect would flash content the design intends to be read.
    expect(READY_REDIRECT_MS).toBeGreaterThanOrEqual(1500);
    expect(READY_REDIRECT_MS).toBeLessThanOrEqual(6000);
  });
});
