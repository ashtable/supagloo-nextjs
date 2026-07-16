import { describe, expect, it } from "vitest";

// These modules do not exist yet — this import is expected to fail (RED) until the
// implementation step creates `lib/studio/time.ts`. The missing-module failure is
// the point: the whole suite fails until the pure time↔frame seam ships.
import { secondsToFrames, framesToSeconds, formatTimecode } from "./time";

describe("secondsToFrames", () => {
  it("U-T1a: converts whole seconds at 30fps", () => {
    expect(secondsToFrames(5, 30)).toBe(150);
    expect(secondsToFrames(9, 30)).toBe(270);
    expect(secondsToFrames(8, 30)).toBe(240);
  });

  it("U-T1b: converts sub-second values at 30fps", () => {
    expect(secondsToFrames(0.5, 30)).toBe(15);
  });

  it("U-T1c: rounds to the nearest whole frame (e.g. 29.97fps)", () => {
    expect(secondsToFrames(1, 29.97)).toBe(30); // Math.round(29.97)
    expect(secondsToFrames(0.48, 30)).toBe(14); // Math.round(14.4)
    expect(secondsToFrames(0.49, 30)).toBe(15); // Math.round(14.7)
  });
});

describe("framesToSeconds", () => {
  it("U-T2: converts frames back to seconds at 30fps", () => {
    expect(framesToSeconds(150, 30)).toBe(5);
    expect(framesToSeconds(900, 30)).toBe(30);
    expect(framesToSeconds(0, 30)).toBe(0);
  });
});

describe("formatTimecode", () => {
  it("U-T3: formats seconds as m:ss, zero-padded, flooring fractions", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(8)).toBe("0:08");
    expect(formatTimecode(30)).toBe("0:30");
    expect(formatTimecode(65)).toBe("1:05");
    expect(formatTimecode(8.9)).toBe("0:08"); // floors, does not round
  });
});
