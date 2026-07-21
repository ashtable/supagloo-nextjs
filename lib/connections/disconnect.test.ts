import { describe, expect, it } from "vitest";

// RED until `./disconnect` ships. The pure, injectable disconnect effect the
// `SessionProvider` runs when a user disconnects a provider. Unlike the old
// fire-and-forget DELETE, this AWAITS the response so the caller can gate the
// UI flip on the server actually clearing the credential: a non-2xx or a network
// error is reported as `{ ok: false }` (never throws), and the caller keeps the
// provider connected + surfaces an error instead of falsely showing
// "disconnected" while the live credential (OpenRouter key / Gloo secret) is
// still held server-side. Injectable `fetch` → zero-network unit tests, no React.
import {
  DISCONNECT_PATHS,
  requestDisconnect,
  disconnectErrorMessage,
} from "./disconnect";
import type { Provider } from "./connections-model";

const PROVIDERS: readonly Provider[] = ["github", "openrouter", "gloo"];

/** A fetch stand-in that records each call and returns a queued status. */
function recordingFetch(responses: { status: number }[]) {
  const calls: { url: string; method: string }[] = [];
  let i = 0;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: String(init?.method ?? "GET") });
    const status = responses[Math.min(i, responses.length - 1)].status;
    i += 1;
    // 2xx-no-content statuses must carry a null body.
    const noBody = status === 204 || status === 205 || status === 304;
    return new Response(noBody ? null : "", { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("DISCONNECT_PATHS", () => {
  it("maps each provider to its BFF disconnect route", () => {
    expect(DISCONNECT_PATHS).toEqual({
      github: "/api/connect/github",
      openrouter: "/api/connect/openrouter",
      gloo: "/api/connect/gloo",
    });
  });
});

describe("requestDisconnect", () => {
  it("issues a DELETE to the provider's route", async () => {
    for (const provider of PROVIDERS) {
      const { fetchImpl, calls } = recordingFetch([{ status: 200 }]);
      await requestDisconnect(provider, { fetchImpl });
      expect(calls[0]).toEqual({
        url: DISCONNECT_PATHS[provider],
        method: "DELETE",
      });
    }
  });

  it("reports ok on any 2xx (200 or 204 no-content)", async () => {
    for (const status of [200, 204]) {
      const { fetchImpl } = recordingFetch([{ status }]);
      expect(await requestDisconnect("openrouter", { fetchImpl })).toEqual({
        ok: true,
      });
    }
  });

  it("reports NOT ok on a non-2xx (server still holds the credential)", async () => {
    for (const status of [400, 401, 409, 500, 502]) {
      const { fetchImpl } = recordingFetch([{ status }]);
      expect(await requestDisconnect("gloo", { fetchImpl })).toEqual({
        ok: false,
      });
    }
  });

  it("reports NOT ok (never throws) when the fetch itself throws", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await requestDisconnect("github", { fetchImpl })).toEqual({
      ok: false,
    });
  });
});

describe("disconnectErrorMessage", () => {
  it("returns a distinct, non-empty message per provider", () => {
    const messages = PROVIDERS.map((p) => disconnectErrorMessage(p));
    for (const m of messages) expect(m.length).toBeGreaterThan(0);
    expect(new Set(messages).size).toBe(PROVIDERS.length);
  });

  it("tells the user the account is STILL connected so they retry (not silently disconnected)", () => {
    // The whole point of the fix: on failure the credential is still live, so the
    // copy must not imply success.
    for (const p of PROVIDERS) {
      expect(disconnectErrorMessage(p).toLowerCase()).toContain("still connected");
    }
  });
});
