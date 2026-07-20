/**
 * The httpOnly session cookie the BFF sets after a successful sign-in / seed. Its
 * value is the RAW opaque bearer token (the API stores only a SHA-256 hash). The
 * attributes are the security surface of the whole BFF, so the option builders are
 * pure + unit-pinned; the thin `NextResponse.cookies.set` call lives in the route
 * handlers (exercised by the e2e).
 */

type EnvSource = Record<string, string | undefined>;

export const SESSION_COOKIE_NAME = "supagloo_session";

/** 30 days, mirroring the API's default session TTL (sliding, server-maintained).
 *  Each page load re-exchanges / re-probes, so the cookie tracks the sliding
 *  expiry. */
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export interface SessionCookieOptions {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
}

function isProduction(env: EnvSource): boolean {
  return env.NODE_ENV === "production";
}

/** Options for setting the session cookie. `secure` only in production so local
 *  http dev/e2e can set it. */
export function sessionCookieOptions(
  env: EnvSource = process.env,
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(env),
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}

/** Options for clearing the session cookie on sign-out (immediate expiry). */
export function clearSessionCookieOptions(
  env: EnvSource = process.env,
): SessionCookieOptions {
  return { ...sessionCookieOptions(env), maxAge: 0 };
}
