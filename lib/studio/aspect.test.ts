import { describe, expect, it } from "vitest";

// Not yet implemented — RED until `lib/studio/aspect.ts` exists.
import { ASPECTS, aspectDimensions, fitDisplayBox } from "./aspect";

describe("ASPECTS", () => {
  it("U-A0: lists the three supported aspect ratios in toggle order", () => {
    expect(ASPECTS).toEqual(["9:16", "16:9", "1:1"]);
  });
});

describe("aspectDimensions", () => {
  it("U-A1: maps each aspect to its composition resolution", () => {
    expect(aspectDimensions("9:16")).toEqual({ width: 1080, height: 1920 });
    expect(aspectDimensions("16:9")).toEqual({ width: 1920, height: 1080 });
    expect(aspectDimensions("1:1")).toEqual({ width: 1080, height: 1080 });
  });
});

describe("fitDisplayBox", () => {
  it("U-A2a: 9:16 fits height-bound within (320, 540), preserving ratio", () => {
    const box = fitDisplayBox("9:16", 320, 540);
    expect(box.height).toBeCloseTo(540, 5);
    expect(box.width).toBeCloseTo(303.75, 5); // 540 * (1080/1920)
    expect(box.width / box.height).toBeCloseTo(0.5625, 5);
    expect(box.width).toBeLessThanOrEqual(320);
    expect(box.height).toBeLessThanOrEqual(540);
    // portrait: taller than wide
    expect(box.height).toBeGreaterThan(box.width);
  });

  it("U-A2b: 16:9 fits width-bound within (320, 540), preserving ratio", () => {
    const box = fitDisplayBox("16:9", 320, 540);
    expect(box.width).toBeCloseTo(320, 5);
    expect(box.height).toBeCloseTo(180, 5); // 320 * (1080/1920)
    expect(box.width / box.height).toBeCloseTo(1.7778, 3);
    expect(box.width).toBeLessThanOrEqual(320);
    expect(box.height).toBeLessThanOrEqual(540);
    // landscape: wider than tall
    expect(box.width).toBeGreaterThan(box.height);
  });

  it("U-A2c: 1:1 fits width-bound as a square within (320, 540)", () => {
    const box = fitDisplayBox("1:1", 320, 540);
    expect(box.width).toBeCloseTo(320, 5);
    expect(box.height).toBeCloseTo(320, 5);
    expect(box.width).toBeCloseTo(box.height, 5);
  });
});
