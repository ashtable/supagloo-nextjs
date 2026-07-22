import { describe, expect, it } from "vitest";

// `./start-cards-model` does not exist yet — this import fails (RED) until the
// implementation step creates `lib/landing/start-cards-model.ts`.
import {
  BLANK_CANVAS_HREF,
  COMING_SOON_LABEL,
  LANDING_START_CARDS,
  START_ENTRY_POINTS,
} from "./start-cards-model";

describe("START_ENTRY_POINTS (the 4 landing origin entry points)", () => {
  it("U1: 'blank' is the only enabled origin in v1 — and it is not coming-soon", () => {
    expect(START_ENTRY_POINTS.blank.enabled).toBe(true);
    expect(START_ENTRY_POINTS.blank.comingSoon).toBe(false);
  });

  it("U2: votd / passage / demo are disabled and marked coming-soon", () => {
    for (const origin of ["votd", "passage", "demo"] as const) {
      expect(START_ENTRY_POINTS[origin].enabled, origin).toBe(false);
      expect(START_ENTRY_POINTS[origin].comingSoon, origin).toBe(true);
    }
  });

  it("U3: each entry carries its E2E testid (demo lives in featured-demo)", () => {
    expect(START_ENTRY_POINTS.votd.testId).toBe("start-card-votd");
    expect(START_ENTRY_POINTS.passage.testId).toBe("start-card-passage");
    expect(START_ENTRY_POINTS.blank.testId).toBe("start-card-blank");
    expect(START_ENTRY_POINTS.demo.testId).toBe("start-demo");
  });

  it("U4: each entry echoes its own createdFrom key (safe to pass around detached)", () => {
    for (const origin of ["votd", "passage", "demo", "blank"] as const) {
      expect(START_ENTRY_POINTS[origin].createdFrom).toBe(origin);
    }
  });

  it("U5: landing-card copy is glyph-exact from the wireframe (the e2e anchors)", () => {
    // Hardcoded here (not read from the SUT) so this is a concrete expectation.
    expect(START_ENTRY_POINTS.votd.title).toBe("Verse of the Day");
    expect(START_ENTRY_POINTS.votd.desc).toBe(
      "Today's YouVersion verse, auto-loaded.",
    );
    expect(START_ENTRY_POINTS.passage.title).toBe("From a passage");
    expect(START_ENTRY_POINTS.passage.desc).toBe(
      "Pick any book, chapter & verses.",
    );
    expect(START_ENTRY_POINTS.blank.title).toBe("Blank canvas");
    expect(START_ENTRY_POINTS.blank.desc).toBe("Build the flow from scratch.");
  });
});

describe("LANDING_START_CARDS (the 'or start your own' trio)", () => {
  it("U6: renders votd, passage, blank — in wireframe order; demo is NOT a card", () => {
    expect(LANDING_START_CARDS.map((c) => c.createdFrom)).toEqual([
      "votd",
      "passage",
      "blank",
    ]);
  });
});

describe("shared copy / routing constants", () => {
  it("U7: the blank-canvas card routes into the workspace new-project intent", () => {
    expect(BLANK_CANVAS_HREF).toBe("/?newproject=blank");
  });

  it("U8: the coming-soon pill label", () => {
    expect(COMING_SOON_LABEL).toBe("Coming soon");
  });
});
