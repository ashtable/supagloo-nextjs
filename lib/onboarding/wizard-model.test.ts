import { describe, expect, it } from "vitest";

// `./wizard-model` does not exist yet — RED until Step 9 creates
// `lib/onboarding/wizard-model.ts`. The mock design has no working stepper (it's
// a static filmstrip); this state machine is designed from scratch (plan §1.2).
import {
  WIZARD_STEPS,
  progressFill,
  stepLabel,
  canAdvance,
  isSkippable,
  nextStep,
  stepAfterSkip,
  doneRecap,
} from "./wizard-model";

// Connections seeds drive the github gate + the templated recap.
import {
  seedNoneLinked,
  seedAllLinked,
  completeConnect,
  disconnect,
} from "../connections/connections-model";

describe("step order + progress", () => {
  it("UW-1a: WIZARD_STEPS is welcome → github → openrouter → gloo → done", () => {
    expect(WIZARD_STEPS).toEqual([
      "welcome",
      "github",
      "openrouter",
      "gloo",
      "done",
    ]);
  });

  it("UW-1b: progressFill is 20 / 45 / 70 / 92 / 100 percent", () => {
    expect(progressFill("welcome")).toBe(20);
    expect(progressFill("github")).toBe(45);
    expect(progressFill("openrouter")).toBe(70);
    expect(progressFill("gloo")).toBe(92);
    expect(progressFill("done")).toBe(100);
  });
});

describe("stepLabel — the 'STEP n OF 4 · …' eyebrow (Done has no ordinal)", () => {
  it("UW-2: labels the four ordinal steps and returns null for done", () => {
    expect(stepLabel("welcome")).toBe("STEP 1 OF 4 · WELCOME");
    expect(stepLabel("github")).toBe("STEP 2 OF 4 · CONNECT GITHUB");
    expect(stepLabel("openrouter")).toBe("STEP 3 OF 4 · OPENROUTER");
    expect(stepLabel("gloo")).toBe("STEP 4 OF 4 · GLOO AI");
    expect(stepLabel("done")).toBeNull();
  });
});

describe("advancement — the GitHub hard gate + skippability", () => {
  it("UW-3a: github cannot advance until github is connected (hard gate, ambiguity #3)", () => {
    // Even with every OTHER provider connected, github blocks until github itself is.
    const allButGithub = disconnect(seedAllLinked(), "github");
    expect(canAdvance("github", allButGithub)).toBe(false);

    const githubConnected = completeConnect(seedNoneLinked(), "github");
    expect(canAdvance("github", githubConnected)).toBe(true);
  });

  it("UW-3b: every non-github step advances freely (no gate)", () => {
    const none = seedNoneLinked();
    expect(canAdvance("welcome", none)).toBe(true);
    expect(canAdvance("openrouter", none)).toBe(true);
    expect(canAdvance("gloo", none)).toBe(true);
  });

  it("UW-3c: openrouter + gloo are skippable; welcome, github, done are not", () => {
    expect(isSkippable("openrouter")).toBe(true);
    expect(isSkippable("gloo")).toBe(true);
    expect(isSkippable("welcome")).toBe(false);
    expect(isSkippable("github")).toBe(false);
    expect(isSkippable("done")).toBe(false);
  });

  it("UW-3d: nextStep walks the chain; stepAfterSkip jumps past a skipped optional step", () => {
    expect(nextStep("welcome")).toBe("github");
    expect(nextStep("github")).toBe("openrouter");
    expect(nextStep("openrouter")).toBe("gloo");
    expect(nextStep("gloo")).toBe("done");
    expect(nextStep("done")).toBeNull();

    expect(stepAfterSkip("openrouter")).toBe("gloo");
    expect(stepAfterSkip("gloo")).toBe("done");
  });
});

describe("doneRecap — templated from ACTUAL mock state (ambiguity #4)", () => {
  it("UW-4a: all connected → three ✓ rows, GitHub carrying its username", () => {
    const rows = doneRecap(seedAllLinked());
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      provider: "github",
      connected: true,
      text: "✓ GitHub connected · @ashsrinivas",
    });
    expect(rows[1]).toMatchObject({
      provider: "openrouter",
      connected: true,
      text: "✓ OpenRouter connected",
    });
    expect(rows[2]).toMatchObject({
      provider: "gloo",
      connected: true,
      text: "✓ Gloo AI connected",
    });
  });

  it("UW-4b: github-only path (openrouter + gloo skipped) → the skipped copy, not the wireframe row", () => {
    const githubOnly = completeConnect(seedNoneLinked(), "github");
    const rows = doneRecap(githubOnly);
    expect(rows[0].text).toBe("✓ GitHub connected · @ashsrinivas");
    expect(rows[1]).toMatchObject({
      provider: "openrouter",
      connected: false,
      text: "— OpenRouter skipped · add later in Profile",
    });
    expect(rows[2]).toMatchObject({
      provider: "gloo",
      connected: false,
      text: "— Gloo AI skipped · add later in Profile",
    });
  });
});
