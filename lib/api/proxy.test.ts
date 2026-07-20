import { describe, expect, it } from "vitest";

// RED until `./proxy` ships. `forwardToApi` is the generic bearer-forwarding core
// every BFF route handler is built on (tasks 24/25 reuse it): it forwards the
// session cookie's raw token as `Authorization: Bearer …` to `${baseUrl}/v1/<path>`,
// passes JSON body + status + errors straight through, and never throws on a dead
// upstream. The Next.js runtime glue (cookie read / NextResponse) lives in the thin
// route adapters and is exercised by the e2e — here we test the pure core with an
// injected fetch.
import { forwardToApi } from "./proxy";

/** A fetch stand-in that records the single call it receives and returns `res`. */
function stubFetch(res: {
  status: number;
  jsonBody?: unknown;
  textBody?: string;
}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const body =
      res.textBody ??
      (res.jsonBody !== undefined ? JSON.stringify(res.jsonBody) : "");
    return new Response(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const BASE = "http://api.test:4000";

describe("forwardToApi — auth header + URL", () => {
  it("sets Authorization: Bearer <token> and targets ${baseUrl}/v1/<path>", async () => {
    const { fetchImpl, calls } = stubFetch({ status: 200, jsonBody: { user: {} } });
    await forwardToApi({
      path: "me",
      method: "GET",
      token: "opaque-token-abc",
      baseUrl: BASE,
      fetchImpl,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://api.test:4000/v1/me");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("authorization")).toBe("Bearer opaque-token-abc");
    expect(calls[0].init.method).toBe("GET");
  });

  it("omits Authorization entirely when no token is present", async () => {
    const { fetchImpl, calls } = stubFetch({ status: 401, jsonBody: { error: "unauthorized" } });
    await forwardToApi({ path: "me", method: "GET", token: null, baseUrl: BASE, fetchImpl });
    const headers = new Headers(calls[0].init.headers);
    expect(headers.has("authorization")).toBe(false);
  });

  it("sends a JSON body + Content-Type when a body is given, and none for a bodyless request", async () => {
    const withBody = stubFetch({ status: 200, jsonBody: { token: "t" } });
    await forwardToApi({
      path: "auth/youversion",
      method: "POST",
      body: { accessToken: "yv-123" },
      baseUrl: BASE,
      fetchImpl: withBody.fetchImpl,
    });
    const h1 = new Headers(withBody.calls[0].init.headers);
    expect(h1.get("content-type")).toBe("application/json");
    expect(withBody.calls[0].init.body).toBe(JSON.stringify({ accessToken: "yv-123" }));

    const noBody = stubFetch({ status: 200, jsonBody: { user: {} } });
    await forwardToApi({
      path: "me/onboarding",
      method: "PATCH",
      token: "t",
      baseUrl: BASE,
      fetchImpl: noBody.fetchImpl,
    });
    expect(noBody.calls[0].init.body).toBeUndefined();
  });
});

describe("forwardToApi — passthrough", () => {
  it("passes a 200 JSON body through unchanged", async () => {
    const { fetchImpl } = stubFetch({
      status: 200,
      jsonBody: { token: "raw-opaque", user: { id: "u1" }, firstSignIn: true },
    });
    const result = await forwardToApi({ path: "auth/youversion", method: "POST", body: {}, baseUrl: BASE, fetchImpl });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ token: "raw-opaque", user: { id: "u1" }, firstSignIn: true });
  });

  it("relays error status + body verbatim (no swallow) for 401/404/500", async () => {
    for (const status of [401, 404, 500]) {
      const { fetchImpl } = stubFetch({ status, jsonBody: { error: "boom", message: `${status}` } });
      const result = await forwardToApi({ path: "me", method: "GET", token: "t", baseUrl: BASE, fetchImpl });
      expect(result.status).toBe(status);
      expect(result.body).toEqual({ error: "boom", message: `${status}` });
    }
  });

  it("returns 502 upstream_unreachable when the upstream fetch throws (no unhandled rejection)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const result = await forwardToApi({ path: "me", method: "GET", token: "t", baseUrl: BASE, fetchImpl });
    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: "upstream_unreachable" });
  });
});
