import { describe, expect, it } from "vitest";

import { appOrigin, appUrl, type OriginSource } from "./app-url";

/**
 * `url` mimics what Next.js actually hands a route handler inside the container: the
 * origin the server LISTENS on (`:3000`), never the published one (`:8000`).
 */
function request(
  headers: Record<string, string>,
  url = "http://localhost:3000/api/connect/github/start",
): OriginSource {
  return { headers: new Headers(headers), url };
}

describe("appOrigin", () => {
  /**
   * The regression. Before this module the three connect routes resolved against
   * `request.url` and emitted `http://localhost:3000/…`, which is unreachable from the
   * browser under compose's `8000:3000` mapping.
   */
  it("uses the Host the browser reached us by, NOT the port we listen on", () => {
    expect(appOrigin(request({ host: "localhost:8000" }))).toBe(
      "http://localhost:8000",
    );
  });

  it("keeps a real public hostname intact", () => {
    expect(appOrigin(request({ host: "app.supagloo.com" }))).toBe(
      "http://app.supagloo.com",
    );
  });

  it("takes the scheme from X-Forwarded-Proto behind a TLS-terminating proxy", () => {
    const origin = appOrigin(
      request({ host: "app.supagloo.com", "x-forwarded-proto": "https" }),
    );
    expect(origin).toBe("https://app.supagloo.com");
  });

  it("reads the FIRST hop from a comma-separated X-Forwarded-Proto", () => {
    const origin = appOrigin(
      request({ host: "app.supagloo.com", "x-forwarded-proto": "https, http" }),
    );
    expect(origin).toBe("https://app.supagloo.com");
  });

  it.each(["javascript", "file", "ftp", "", "   "])(
    "ignores a non-http(s) X-Forwarded-Proto (%j) rather than trusting it",
    (proto) => {
      const origin = appOrigin(
        request({ host: "app.supagloo.com", "x-forwarded-proto": proto }),
      );
      expect(origin).toBe("http://app.supagloo.com");
    },
  );

  /**
   * Security-relevant, and the reason this module reads `Host` rather than the forwarded
   * pair: everything it returns becomes a 302 `Location` or an OAuth `redirect_uri`. An
   * attacker-settable origin there is an open redirect / a stolen authorization code.
   */
  it("does NOT honour X-Forwarded-Host", () => {
    const origin = appOrigin(
      request({ host: "localhost:8000", "x-forwarded-host": "evil.example" }),
    );
    expect(origin).toBe("http://localhost:8000");
    expect(origin).not.toContain("evil.example");
  });

  it("falls back to the request's own origin when there is no Host header", () => {
    expect(appOrigin(request({}))).toBe("http://localhost:3000");
  });

  it("carries the request's own scheme into the fallback", () => {
    const origin = appOrigin(request({}, "https://internal.local:3000/api/x"));
    expect(origin).toBe("https://internal.local:3000");
  });

  it("never returns a trailing slash", () => {
    expect(appOrigin(request({ host: "localhost:8000" }))).not.toMatch(/\/$/);
  });
});

describe("appUrl", () => {
  it("resolves an app-relative path against the public origin", () => {
    const url = appUrl("/?github=error", request({ host: "localhost:8000" }));
    expect(url.toString()).toBe("http://localhost:8000/?github=error");
  });

  it("builds the create-repo OAuth redirect_uri on the reachable origin", () => {
    const url = appUrl(
      "/connect/github/create-repo/callback",
      request({ host: "localhost:8000" }),
    );
    expect(url.toString()).toBe(
      "http://localhost:8000/connect/github/create-repo/callback",
    );
  });

  it("discards the incoming path — a redirect target is absolute, not relative", () => {
    const url = appUrl(
      "/?newproject=error",
      request(
        { host: "localhost:8000" },
        "http://localhost:3000/api/connect/github/create-repo/start?state=abc",
      ),
    );
    expect(url.toString()).toBe("http://localhost:8000/?newproject=error");
  });
});
