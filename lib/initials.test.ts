import { describe, expect, it } from "vitest";

// `initials` does not exist yet — this import is expected to fail (RED) until
// Step 9 creates `lib/initials.ts`. That missing-symbol failure is the point.
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letter of the first and last words, uppercased", () => {
    expect(initials("Ash Srinivas")).toBe("AS");
  });

  it("uses the first two letters for a single-word name, uppercased", () => {
    expect(initials("madonna")).toBe("MA");
  });

  it("collapses extra whitespace and uses first + last word", () => {
    expect(initials("  ash  van  srinivas ")).toBe("AS");
  });

  it("returns an empty string for empty input", () => {
    expect(initials("")).toBe("");
  });

  it("returns an empty string for undefined input", () => {
    expect(initials(undefined)).toBe("");
  });
});
