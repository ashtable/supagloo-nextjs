/**
 * Browser-side PKCE crypto (RFC 7636) for the OpenRouter connect flow
 * (design-delta §5.1/§6a/§9-Q5). The browser mints a cryptographically random
 * `code_verifier`, derives the S256 `code_challenge` (SHA-256 → base64url), and
 * only the challenge rides the authorize redirect; the verifier is used later, in
 * the same browser, to exchange the returned code for the API key — the API/BFF
 * never see either.
 *
 * Pure + isomorphic: uses only the Web Crypto API (`crypto.getRandomValues` /
 * `crypto.subtle.digest`), available in the browser AND the Node test runtime, so
 * this is unit-testable with no React and no mocks.
 */

/** Base64url-encode bytes: the url-safe alphabet (`-`/`_`) with no `=` padding. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A fresh `code_verifier`: 32 random bytes → base64url (43 chars), well within
 * RFC 7636's 43–128 legal range and using only unreserved URL characters.
 */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** The S256 `code_challenge` = base64url(SHA-256(verifier)). */
export async function computeCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}
