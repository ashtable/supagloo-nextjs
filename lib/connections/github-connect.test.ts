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
  openGithubLinkExisting,
  githubCallbackMode,
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
    // `filter=all` is EXPLICIT, not incidental (deferred review finding DR2). This
    // call renders a count and never reads `empty`, and the API only pays for plan
    // row 65's per-repo emptiness probe when the query asks for an emptiness verdict
    // (`filter=empty`) or narrows with `q`. Since this request fires on every hard
    // page load of every page, the unnarrowed query is what keeps it at one mint plus
    // the page walk rather than ~62 GitHub requests. Do NOT "tidy" it to `filter=empty`.
    expect(calls[0]).toBe("/api/github/repos?filter=all");
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
    const open = vi.fn(() => ({}));
    openGithubInstall(open);
    expect(open).toHaveBeenCalledWith("/api/connect/github/start", "_blank");
  });

  it("reports true when a tab was actually opened", () => {
    expect(openGithubInstall(() => ({}))).toBe(true);
  });

  // The two ways a browser refuses. NULL is the one that matters: it is what Safari
  // and Chrome actually do for a blocked popup, and the pre-fix code only guarded the
  // throw — so a real refusal was indistinguishable from success and the caller went
  // on to poll for a callback that could never come.
  it("reports false when window.open RETURNS NULL (the real blocked-popup signal)", () => {
    expect(openGithubInstall(() => null)).toBe(false);
  });

  it("reports false, without throwing, when window.open throws", () => {
    const open = vi.fn(() => {
      throw new Error("popup blocked");
    });
    expect(openGithubInstall(open)).toBe(false);
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

describe("githubCallbackMode", () => {
  it("treats an installation_id as the install path", () => {
    expect(githubCallbackMode({ installationId: "42", code: null })).toBe("install");
  });

  /** The case the install callback structurally cannot produce. */
  it("treats a bare code as the link-existing path", () => {
    expect(githubCallbackMode({ installationId: null, code: "c1" })).toBe(
      "link-existing",
    );
  });

  /**
   * What "Request user authorization (OAuth) during installation" produces. The id is
   * the direct answer; spending the code to re-derive it would be a round trip for
   * something GitHub already told us.
   */
  it("prefers the installation_id when GitHub sends BOTH", () => {
    expect(githubCallbackMode({ installationId: "42", code: "c1" })).toBe("install");
  });

  it("is 'none' when GitHub sends neither", () => {
    expect(githubCallbackMode({ installationId: null, code: null })).toBe("none");
  });

  it("treats empty strings as absent, not as present-but-blank", () => {
    expect(githubCallbackMode({ installationId: "", code: "" })).toBe("none");
    expect(githubCallbackMode({ installationId: "", code: "c1" })).toBe(
      "link-existing",
    );
  });
});

describe("githubCallbackRedirectTarget — the code arrival", () => {
  it("connects on a 200 from the link-existing exchange", () => {
    expect(
      githubCallbackRedirectTarget({
        installationId: null,
        code: "c1",
        upstreamStatus: 200,
      }),
    ).toBe("connected");
  });

  /** A 409 is "no installation" or "several match" — real answers, but not a connection. */
  it("errors when the exchange refuses", () => {
    expect(
      githubCallbackRedirectTarget({
        installationId: null,
        code: "c1",
        upstreamStatus: 409,
      }),
    ).toBe("error");
  });

  it("still errors when NEITHER id nor code arrived", () => {
    expect(
      githubCallbackRedirectTarget({
        installationId: null,
        code: null,
        upstreamStatus: null,
      }),
    ).toBe("error");
  });

  /** The pre-existing callers pass no `code` at all; that must keep working. */
  it("is unchanged for callers that omit code entirely", () => {
    expect(
      githubCallbackRedirectTarget({ installationId: "42", upstreamStatus: 200 }),
    ).toBe("connected");
    expect(
      githubCallbackRedirectTarget({ installationId: null, upstreamStatus: null }),
    ).toBe("error");
  });
});

describe("openGithubLinkExisting", () => {
  it("opens the link-existing start route in a new tab", () => {
    const calls: unknown[][] = [];
    const open = (...args: unknown[]) => {
      calls.push(args);
      return null;
    };
    openGithubLinkExisting(open as never);
    expect(calls).toEqual([
      ["/api/connect/github/link-existing/start", "_blank"],
    ]);
  });

  it("does not target the install route — they are different arrivals", () => {
    const calls: string[] = [];
    openGithubLinkExisting(((url: string) => calls.push(url)) as never);
    expect(calls[0]).not.toBe("/api/connect/github/start");
  });

  it("reports a refused popup instead of swallowing it", () => {
    // Both refusal shapes, same answer. The recovery path needs this even more than
    // the install path does: it is the LAST move offered to an already-installed user,
    // so a silent failure here leaves them with nothing.
    expect(openGithubLinkExisting((() => null) as never)).toBe(false);
    expect(
      openGithubLinkExisting(((): never => {
        throw new Error("blocked");
      }) as never),
    ).toBe(false);
  });

  it("reports true when a tab was actually opened", () => {
    expect(openGithubLinkExisting((() => ({})) as never)).toBe(true);
  });
});
