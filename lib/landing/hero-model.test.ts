import { describe, expect, it } from "vitest";

// `./hero-model` does not exist yet — this import is expected to fail (RED) until
// the implementation step creates `lib/landing/hero-model.ts`. That missing-module
// failure is the point: it fails the whole suite until the pure auth-seam ships.
import { heroModel, welcomeEyebrow } from "./hero-model";

// Exact desktop-canonical hero strings, glyph-for-glyph from the wireframe (8a/9a).
// Em dash U+2014, middot U+00B7. Hardcoded here (not imported from the SUT's own
// constants) so the assertions are concrete expectations, not tautologies.
const SUBCOPY_BASE =
  "Pick a verse — Supagloo storyboards it, narrates it in the voice you describe, and scores it into a share-ready short.";
const SIGN_IN_SENTENCE = " Sign in with your YouVersion account to begin.";
const EYEBROW_SIGNED_OUT = "SCRIPTURE VIDEO STUDIO · BUILT ON YOUVERSION";

describe("welcomeEyebrow", () => {
  it("U1: builds 'WELCOME BACK, <FIRST> · READY WHEN YOU ARE' from a full name", () => {
    expect(welcomeEyebrow("Ash Srinivas")).toBe(
      "WELCOME BACK, ASH · READY WHEN YOU ARE",
    );
  });

  it("U2: uppercases and uses only the first whitespace-delimited token", () => {
    expect(welcomeEyebrow("ash van srinivas")).toBe(
      "WELCOME BACK, ASH · READY WHEN YOU ARE",
    );
  });

  it("U3: falls back (no name segment) for empty / whitespace / undefined input", () => {
    const fallback = "WELCOME BACK · READY WHEN YOU ARE";
    expect(welcomeEyebrow(undefined)).toBe(fallback);
    expect(welcomeEyebrow("")).toBe(fallback);
    expect(welcomeEyebrow("   ")).toBe(fallback);
  });
});

describe("heroModel", () => {
  it("U4: signed-out is the 8a hero (eyebrow, demo primary, hero-sign-in flag)", () => {
    const m = heroModel(false);
    expect(m.eyebrow).toBe(EYEBROW_SIGNED_OUT);
    expect(m.primaryCta).toBe("demo");
    expect(m.showHeroSignIn).toBe(true);
  });

  it("U5: signed-out sub-copy is the base copy plus the sign-in sentence", () => {
    const m = heroModel(false);
    expect(m.subCopy).toBe(SUBCOPY_BASE + SIGN_IN_SENTENCE);
    expect(m.subCopy.endsWith(SIGN_IN_SENTENCE)).toBe(true);
  });

  it("U6: signed-in is the 9a hero (welcome eyebrow, start primary, no hero sign-in)", () => {
    const m = heroModel(true, "Ash Srinivas");
    expect(m.eyebrow).toBe("WELCOME BACK, ASH · READY WHEN YOU ARE");
    expect(m.primaryCta).toBe("start");
    expect(m.showHeroSignIn).toBe(false);
  });

  it("U7: signed-in sub-copy is the base copy, without the sign-in sentence", () => {
    const m = heroModel(true, "Ash Srinivas");
    expect(m.subCopy).toBe(SUBCOPY_BASE);
    expect(m.subCopy.includes("Sign in with your YouVersion account")).toBe(
      false,
    );
  });

  it("U8: signed-in with no name uses the fallback welcome eyebrow", () => {
    expect(heroModel(true).eyebrow).toBe("WELCOME BACK · READY WHEN YOU ARE");
  });
});
