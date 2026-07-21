"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useYVAuth } from "@youversion/platform-react-ui";
import {
  resolveSession,
  parseMockSession,
  parseSeedRequest,
  firstSignIn as computeFirstSignIn,
  type Session,
  type AuthUserLike,
} from "@/lib/session/session-model";
import {
  seedWireframe,
  seedNoneLinked,
  seedAllLinked,
  beginConnect,
  completeConnect,
  connectGithub,
  disconnect as disconnectReducer,
  MOCK_OAUTH_DELAY_MS,
  type ConnectionsState,
  type Provider,
} from "@/lib/connections/connections-model";
import {
  githubUsername,
  openGithubInstall,
  pollGithubConnected,
  fetchGithubConnection,
  fetchGithubRepoCount,
} from "@/lib/connections/github-connect";
import type { ConnectionsSeedName } from "@/lib/session/session-model";

// Build-time constant — inlined by Next.js. Absent/unset in prod, so the
// `?mock=`/`?seed=` overrides are always a hard no-op there (plan R1).
const DEMO_FLAG = process.env.NEXT_PUBLIC_SUPAGLOO_DEMO === "1";

const SIGNED_OUT_SESSION: Session = {
  isAuthed: false,
  user: null,
  hasOnboarded: false,
};

function seedFor(name: ConnectionsSeedName): ConnectionsState {
  switch (name) {
    case "wireframe":
      return seedWireframe();
    case "all-linked":
      return seedAllLinked();
    case "none-linked":
      return seedNoneLinked();
  }
}

function readNonce(search: string): string | undefined {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("nonce") ?? undefined;
}

interface SessionContextValue {
  /** False until after the client mount effect — first paint is always signed-out. */
  mounted: boolean;
  session: Session;
  firstSignIn: boolean;
  connections: ConnectionsState;
  /** Begin the mocked OAuth transition: pending now, connected after `MOCK_OAUTH_DELAY_MS`. */
  connectProvider: (provider: Provider) => void;
  disconnectProvider: (provider: Provider) => void;
  /** Marks onboarding complete (dismisses the wizard) and persists it server-side. */
  markOnboarded: () => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const yv = useYVAuth();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [onboardedOverride, setOnboardedOverride] = useState(false);
  // Server-driven session state (Task 23): the AuthUser resolved from the BFF
  // (`GET /api/me` / the sign-in exchange / the seed seam). Replaces the retired
  // localStorage onboarding stopgap.
  const [serverUser, setServerUser] = useState<AuthUserLike | null>(null);
  const [connections, setConnections] = useState<ConnectionsState>(() =>
    seedNoneLinked(),
  );
  const [connectionsSeeded, setConnectionsSeeded] = useState(false);
  const bootstrappedRef = useRef(false);

  const accessToken = yv.auth.accessToken;

