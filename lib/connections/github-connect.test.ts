import { describe, expect, it, vi } from "vitest";

// RED until `./github-connect` ships. This is the pure, injectable orchestration
// layer for the REAL GitHub App connect flow (Task #24, design-delta §5.3/§6a):
// the browser-side effects the `SessionProvider` runs (open the install tab, poll
// the merged status endpoint until connected, read the live repo count) plus the
// callback route's redirect-decision helpers. Everything here takes an injected
// `fetch` / `sleep` / `now` / `open`, so it is fully unit-testable with zero
// network and no React — the thin route adapters and the provider glue are the
// e2e's job.
import {
  githubUsername,
  githubSnapshotFromConnections,
  fetchGithubConnection,
  fetchGithubRepoCount,
  pollGithubConnected,
  openGithubInstall,
  githubCallbackRedirectTarget,
  githubCallbackRedirectPath,
} from "./github-connect";

/** A fetch stand-in returning a queued sequence of `{status, body}` responses. */
function queuedFetch(responses: { status: number; body?: unknown }[]) {
  const calls: string[] = [];
  let i = 0;
  const fetchImpl = (async (url: string | URL) => {
    calls.push(String(url));
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("githubUsername", () => {
  it("prefixes a bare login with @ and is idempotent on an already-@-prefixed one", () => {
    expect(githubUsername("acme")).toBe("@acme");
    expect(githubUsername("@acme")).toBe("@acme");
    expect(githubUsername("  octocat  ")).toBe("@octocat");
  });
});

describe("githubSnapshotFromConnections", () => {
  it("maps a present github status → connected + login", () => {
    expect(
      githubSnapshotFromConnections({
        github: {
          githubLogin: "acme",
          installationId: "42",
          repositorySelection: "selected",
          status: "active",
          connectedAt: "2026-07-20T00:00:00.000Z",
        },
        openrouter: null,
        gloo: null,
      }),
    ).toEqual({ connected: true, login: "acme" });
  });

  it("maps a null github / null body / junk → not connected", () => {
    expect(githubSnapshotFromConnections({ github: null })).toEqual({
      connected: false,
      login: null,
    });
    expect(githubSnapshotFromConnections(null)).toEqual({
      connected: false,
      login: null,
    });
    expect(githubSnapshotFromConnections({ github: { githubLogin: "" } })).toEqual({
      connected: false,
      login: null,
    });
  });
});

describe("fetchGithubConnection", () => {
  it("GETs /api/connections and maps a connected body", async () => {
    const { fetchImpl, calls } = queuedFetch([
      { status: 200, body: { github: { githubLogin: "acme" }, openrouter: null, gloo: null } },
    ]);
    const snap = await fetchGithubConnection({ fetchImpl });
    expect(calls[0]).toBe("/api/connections");
    expect(snap).toEqual({ connected: true, login: "acme" });
  });

  it("returns not-connected on a non-200 (e.g. 401 no session)", async () => {
    const { fetchImpl } = queuedFetch([{ status: 401, body: { error: "unauthorized" } }]);
    expect(await fetchGithubConnection({ fetchImpl })).toEqual({
      connected: false,
      login: null,
    });
  });

  it("returns not-connected (never throws) when the fetch itself throws", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await fetchGithubConnection({ fetchImpl })).toEqual({
      connected: false,
      login: null,
    });
  });
});

describe("fetchGithubRepoCount", () => {
  it("GETs /api/github/repos and returns repositories.length", async () => {
    const { fetchImpl, calls } = queuedFetch([
      { status: 200, body: { repositories: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] } },
    ]);
    expect(await fetchGithubRepoCount({ fetchImpl })).toBe(4);
    expect(calls[0]).toBe("/api/github/repos");
  });

  it("defaults to 0 on a non-200, a missing array, or a thrown fetch (best-effort)", async () => {
    const notConnected = queuedFetch([{ status: 409, body: { error: "github_not_connected" } }]);
    expect(await fetchGithubRepoCount({ fetchImpl: notConnected.fetchImpl })).toBe(0);

    const badBody = queuedFetch([{ status: 200, body: {} }]);
    expect(await fetchGithubRepoCount({ fetchImpl: badBody.fetchImpl })).toBe(0);

    const throwing = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    expect(await fetchGithubRepoCount({ fetchImpl: throwing })).toBe(0);
  });
});

describe("pollGithubConnected", () => {
  it("returns the login as soon as a poll observes connected", async () => {
    const { fetchImpl, calls } = queuedFetch([
      { status: 200, body: { github: null } }, // still pending
      { status: 200, body: { github: { githubLogin: "acme" } } }, // connected
    ]);
    const sleep = vi.fn(async () => {});
    const login = await pollGithubConnected({
      fetchImpl,
      sleep,
      intervalMs: 10,
      timeoutMs: 10_000,
    });
    expect(login).toBe("acme");
    expect(calls.length).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1); // one wait between the two polls
  });

  it("returns null after the deadline when it never connects", async () => {
    const { fetchImpl } = queuedFetch([{ status: 200, body: { github: null } }]);
    let clock = 0;
    const now = () => clock;
    const sleep = async (ms: number) => {
      clock += ms;
    };
    const login = await pollGithubConnected({
      fetchImpl,
      sleep,
      now,
      intervalMs: 100,
      timeoutMs: 500,
    });
    expect(login).toBeNull();
  });
});

describe("openGithubInstall", () => {
  it("opens the start route in a new tab", () => {
    const open = vi.fn();
    openGithubInstall(open);
    expect(open).toHaveBeenCalledWith("/api/connect/github/start", "_blank");
  });

  it("swallows a blocked/throwing window.open (the poll still resolves)", () => {
    const open = vi.fn(() => {
      throw new Error("popup blocked");
    });
    expect(() => openGithubInstall(open)).not.toThrow();
  });
});

describe("githubCallbackRedirectTarget / Path", () => {
  it("no installation_id → error (never forwarded)", () => {
    expect(
      githubCallbackRedirectTarget({ installationId: null, upstreamStatus: null }),
    ).toBe("error");
  });

  it("installation_id + upstream 200 → connected", () => {
    expect(
      githubCallbackRedirectTarget({ installationId: "42", upstreamStatus: 200 }),
    ).toBe("connected");
  });

  it("installation_id + upstream non-200 → error", () => {
    for (const status of [400, 401, 409, 502]) {
      expect(
        githubCallbackRedirectTarget({ installationId: "42", upstreamStatus: status }),
      ).toBe("error");
    }
  });

  it("maps targets → the app redirect paths", () => {
    expect(githubCallbackRedirectPath("connected")).toBe("/?github=connected");
    expect(githubCallbackRedirectPath("error")).toBe("/?github=error");
  });
});
