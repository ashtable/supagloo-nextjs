import { describe, it, expect } from "vitest";
import { resolveExchangeToken } from "./bootstrap";

/**
 * Feature 7, defect 1 — the sign-in exchange can never run on the load that signs you in.
 *
 * The vendored SDK memoizes `accessToken` with `useMemo(…, [])` over
 * `localStorage.getItem('accessToken')`, so on the OAuth callback load — where the token
 * is written by an async effect AFTER first render — the memo is frozen `null` forever
 * while `isAuthenticated` flips true. These cases pin the decision that resolves it.
 */

const stored = (value: string | null) => () => value;
const throwing = () => {
  throw new Error("localStorage is disabled");
};

describe("resolveExchangeToken", () => {
  it("U-A1: THE BUG — authed with a frozen-null memo still exchanges, using the stored token", () => {
    // The exact callback-load state: `handleAuthCallback()` has resolved (so `userInfo`
    // is set and `isAuthenticated` is true) and has written the token to storage, but
    // the render-time memo captured `null` before any of that happened.
    expect(
      resolveExchangeToken({
        isAuthenticated: true,
        memoizedToken: null,
        readStoredToken: stored("yv_access_token_abc"),
      }),
    ).toBe("yv_access_token_abc");
  });

  it("U-A2: a warm load uses the memo and never touches storage", () => {
    let reads = 0;
    const token = resolveExchangeToken({
      isAuthenticated: true,
      memoizedToken: "yv_from_memo",
      readStoredToken: () => {
        reads += 1;
        return "yv_from_storage";
      },
    });
    expect(token).toBe("yv_from_memo");
    expect(reads).toBe(0);
  });

  it("U-A3: a signed-OUT visitor never exchanges, even with a token left in storage", () => {
    // Logout clears the cookie but a stale `accessToken` can outlive it. Exchanging one
    // would silently resurrect the previous session.
    expect(
      resolveExchangeToken({
        isAuthenticated: false,
        memoizedToken: null,
        readStoredToken: stored("stale_token_from_last_session"),
      }),
    ).toBeNull();
    expect(
      resolveExchangeToken({
        isAuthenticated: false,
        memoizedToken: "still_in_the_memo",
        readStoredToken: stored(null),
      }),
    ).toBeNull();
  });

  it("U-A4: authed with nothing anywhere falls through to the probe", () => {
    expect(
      resolveExchangeToken({
        isAuthenticated: true,
        memoizedToken: null,
        readStoredToken: stored(null),
      }),
    ).toBeNull();
    expect(
      resolveExchangeToken({
        isAuthenticated: true,
        memoizedToken: undefined,
        readStoredToken: () => undefined,
      }),
    ).toBeNull();
  });

  it("U-A5: an EMPTY-STRING token is not a token", () => {
    // `localStorage.getItem` returns "" for a key written empty; posting that as a bearer
    // would be a guaranteed 401 rather than a fallthrough to the probe.
    expect(
      resolveExchangeToken({
        isAuthenticated: true,
        memoizedToken: "",
        readStoredToken: stored(""),
      }),
    ).toBeNull();
    expect(
      resolveExchangeToken({
        isAuthenticated: true,
        memoizedToken: "",
        readStoredToken: stored("real"),
      }),
    ).toBe("real");
  });

  it("U-A6: disabled storage degrades to the probe rather than throwing through render", () => {
    expect(
      resolveExchangeToken({
        isAuthenticated: true,
        memoizedToken: null,
        readStoredToken: throwing,
      }),
    ).toBeNull();
  });
});
