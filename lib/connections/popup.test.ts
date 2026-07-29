import { describe, expect, it, vi } from "vitest";

import {
  POPUP_BLOCKED_MESSAGE,
  navigateTab,
  openBlankTab,
  type NavigableTab,
} from "./popup";

/** A stand-in for the `Window` handle `window.open` hands back. */
const fakeTab = (): NavigableTab => ({ location: { href: "" } });

describe("openBlankTab", () => {
  it("opens about:blank in a new tab and returns the handle", () => {
    const tab = fakeTab();
    const open = vi.fn(() => tab);
    expect(openBlankTab(open)).toBe(tab);
    // The URL is empty ON PURPOSE: the authorize URL needs an async PKCE digest, and
    // the tab has to be claimed synchronously under the click's user activation.
    expect(open).toHaveBeenCalledWith("", "_blank");
  });

  // The whole reason this module exists. `window.open` does NOT throw on a blocked
  // popup — it returns null — so try/catch alone reads a refusal as success.
  it("returns null when the browser refuses by RETURNING NULL", () => {
    expect(openBlankTab(() => null)).toBeNull();
  });

  it("returns null when the browser refuses by THROWING", () => {
    expect(
      openBlankTab(() => {
        throw new Error("popup blocked");
      }),
    ).toBeNull();
  });

  it("returns null for a handle it could never navigate", () => {
    // A truthy non-window (some environments hand back odd values). Treating this as
    // success would mean navigateTab silently no-ops and the flow polls forever.
    expect(openBlankTab(() => "not-a-window" as unknown)).toBeNull();
    expect(openBlankTab(() => undefined)).toBeNull();
  });
});

describe("navigateTab", () => {
  it("points the claimed tab at the authorize URL", () => {
    const tab = fakeTab();
    expect(navigateTab(tab, "https://openrouter.ai/auth?x=1")).toBe(true);
    expect(tab.location.href).toBe("https://openrouter.ai/auth?x=1");
  });

  it("reports false when the assignment is refused", () => {
    const tab = {
      location: {
        get href() {
          return "";
        },
        set href(_v: string) {
          throw new Error("cross-origin");
        },
      },
    } as NavigableTab;
    expect(navigateTab(tab, "https://openrouter.ai/auth")).toBe(false);
  });
});

describe("POPUP_BLOCKED_MESSAGE", () => {
  it("tells the user what to DO, not merely that something failed", () => {
    // The failure this replaces was silent. A message that only says "failed" would
    // be a smaller version of the same problem, so assert the actionable half.
    expect(POPUP_BLOCKED_MESSAGE).toMatch(/pop-?ups/i);
    expect(POPUP_BLOCKED_MESSAGE).toMatch(/allow/i);
  });

  it("does not hardcode a hostname (dev, preview and prod all use it)", () => {
    expect(POPUP_BLOCKED_MESSAGE).not.toMatch(/supagloo\.com/);
  });
});
