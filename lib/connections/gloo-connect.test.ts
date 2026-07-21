import { describe, expect, it } from "vitest";

// RED until `./gloo-connect` ships. The pure, injectable effect layer + form
// validation for the REAL Gloo "save & verify" flow (design-delta §2.5/§6a): a
// direct `PUT /api/connect/gloo` whose 400 (a LIVE client-credentials verify
// failure on the API) must surface as a real form error, not local-only
// validation. Injected `fetch` → zero-network unit tests, no React.
import {
  validateGlooCredentials,
  glooSnapshotFromConnections,
  fetchGlooConnection,
  saveGlooCredentials,
  glooErrorMessage,
} from "./gloo-connect";

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

describe("validateGlooCredentials (local, pre-submit)", () => {
  it("passes when both fields are non-empty", () => {
    expect(validateGlooCredentials({ clientId: "cid", clientSecret: "sek" })).toBeNull();
  });

  it("flags a missing / whitespace-only client id", () => {
    expect(validateGlooCredentials({ clientId: "", clientSecret: "sek" })).toBeTruthy();
    expect(validateGlooCredentials({ clientId: "   ", clientSecret: "sek" })).toBeTruthy();
  });

  it("flags a missing / whitespace-only client secret", () => {
    expect(validateGlooCredentials({ clientId: "cid", clientSecret: "" })).toBeTruthy();
    expect(validateGlooCredentials({ clientId: "cid", clientSecret: "  " })).toBeTruthy();
  });
});

describe("glooSnapshotFromConnections", () => {
  it("maps a present gloo status → connected + clientId", () => {
    expect(
      glooSnapshotFromConnections({
        github: null,
        openrouter: null,
        gloo: {
          clientId: "gloo-cid",
          status: "active",
          connectedAt: "2026-07-20T00:00:00.000Z",
          lastVerifiedAt: "2026-07-20T00:00:00.000Z",
        },
      }),
    ).toEqual({ connected: true, clientId: "gloo-cid" });
  });

  it("maps null gloo / null body / junk → not connected", () => {
    expect(glooSnapshotFromConnections({ gloo: null })).toEqual({
      connected: false,
      clientId: null,
    });
    expect(glooSnapshotFromConnections(null)).toEqual({ connected: false, clientId: null });
    expect(glooSnapshotFromConnections({ gloo: { clientId: "" } })).toEqual({
      connected: false,
      clientId: null,
    });
  });
});

describe("fetchGlooConnection", () => {
  it("GETs /api/connections and maps gloo connected", async () => {
    const { fetchImpl, calls } = queuedFetch([
      { status: 200, body: { github: null, openrouter: null, gloo: { clientId: "cid" } } },
    ]);
    expect(await fetchGlooConnection({ fetchImpl })).toEqual({
      connected: true,
      clientId: "cid",
    });
    expect(calls[0].url).toBe("/api/connections");
  });

  it("returns not-connected on non-200 / throw", async () => {
    const bad = queuedFetch([{ status: 401 }]);
    expect(await fetchGlooConnection({ fetchImpl: bad.fetchImpl })).toEqual({
      connected: false,
      clientId: null,
    });
  });
});

describe("saveGlooCredentials (verify-then-store, §2.5)", () => {
  it("PUTs {clientId, clientSecret} to /api/connect/gloo; 200 → ok + connection", async () => {
    const { fetchImpl, calls } = queuedFetch([
      {
        status: 200,
        body: {
          connection: {
            clientId: "cid",
            status: "active",
            connectedAt: "2026-07-20T00:00:00.000Z",
            lastVerifiedAt: "2026-07-20T00:00:00.000Z",
          },
        },
      },
    ]);
    const result = await saveGlooCredentials({
      clientId: "cid",
      clientSecret: "sek",
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.connection.clientId).toBe("cid");
    expect(calls[0].url).toBe("/api/connect/gloo");
    expect(String(calls[0].init?.method)).toBe("PUT");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      clientId: "cid",
      clientSecret: "sek",
    });
  });

  it("maps a 400 → the invalid-credentials error (a real live verify failure)", async () => {
    const { fetchImpl } = queuedFetch([
      { status: 400, body: { error: "invalid_gloo_credentials", message: "…" } },
    ]);
    const result = await saveGlooCredentials({ clientId: "gloo-invalid", clientSecret: "x", fetchImpl });
    expect(result).toEqual({ ok: false, error: "invalid_gloo_credentials" });
  });

  it("maps a 502 / thrown fetch → a network error", async () => {
    const dead = queuedFetch([{ status: 502, body: { error: "upstream_unreachable" } }]);
    expect(await saveGlooCredentials({ clientId: "c", clientSecret: "s", fetchImpl: dead.fetchImpl })).toEqual({
      ok: false,
      error: "network",
    });
    const throwing = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    expect(await saveGlooCredentials({ clientId: "c", clientSecret: "s", fetchImpl: throwing })).toEqual({
      ok: false,
      error: "network",
    });
  });
});

describe("glooErrorMessage", () => {
  it("returns a user-facing message for the invalid-credentials verify failure", () => {
    const msg = glooErrorMessage("invalid_gloo_credentials");
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
    // distinct from the generic network message
    expect(msg).not.toBe(glooErrorMessage("network"));
  });
});
