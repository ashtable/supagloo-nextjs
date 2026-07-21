import { describe, expect, it, vi } from "vitest";

// RED until `./openrouter-connect` ships. The pure, injectable orchestration +
// display layer for the REAL OpenRouter PKCE connect flow (design-delta §5.1/§6a):
// browser-side authorize/exchange, the BFF key POST, the merged-status poll, and
// live-credits + masked-key display. Everything takes an injected `fetch`/`sleep`/
// `now`, so it is unit-testable with zero network and no React.
import {
  maskOpenRouterKey,
  formatCreditRemaining,
  openrouterSnapshotFromConnections,
  buildAuthorizeUrl,
  readCallbackCode,
  exchangeOpenRouterCode,
  postOpenRouterKey,
  fetchOpenRouterConnection,
  pollOpenRouterConnected,
  fetchOpenRouterCreditsLabel,
} from "./openrouter-connect";

/** A fetch stand-in returning a queued sequence of `{status, body}` responses. */
function queuedFetch(responses: { status: number; body?: unknown }[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let i = 0;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("maskOpenRouterKey — the §9-Q5 masked display", () => {
  it("renders `sk-or-` + six bullets + the last four chars", () => {
    expect(maskOpenRouterKey("4f2a")).toBe("sk-or-••••••4f2a");
    // exactly six U+2022 bullets
    expect(maskOpenRouterKey("cafe")).toBe("sk-or-••••••cafe");
  });

  it("is graceful on an empty last4", () => {
    expect(maskOpenRouterKey("")).toBe("sk-or-••••••");
  });
});

describe("formatCreditRemaining", () => {
  it("renders `$X.XX credit remaining` (2 dp)", () => {
    expect(formatCreditRemaining(87.5)).toBe("$87.50 credit remaining");
    expect(formatCreditRemaining(18.4)).toBe("$18.40 credit remaining");
    expect(formatCreditRemaining(0)).toBe("$0.00 credit remaining");
  });
});

describe("openrouterSnapshotFromConnections", () => {
  it("maps a present openrouter status → connected + keyLast4", () => {
    expect(
      openrouterSnapshotFromConnections({
        github: null,
        openrouter: { keyLast4: "cafe", status: "active", connectedAt: "2026-07-20T00:00:00.000Z" },
        gloo: null,
      }),
    ).toEqual({ connected: true, keyLast4: "cafe" });
  });

  it("maps null openrouter / null body / junk → not connected", () => {
    expect(openrouterSnapshotFromConnections({ openrouter: null })).toEqual({
      connected: false,
      keyLast4: null,
    });
    expect(openrouterSnapshotFromConnections(null)).toEqual({
      connected: false,
      keyLast4: null,
    });
    expect(openrouterSnapshotFromConnections({ openrouter: { keyLast4: "" } })).toEqual({
      connected: false,
      keyLast4: null,
    });
  });
});

describe("buildAuthorizeUrl", () => {
  it("targets `${base}/auth` with the callback + S256 challenge", () => {
    const url = new URL(
      buildAuthorizeUrl({
        baseUrl: "https://openrouter.ai",
        callbackUrl: "http://localhost:3000/connect/openrouter/callback",
        codeChallenge: "CHALLENGE123",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth");
    expect(url.searchParams.get("callback_url")).toBe(
      "http://localhost:3000/connect/openrouter/callback",
    );
    expect(url.searchParams.get("code_challenge")).toBe("CHALLENGE123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("readCallbackCode", () => {
  it("extracts the `code` query param, else null", () => {
    expect(readCallbackCode("?code=abc123")).toBe("abc123");
    expect(readCallbackCode("code=abc123")).toBe("abc123");
    expect(readCallbackCode("?error=access_denied")).toBeNull();
    expect(readCallbackCode("")).toBeNull();
  });
});

describe("exchangeOpenRouterCode (browser ↔ OpenRouter, §5.1)", () => {
  it("POSTs {code, code_verifier, code_challenge_method} to /api/v1/auth/keys → key", async () => {
    const { fetchImpl, calls } = queuedFetch([
      { status: 200, body: { key: "sk-or-v1-abcd", user_id: "usr" } },
    ]);
    const key = await exchangeOpenRouterCode({
      code: "the-code",
      verifier: "the-verifier",
      baseUrl: "https://openrouter.ai",
      fetchImpl,
    });
    expect(key).toBe("sk-or-v1-abcd");
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/auth/keys");
    const sent = JSON.parse(String(calls[0].init?.body));
    expect(sent).toMatchObject({
      code: "the-code",
      code_verifier: "the-verifier",
      code_challenge_method: "S256",
    });
  });

  it("returns null on a non-200 or a thrown fetch (never throws)", async () => {
    const bad = queuedFetch([{ status: 400, body: { error: { message: "invalid_grant" } } }]);
    expect(
      await exchangeOpenRouterCode({
        code: "c",
        verifier: "v",
        baseUrl: "https://openrouter.ai",
        fetchImpl: bad.fetchImpl,
      }),
    ).toBeNull();

    const throwing = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(
      await exchangeOpenRouterCode({
        code: "c",
        verifier: "v",
        baseUrl: "https://openrouter.ai",
        fetchImpl: throwing,
      }),
    ).toBeNull();
  });
});

describe("postOpenRouterKey (browser → BFF)", () => {
  it("POSTs {key} to /api/connect/openrouter and returns ok", async () => {
    const { fetchImpl, calls } = queuedFetch([
      { status: 200, body: { connection: { keyLast4: "abcd" } } },
    ]);
    expect(await postOpenRouterKey({ key: "sk-or-v1-abcd", fetchImpl })).toBe(true);
    expect(calls[0].url).toBe("/api/connect/openrouter");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ key: "sk-or-v1-abcd" });
  });

  it("returns false on a non-200 or a thrown fetch", async () => {
    const bad = queuedFetch([{ status: 401, body: { error: "unauthorized" } }]);
    expect(await postOpenRouterKey({ key: "k", fetchImpl: bad.fetchImpl })).toBe(false);
    const throwing = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    expect(await postOpenRouterKey({ key: "k", fetchImpl: throwing })).toBe(false);
  });
});

describe("fetchOpenRouterConnection", () => {
  it("GETs /api/connections and maps openrouter connected", async () => {
    const { fetchImpl, calls } = queuedFetch([
      { status: 200, body: { github: null, openrouter: { keyLast4: "cafe" }, gloo: null } },
    ]);
    const snap = await fetchOpenRouterConnection({ fetchImpl });
    expect(calls[0].url).toBe("/api/connections");
    expect(snap).toEqual({ connected: true, keyLast4: "cafe" });
  });

  it("returns not-connected on a non-200 / throw", async () => {
    const bad = queuedFetch([{ status: 401 }]);
    expect(await fetchOpenRouterConnection({ fetchImpl: bad.fetchImpl })).toEqual({
      connected: false,
      keyLast4: null,
    });
  });
});

describe("pollOpenRouterConnected", () => {
  it("returns the keyLast4 as soon as a poll observes connected", async () => {
    const { fetchImpl, calls } = queuedFetch([
      { status: 200, body: { openrouter: null } }, // still pending
      { status: 200, body: { openrouter: { keyLast4: "cafe" } } }, // connected
    ]);
    const sleep = vi.fn(async () => {});
    const last4 = await pollOpenRouterConnected({
      fetchImpl,
      sleep,
      intervalMs: 10,
      timeoutMs: 10_000,
    });
    expect(last4).toBe("cafe");
    expect(calls.length).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("returns null after the deadline when it never connects", async () => {
    const { fetchImpl } = queuedFetch([{ status: 200, body: { openrouter: null } }]);
    let clock = 0;
    const now = () => clock;
    const sleep = async (ms: number) => {
      clock += ms;
    };
    const last4 = await pollOpenRouterConnected({
      fetchImpl,
      sleep,
      now,
      intervalMs: 100,
      timeoutMs: 500,
    });
    expect(last4).toBeNull();
  });
});

describe("fetchOpenRouterCreditsLabel (live credits, §2.4)", () => {
  it("GETs /api/connections/openrouter/credits and formats `remaining`", async () => {
    const { fetchImpl, calls } = queuedFetch([
      { status: 200, body: { totalCredits: 100, totalUsage: 12.5, remaining: 87.5 } },
    ]);
    expect(await fetchOpenRouterCreditsLabel({ fetchImpl })).toBe(
      "$87.50 credit remaining",
    );
    expect(calls[0].url).toBe("/api/connections/openrouter/credits");
  });

  it("returns null on a 409 not-connected / bad body / throw (best-effort)", async () => {
    const notConnected = queuedFetch([{ status: 409, body: { error: "openrouter_not_connected" } }]);
    expect(await fetchOpenRouterCreditsLabel({ fetchImpl: notConnected.fetchImpl })).toBeNull();

    const badBody = queuedFetch([{ status: 200, body: {} }]);
    expect(await fetchOpenRouterCreditsLabel({ fetchImpl: badBody.fetchImpl })).toBeNull();

    const throwing = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    expect(await fetchOpenRouterCreditsLabel({ fetchImpl: throwing })).toBeNull();
  });
});
