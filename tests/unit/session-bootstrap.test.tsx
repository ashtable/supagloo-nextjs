// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { byTestId, mount } from "./support/render";

/**
 * Feature 7 — `SessionProvider`'s bootstrap, which had ZERO unit coverage.
 *
 * This mounts the real provider over a faked `useYVAuth` and an injected `fetch`, and
 * reproduces the reported login sequence:
 *
 *   > After logout→login all three connections read "Not linked" and the project grid is
 *   > empty; one Cmd-R fixes connections, a second fixes the grid.
 *
 * The mechanism (see `lib/session/bootstrap.ts` for the full derivation): the vendored
 * SDK memoizes `accessToken` with `useMemo(…, [])` over `localStorage`, so on the OAuth
 * callback load — where the token is written by an async effect AFTER first render — it
 * is frozen `null` while `isAuthenticated` flips true. The exchange gate
 * (`isAuthenticated && accessToken`) is therefore false on the one load that needed it,
 * control falls through to a cookie-less `GET /api/me`, and `serverUser` stays null.
 *
 * A simulated failure with an injected `fetch` is a UNIT concern (design-delta §10.6);
 * there is no real provider egress here.
 */

const yvState: {
  isAuthenticated: boolean;
  accessToken: string | null;
  userInfo: { name?: string; email?: string } | null;
  signOut: () => void;
} = {
  isAuthenticated: false,
  accessToken: null,
  userInfo: null,
  signOut: () => {},
};

vi.mock("@youversion/platform-react-ui", () => ({
  useYVAuth: () => ({
    auth: {
      isAuthenticated: yvState.isAuthenticated,
      isLoading: false,
      accessToken: yvState.accessToken,
      result: null,
      error: null,
    },
    userInfo: yvState.userInfo,
    signOut: () => yvState.signOut(),
    signIn: vi.fn(),
    processCallback: vi.fn(),
  }),
}));

import { SessionProvider, useSession } from "@/app/_components/session-provider";

/** A probe that renders the bits of the context this file asserts on. */
function Probe() {
  const s = useSession();
  return (
    <div>
      <span data-testid="server-user-id">{s.serverUserId ?? ""}</span>
      <span data-testid="github-status">{s.connections.github.status}</span>
      <button type="button" data-testid="sign-out" onClick={s.signOut}>
        {"sign out"}
      </button>
    </div>
  );
}

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

let calls: FetchCall[] = [];
let mounted: { container: HTMLElement; unmount: () => void } | null = null;
const realFetch = globalThis.fetch;

function installFetch(handler: (url: string, init?: RequestInit) => unknown) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const payload = handler(url, init);
    return {
      ok: payload !== undefined,
      status: payload !== undefined ? 200 : 401,
      json: async () => payload ?? {},
    } as Response;
  }) as typeof fetch;
}

const SERVER_USER = {
  id: "u1",
  displayName: "Ash Srinivas",
  email: "ash@supagloo.com",
  onboardingCompletedAt: "2026-07-01T00:00:00.000Z",
};

beforeEach(() => {
  calls = [];
  window.localStorage.clear();
  yvState.isAuthenticated = false;
  yvState.accessToken = null;
  yvState.userInfo = null;
  yvState.signOut = () => {};
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  globalThis.fetch = realFetch;
});

const urlsOf = (method: string) =>
  calls.filter((c) => c.method === method).map((c) => c.url);

describe("SessionProvider bootstrap — the OAuth callback load", () => {
  it("U-A12: THE BUG — exchanges the token even though the SDK memo froze it at null", async () => {
    // The callback load, exactly: `handleAuthCallback()` has resolved, so `userInfo` is
    // set (⇒ `isAuthenticated`) and the token IS in storage — but the render-time memo
    // captured `null` before either happened, and never recomputes.
    yvState.isAuthenticated = true;
    yvState.accessToken = null;
    yvState.userInfo = { name: "Ash Srinivas", email: "ash@supagloo.com" };
    window.localStorage.setItem("accessToken", "yv_access_token_abc");

    installFetch((url) => {
      if (url === "/api/auth/session") return { user: SERVER_USER };
      if (url === "/api/connections") return {};
      return undefined; // no cookie: /api/me 401s, exactly as after a logout
    });

    mounted = await mount(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const exchange = calls.find(
      (c) => c.url === "/api/auth/session" && c.method === "POST",
    );
    expect(exchange, `POSTs made: ${JSON.stringify(urlsOf("POST"))}`).toBeDefined();
    expect((exchange!.body as { accessToken: string }).accessToken).toBe(
      "yv_access_token_abc",
    );
    expect(byTestId(mounted.container, "server-user-id").textContent).toBe("u1");
  });

  it("U-A13: a warm load still uses the memo's token", async () => {
    yvState.isAuthenticated = true;
    yvState.accessToken = "yv_from_memo";
    yvState.userInfo = { name: "Ash Srinivas" };
    window.localStorage.setItem("accessToken", "yv_from_storage");

    installFetch((url) =>
      url === "/api/auth/session" ? { user: SERVER_USER } : undefined,
    );
    mounted = await mount(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const exchange = calls.find((c) => c.url === "/api/auth/session");
    expect((exchange!.body as { accessToken: string }).accessToken).toBe(
      "yv_from_memo",
    );
  });

  it("U-A14: a signed-OUT visitor probes and never exchanges a stale stored token", async () => {
    yvState.isAuthenticated = false;
    window.localStorage.setItem("accessToken", "stale_from_last_session");
    installFetch(() => undefined);

    mounted = await mount(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(urlsOf("POST")).not.toContain("/api/auth/session");
    expect(urlsOf("GET")).toContain("/api/me");
    expect(byTestId(mounted.container, "server-user-id").textContent).toBe("");
  });
});

describe("SessionProvider — signOut clears the previous identity's state", () => {
  it("U-A15: connections reset to not-linked instead of showing the last user's accounts", async () => {
    // `signOut()` reset `serverUser` and the YouVersion session but left `connections`
    // and `connectionsSeeded` alone, so a signed-out browser kept rendering the previous
    // user's connected cards until something forced a reload.
    yvState.isAuthenticated = true;
    yvState.accessToken = "yv_from_memo";
    yvState.userInfo = { name: "Ash Srinivas" };
    installFetch((url) => {
      if (url === "/api/auth/session") return { user: SERVER_USER };
      if (url === "/api/connections")
        return { github: { githubLogin: "ashsrinivas" } };
      if (url.startsWith("/api/github/repos")) return { repos: [] };
      return undefined;
    });

    mounted = await mount(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    // The precondition this test would be vacuous without: GitHub really is connected
    // before the sign-out, so "not-linked" afterwards is a RESET, not a state it was
    // already in.
    expect(byTestId(mounted.container, "github-status").textContent).toBe(
      "connected",
    );

    yvState.signOut = () => {
      yvState.isAuthenticated = false;
      yvState.userInfo = null;
    };
    await act(async () => {
      byTestId(mounted!.container, "sign-out").click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(byTestId(mounted.container, "server-user-id").textContent).toBe("");
    expect(byTestId(mounted.container, "github-status").textContent).toBe(
      "not-linked",
    );
  });
});
