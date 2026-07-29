import { describe, expect, it, vi } from "vitest";

import { DEMO_STREAM_URL_PATH, fetchDemoStreamUrl } from "./demo-video";

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

describe("fetchDemoStreamUrl", () => {
  it("asks the BFF for a presigned URL and returns it", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ url: "https://t3.example/demos/x.mp4?sig=1", expiresAt: "…" }),
    );
    const url = await fetchDemoStreamUrl({ fetchImpl: fetchImpl as never });
    expect(url).toBe("https://t3.example/demos/x.mp4?sig=1");
    expect(fetchImpl).toHaveBeenCalledWith(DEMO_STREAM_URL_PATH, {
      cache: "no-store",
    });
  });

  it("sends NOTHING with the request — no key, no query, no credentials", async () => {
    // The upstream presigner is unauthenticated. It signs a constant key, and this client
    // must never grow a parameter that looks like it could influence which object is
    // signed — that is the road back to presigning the whole bucket for anyone.
    const fetchImpl = vi.fn(async () => jsonResponse({ url: "https://x/y.mp4" }));
    await fetchDemoStreamUrl({ fetchImpl: fetchImpl as never });

    const [path, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/demo/stream-url");
    expect(path).not.toContain("?");
    expect(Object.keys(init)).toEqual(["cache"]);
    // Arity 1 (the deps bag) and nothing that could carry a key.
    expect(fetchDemoStreamUrl).toHaveLength(0);
  });

  it("is cache-busted, because a 120s presign must never be served from cache", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ url: "https://x/y.mp4" }));
    await fetchDemoStreamUrl({ fetchImpl: fetchImpl as never });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.cache).toBe("no-store");
  });

  it("returns null — never throws — for every failure a visitor could hit", async () => {
    // A click handler has nothing useful to do with an exception, and the three cases are
    // indistinguishable to a visitor, so they collapse to one honest empty state.
    const cases: Array<[string, () => Promise<Response>]> = [
      ["non-2xx", async () => jsonResponse({ error: "boom" }, false)],
      ["malformed body", async () => jsonResponse({ nope: true })],
      ["empty url", async () => jsonResponse({ url: "" })],
      ["network throw", async () => {
        throw new TypeError("Failed to fetch");
      }],
      ["json throw", async () =>
        ({
          ok: true,
          json: async () => {
            throw new SyntaxError("Unexpected token");
          },
        }) as unknown as Response],
    ];
    for (const [label, fetchImpl] of cases) {
      await expect(
        fetchDemoStreamUrl({ fetchImpl: fetchImpl as never }),
      ).resolves.toBe(null);
      expect(`${label}: did not throw`).toBe(`${label}: did not throw`);
    }
  });
});
