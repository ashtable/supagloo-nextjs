import { describe, expect, it } from "vitest";

// RED until `./pkce` ships. Pure, browser-side PKCE crypto (RFC 7636) for the
// OpenRouter connect flow (design-delta §5.1/§6a/§9-Q5): the browser generates a
// cryptographically random `code_verifier`, derives the S256 `code_challenge`
// (SHA-256 → base64url), and the challenge alone rides the authorize redirect. No
// React, no network — Web Crypto (`crypto.subtle` / `crypto.getRandomValues`) is
// available in the node test runtime.
import {
  generateCodeVerifier,
  computeCodeChallenge,
  base64UrlEncode,
} from "./pkce";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

describe("base64UrlEncode", () => {
  it("uses the url-safe alphabet and strips padding", () => {
    // 0xff,0xff,0xfe → standard base64 "//4=", url-safe "__4"
    const out = base64UrlEncode(new Uint8Array([0xff, 0xff, 0xfe]));
    expect(out).toBe("__4");
    expect(out).not.toContain("+");
    expect(out).not.toContain("/");
    expect(out).not.toContain("=");
  });
});

describe("generateCodeVerifier", () => {
  it("produces a url-safe verifier of a legal length (RFC 7636: 43–128)", () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(BASE64URL);
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it("is non-deterministic (fresh randomness per call)", () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe("computeCodeChallenge (S256)", () => {
  it("matches the RFC 7636 Appendix B known-answer vector", async () => {
    // From RFC 7636 Appendix B: verifier → BASE64URL(SHA256(verifier)).
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await computeCodeChallenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("is url-safe (no +, /, or = padding)", async () => {
    const challenge = await computeCodeChallenge(generateCodeVerifier());
    expect(challenge).toMatch(BASE64URL);
  });

  it("round-trips a freshly generated verifier deterministically", async () => {
    const v = generateCodeVerifier();
    expect(await computeCodeChallenge(v)).toBe(await computeCodeChallenge(v));
  });
});
