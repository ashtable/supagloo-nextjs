import { describe, expect, it } from "vitest";

// RED until `./config` ships. The BFF's two pure env accessors:
//  - apiBaseUrl: where the route handlers proxy to (server-side only).
//  - testSeedEnabled: the double-gate that makes the seed passthrough a HARD
//    no-op unless BOTH NODE_ENV!=='production' AND SUPAGLOO_ENABLE_TEST_SEED==='1'
//    (mirrors the API's own gate — plan.md "seam is a hard no-op without the flag").
import { apiBaseUrl, testSeedEnabled } from "./config";

describe("apiBaseUrl", () => {
  it("defaults to http://localhost:4000 when SUPAGLOO_API_URL is unset", () => {
    expect(apiBaseUrl({})).toBe("http://localhost:4000");
  });

  it("uses SUPAGLOO_API_URL when set", () => {
    expect(apiBaseUrl({ SUPAGLOO_API_URL: "https://api.supagloo.com" })).toBe(
      "https://api.supagloo.com",
    );
  });

  it("ignores an empty-string override (falls back to the default)", () => {
    expect(apiBaseUrl({ SUPAGLOO_API_URL: "" })).toBe("http://localhost:4000");
  });
});

describe("testSeedEnabled — the hard no-op gate", () => {
  it("is true only when NODE_ENV!=='production' AND SUPAGLOO_ENABLE_TEST_SEED==='1'", () => {
    expect(
      testSeedEnabled({ NODE_ENV: "development", SUPAGLOO_ENABLE_TEST_SEED: "1" }),
    ).toBe(true);
    expect(
      testSeedEnabled({ NODE_ENV: "test", SUPAGLOO_ENABLE_TEST_SEED: "1" }),
    ).toBe(true);
  });

  it("is false in production even with the flag set (prod safety)", () => {
    expect(
      testSeedEnabled({ NODE_ENV: "production", SUPAGLOO_ENABLE_TEST_SEED: "1" }),
    ).toBe(false);
  });

  it("is false when the flag is absent or not exactly '1'", () => {
    expect(testSeedEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(
      testSeedEnabled({ NODE_ENV: "development", SUPAGLOO_ENABLE_TEST_SEED: "0" }),
    ).toBe(false);
    expect(
      testSeedEnabled({ NODE_ENV: "development", SUPAGLOO_ENABLE_TEST_SEED: "true" }),
    ).toBe(false);
    expect(
      testSeedEnabled({ NODE_ENV: "development", SUPAGLOO_ENABLE_TEST_SEED: "" }),
    ).toBe(false);
  });
});
