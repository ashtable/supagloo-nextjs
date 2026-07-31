import { describe, expect, it } from "vitest";

// `./wizard-model` does not exist yet — RED until Step 9 creates
// `lib/onboarding/wizard-model.ts`. The mock design has no working stepper (it's
// a static filmstrip); this state machine is designed from scratch (plan §1.2).
import {
  WIZARD_STEPS,
  progressFill,
  stepLabel,
  isSkippable,
  nextStep,
  stepAfterSkip,
  doneRecap,
} from "./wizard-model";

// Connections seeds drive the templated recap.
import {
  seedNoneLinked,
  seedAllLinked,
  completeConnect,
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

describe("advancement — R1: NO step is a hard gate any more", () => {
  /**
   * R1 (2026-07-31) DELETES the GitHub hard gate, and this is a deliberate reversal of
   * stated design intent — TURN 11's own subtitle reads *"first-time setup (GitHub
   * required · OpenRouter + Gloo optional)"*.
   *
   * The reason is that the gate made the wizard a single point of failure for the entire
   * product: any bug in it locked every new user out of everything. Connections are now
   * optional at onboarding and enforced AT THE POINT OF USE — R3's create/import guardrail
   * and the api's `provider_not_connected` 409.
   *
   * `canAdvance` is GONE rather than made to always return true. A predicate that cannot
   * answer anything else is not a gate, it is dead weight that reads like one; and the
   * wizard's auto-advance effect used to call it, so leaving it returning `true` would have
   * made the effect skip the GitHub step the instant it mounted.
   */
  it("UW-3a: `canAdvance` no longer exists — the gate is gone, not stubbed", async () => {
    const mod = (await import("./wizard-model")) as Record<string, unknown>;
    expect(Object.keys(mod)).not.toContain("canAdvance");
  });

  it("UW-3c: github, openrouter and gloo are ALL skippable; welcome and done are not", () => {
    // `isSkippable` becomes the SINGLE source of skippability. It was exported and
    // unit-tested but imported by zero components — the wizard hard-coded the answer by
    // passing `onSkip` to two step components. R1 makes the component consult the predicate,
    // so this test now governs what actually renders.
    expect(isSkippable("github")).toBe(true);
    expect(isSkippable("openrouter")).toBe(true);
    expect(isSkippable("gloo")).toBe(true);
    // Welcome has nothing to skip (it is a preamble) and Done is the exit itself.
    expect(isSkippable("welcome")).toBe(false);
    expect(isSkippable("done")).toBe(false);
  });

  it("UW-3e: skipping github lands on openrouter — the chain is unbroken", () => {
    expect(stepAfterSkip("github")).toBe("openrouter");
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
