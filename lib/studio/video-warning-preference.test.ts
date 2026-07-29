import { describe, it, expect } from "vitest";
import {
  clearVideoWarningPreference,
  shouldWarnBeforeVideo,
  suppressVideoWarning,
  videoWarningKey,
  type PreferenceStorage,
} from "./video-warning-preference";

/** An in-memory `localStorage`. */
function memory(seed: Record<string, string> = {}): PreferenceStorage & {
  data: Record<string, string>;
} {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

/** Safari private mode: every access THROWS rather than returning null. */
const throwing: PreferenceStorage = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("SecurityError");
  },
  removeItem() {
    throw new Error("SecurityError");
  },
};

describe("the 20b don't-warn-again preference", () => {
  it("U-D8: warns by default", () => {
    expect(shouldWarnBeforeVideo("p1", memory())).toBe(true);
  });

  it("U-D9: suppressing it stops the warning for THAT project only", () => {
    // The figure labels it "for this project". A user who accepts the cost on one
    // four-scene devotional has not accepted it on a different project.
    const s = memory();
    suppressVideoWarning("p1", s);
    expect(shouldWarnBeforeVideo("p1", s)).toBe(false);
    expect(shouldWarnBeforeVideo("p2", s)).toBe(true);
  });

  it("U-D10: clearing restores the warning", () => {
    const s = memory();
    suppressVideoWarning("p1", s);
    clearVideoWarningPreference("p1", s);
    expect(shouldWarnBeforeVideo("p1", s)).toBe(true);
  });

  it("U-D11: the key is namespaced so nothing else on the origin can collide", () => {
    expect(videoWarningKey("p1")).toBe("supagloo.videoWarn.p1");
    expect(videoWarningKey("p1")).not.toBe(videoWarningKey("p2"));
  });

  it("U-D12: any value other than the exact flag means WARN", () => {
    // Corrupt / hand-edited / written by an older build. The fail-safe direction is a
    // dialog the user has seen before, never a silent spend.
    for (const v of ["0", "true", "", "yes", "{}"]) {
      expect(shouldWarnBeforeVideo("p1", memory({ "supagloo.videoWarn.p1": v })), v).toBe(
        true,
      );
    }
  });

  it("U-D13: storage that THROWS degrades to warning, never to a thrown click handler", () => {
    // Safari private mode throws on access. This runs inside the ▶ Generate video click
    // path, so a throw here would break the button outright.
    expect(() => shouldWarnBeforeVideo("p1", throwing)).not.toThrow();
    expect(shouldWarnBeforeVideo("p1", throwing)).toBe(true);
    expect(() => suppressVideoWarning("p1", throwing)).not.toThrow();
    expect(() => clearVideoWarningPreference("p1", throwing)).not.toThrow();
  });

  it("U-D14: no storage at all (SSR) degrades to warning", () => {
    expect(shouldWarnBeforeVideo("p1", null)).toBe(true);
    expect(() => suppressVideoWarning("p1", null)).not.toThrow();
  });
});
