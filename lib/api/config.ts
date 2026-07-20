/**
 * Pure env accessors for the BFF. Kept out of the route handlers so they're
 * unit-testable with an injected env (default `process.env`). SERVER-SIDE only —
 * none of these are `NEXT_PUBLIC_`, so they never reach the browser bundle.
 */

type EnvSource = Record<string, string | undefined>;

/** The supagloo-nodejs-api base URL the BFF proxies to. Defaults to the local
 *  dev API; overridable via `SUPAGLOO_API_URL`. */
export function apiBaseUrl(env: EnvSource = process.env): string {
  const value = env.SUPAGLOO_API_URL;
  return value && value.length > 0 ? value : "http://localhost:4000";
}

/**
 * The double-gate for the BFF's `POST /api/test/seed` passthrough — a HARD no-op
 * unless BOTH `NODE_ENV !== 'production'` AND `SUPAGLOO_ENABLE_TEST_SEED === '1'`.
 * Mirrors the API's own seed gate (design-delta §9-Q9) so the seam behaves as if
 * it does not exist in production or without the opt-in flag.
 */
export function testSeedEnabled(env: EnvSource = process.env): boolean {
  return env.NODE_ENV !== "production" && env.SUPAGLOO_ENABLE_TEST_SEED === "1";
}