  // Intentional post-hydration mount gate (matches nav-auth's pattern): read
  // `window.location.search` once on the client, so SSR + first client render
  // always stay signed-out (D-ROUTE's accepted first-paint trade-off) — never
  // `useSearchParams` (dodges its Suspense/CSR-bailout requirement, plan R6).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(window.location.search);
    setMounted(true);
  }, []);

  // The server-driven bootstrap. In `?mock=` mode this is a HARD no-op (pure
  // client, zero network — keeps the pure-UI e2e specs unchanged). Otherwise it
  // establishes the real session: the `?seed=` seam mints a real cookie then loads
  // `GET /api/me`; a real YouVersion sign-in exchanges the access token; a plain
  // load probes for an existing cookie session. Any failure degrades to
  // signed-out (never throws), so signed-out pages are unaffected by API state.
  useEffect(() => {
    if (!mounted) return;
    if (parseMockSession(search, DEMO_FLAG)) return; // pure-client mock path

    let active = true;
    const setUser = (u: AuthUserLike | null) => {
      if (active) setServerUser(u);
    };

    const loadMe = async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { user?: AuthUserLike };
          if (data.user) setUser(data.user);
        }
      } catch {
        /* API unreachable → stay signed-out */
      }
    };

    void (async () => {
      const seed = parseSeedRequest(search, DEMO_FLAG);
      if (seed) {
        if (bootstrappedRef.current) return;
        bootstrappedRef.current = true;
        try {
          const res = await fetch("/api/test/seed", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scenario: seed.scenario, nonce: readNonce(search) }),
          });
          if (res.ok) await loadMe();
        } catch {
          /* seam disabled / API down → stay signed-out */
        }
        return;
      }

      if (yv.auth.isAuthenticated && accessToken) {
        if (bootstrappedRef.current) return;
        bootstrappedRef.current = true;
        try {
          const res = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ accessToken }),
          });
          if (res.ok) {
            const data = (await res.json()) as { user?: AuthUserLike };
            if (data.user) setUser(data.user);
          }
        } catch {
          /* exchange failed → stay signed-out */
        }
        return;
      }

      // No mock, no seed, not YouVersion-authed → probe for an existing cookie
      // session once (does NOT latch bootstrappedRef, so a later sign-in can still
      // exchange).
      await loadMe();
    })();

    return () => {
      active = false;
    };
  }, [mounted, search, yv.auth.isAuthenticated, accessToken]);

  const baseSession = useMemo(
    () =>
      resolveSession({
        yvAuth: yv,
        demoFlag: DEMO_FLAG,
        search,
        serverUser,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yv.auth.isAuthenticated, yv.userInfo, search, serverUser],
  );

  const session: Session = !mounted
    ? SIGNED_OUT_SESSION
    : onboardedOverride
      ? { ...baseSession, hasOnboarded: true }
      : baseSession;

  // Suppress the first-time wizard until onboarding state is KNOWN: in mock mode
  // it's known immediately; in real/seed mode only once the server user resolves.
  // This stops a real YouVersion sign-in from flashing the wizard pre-exchange.
  const onboardingResolved =
    parseMockSession(search, DEMO_FLAG) !== null || serverUser !== null;

  // Seed the mocked connections state once, from the `?mock=` or `?seed=`
  // scenario (or "none-linked" for a real, non-demo session — nothing is faked in
  // prod). Connections stay MOCK in the wizard; tasks 24/25 wire the real ones.
  useEffect(() => {
    if (!mounted || connectionsSeeded) return;
    const mock = parseMockSession(search, DEMO_FLAG);
    const seed = parseSeedRequest(search, DEMO_FLAG);
    const connSeed = mock?.connectionsSeed ?? seed?.connectionsSeed ?? "none-linked";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnections(seedFor(connSeed));
    setConnectionsSeeded(true);
  }, [mounted, connectionsSeeded, search]);

  // Hydrate the REAL github connection status (Task 24, real/seed mode only) once
  // a server session exists — so a returning user whose github is already
  // connected shows it on load without reconnecting. Never sets not-linked and
  // yields to an in-flight `pending`, so it can't clobber an optimistic connect.
  // Runs only after the mock seed has initialized the connections object.
  useEffect(() => {
    if (!mounted || !connectionsSeeded) return;
    if (parseMockSession(search, DEMO_FLAG)) return; // pure-client mock: no network
    if (!serverUser) return; // no server session → nothing to hydrate
    let active = true;
    void (async () => {
      const snap = await fetchGithubConnection({});
      if (!active || !snap.connected || !snap.login) return;
      const username = githubUsername(snap.login);
      setConnections((s) =>
        s.github.status === "pending" ? s : connectGithub(s, { username, repos: 0 }),
      );
      const repos = await fetchGithubRepoCount({});
      if (!active) return;
      setConnections((s) =>
        s.github.status === "connected" ? connectGithub(s, { username, repos }) : s,
      );
    })();
    return () => {
      active = false;
    };
  }, [mounted, connectionsSeeded, search, serverUser]);

  const connectProvider = (provider: Provider) => {
    const isMock = parseMockSession(search, DEMO_FLAG) !== null;

    // Real GitHub App connect (§5.3/§6a): open the install tab, then poll the BFF
    // until the callback has stored the connection — `pending` spans that real
    // round-trip. Only in the real/seed session path; mock mode + every
    // openrouter/gloo click stay on the pure mock timer (Task 25 wires the rest).
    if (provider === "github" && !isMock) {
      setConnections((s) => beginConnect(s, "github"));
      openGithubInstall(
        typeof window !== "undefined" ? window.open.bind(window) : () => null,
      );
      void (async () => {
        const login = await pollGithubConnected({});
        if (!login) {
          // Timed out → return the user to not-linked (they can retry).
          setConnections((s) => disconnectReducer(s, "github"));
          return;
        }
        const username = githubUsername(login);
        // Flip to connected immediately (opens the wizard gate); backfill the live
        // repo count without blocking the auto-advance.
        setConnections((s) => connectGithub(s, { username, repos: 0 }));
        const repos = await fetchGithubRepoCount({});
        setConnections((s) =>
          s.github.status === "connected"
            ? connectGithub(s, { username, repos })
            : s,
        );
      })();
      return;
    }

    setConnections((s) => beginConnect(s, provider));
    setTimeout(() => {
      setConnections((s) => completeConnect(s, provider));
    }, MOCK_OAUTH_DELAY_MS);
  };

  const disconnectProvider = (provider: Provider) => {
    const isMock = parseMockSession(search, DEMO_FLAG) !== null;
    if (provider === "github" && !isMock) {
      // Best-effort server disconnect; the optimistic reducer update is instant.
      void fetch("/api/connect/github", { method: "DELETE" }).catch(() => undefined);
    }
    setConnections((s) => disconnectReducer(s, provider));
  };

  const markOnboarded = () => {
    setOnboardedOverride(true); // optimistic — dismisses the wizard immediately
    if (parseMockSession(search, DEMO_FLAG)) return; // pure-client mock path
    // Real/seed mode: persist onboarding server-side and refresh the server user.
    void fetch("/api/me/onboarding", { method: "PATCH" })
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as { user?: AuthUserLike };
          if (data.user) setServerUser(data.user);
        }
      })
      .catch(() => undefined);
  };

  const signOut = () => {
    if (!parseMockSession(search, DEMO_FLAG)) {
      void fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
      setServerUser(null);
      bootstrappedRef.current = false;
    }
    yv.signOut();
  };

  const value: SessionContextValue = {
    mounted,
    session,
    firstSignIn: computeFirstSignIn(session) && onboardingResolved,
    connections,
    connectProvider,
    disconnectProvider,
    markOnboarded,
    signOut,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
