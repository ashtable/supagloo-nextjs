import { describe, expect, it } from "vitest";

// RED until `./proxy` ships. `forwardToApi` is the generic bearer-forwarding core
// every BFF route handler is built on (tasks 24/25 reuse it): it forwards the
// session cookie's raw token as `Authorization: Bearer …` to `${baseUrl}/v1/<path>`,
// passes JSON body + status + errors straight through, and never throws on a dead
// upstream. The Next.js runtime glue (cookie read / NextResponse) lives in the thin
// route adapters and is exercised by the e2e — here we test the pure core with an
// injected fetch.
import { forwardToApi, DEFAULT_UPSTREAM_TIMEOUT_MS } from "./proxy";

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

// ===========================================================================
// deferred review finding DR3 — a HUNG upstream must not hold the browser open.
//
// Plan row 64 gave the API's GitHub client an in-process rate-limit backoff. That
// backoff sits on `GET /v1/github/repos`, which is a page-load path: a throttled
// installation could keep the API request — and therefore this proxy's fetch, and
// therefore the browser connection behind it — open for minutes. `fetch` has no
// default timeout, `buildApp` sets no `requestTimeout`, and nothing here bounded it,
// so the BFF simply waited. A hang is the worst failure shape available: the caller
// cannot retry, cannot see an error, and cannot tell it apart from slowness.
//
// The fix is a backstop, not a policy: every BFF forward carries an
// `AbortSignal.timeout`, and an abort degrades to a clean, typed 504 that a route
// handler can answer with — the same contract as the dead-upstream 502 above.
// ===========================================================================

describe("forwardToApi — hung-upstream timeout", () => {
  /** A fetch that NEVER answers on its own; it settles only when aborted. */
  const hangingFetch = (() => {
    const calls: { signalPresent: boolean }[] = [];
    const fetchImpl = (async (_url: string | URL, init: RequestInit = {}) => {
      calls.push({ signalPresent: Boolean(init.signal) });
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal;
        if (!signal) return; // no signal ⇒ hangs forever (the pre-fix behaviour)
        signal.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  })();

  it("aborts a hung upstream and answers 504 instead of holding the connection open", async () => {
    const started = Date.now();
    const result = await forwardToApi({
      path: "github/repos",
      method: "GET",
      token: "t",
      baseUrl: BASE,
      timeoutMs: 50,
      fetchImpl: hangingFetch.fetchImpl,
    });
    expect(result.status).toBe(504);
    expect(result.body).toEqual({ error: "upstream_timeout" });
    // It actually returned rather than waiting on the upstream.
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(hangingFetch.calls[0].signalPresent).toBe(true);
  });

  it("passes an abort signal on EVERY forward, with a bounded default", async () => {
    // The default is what protects the routes that never think about this — which is
    // all of them. A per-call `timeoutMs` only tightens it.
    const { fetchImpl, calls } = stubFetch({ status: 200, jsonBody: { user: {} } });
    await forwardToApi({ path: "me", method: "GET", token: "t", baseUrl: BASE, fetchImpl });
    const signal = calls[0].init.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
    expect(DEFAULT_UPSTREAM_TIMEOUT_MS).toBeGreaterThan(0);
    // Long enough to outlast the API's own bounded GitHub backoff, short enough that a
    // wedged upstream surfaces as an error inside a page load rather than a hang.
    expect(DEFAULT_UPSTREAM_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });
});
