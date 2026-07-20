import { describe, expect, it } from "vitest";

// RED until `./cookies` ships. The httpOnly session cookie's attributes are the
// security surface of the whole BFF, so they're pinned by a pure unit (the actual
// NextResponse.cookies.set call is thin glue exercised by the e2e).
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
  sessionCookieOptions,
  clearSessionCookieOptions,
} from "./cookies";

describe("session cookie attributes", () => {
  it("is named supagloo_session with a 30-day Max-Age (mirrors the API session TTL)", () => {
    expect(SESSION_COOKIE_NAME).toBe("supagloo_session");
    expect(SESSION_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });

  it("is httpOnly, sameSite=lax, path=/, with the 30-day Max-Age", () => {
    const opts = sessionCookieOptions({ NODE_ENV: "development" });
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(SESSION_COOKIE_MAX_AGE);
  });

  it("sets secure only in production", () => {
    expect(sessionCookieOptions({ NODE_ENV: "production" }).secure).toBe(true);
    expect(sessionCookieOptions({ NODE_ENV: "development" }).secure).toBe(false);
    expect(sessionCookieOptions({ NODE_ENV: "test" }).secure).toBe(false);
  });
});

describe("clearSessionCookieOptions", () => {
  it("expires the cookie immediately (Max-Age 0) while keeping httpOnly/path", () => {
    const opts = clearSessionCookieOptions({ NODE_ENV: "production" });
    expect(opts.maxAge).toBe(0);
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe("/");
    expect(opts.secure).toBe(true);
  });
});
