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
  connectOpenRouter,
  connectGloo,
  disconnect as disconnectReducer,
  MOCK_OAUTH_DELAY_MS,
  type ConnectionsState,
  type Provider,
} from "@/lib/connections/connections-model";
import {
  githubUsername,
  githubSnapshotFromConnections,
  openGithubInstall,
  pollGithubConnected,
  fetchGithubRepoCount,
} from "@/lib/connections/github-connect";
import {
  buildAuthorizeUrl,
  openrouterBrowserBaseUrl,
  maskOpenRouterKey,
  openrouterSnapshotFromConnections,
  pollOpenRouterConnected,
  fetchOpenRouterCreditsLabel,
  storeVerifier,
  OPENROUTER_CALLBACK_PATH,
} from "@/lib/connections/openrouter-connect";
import {
  glooSnapshotFromConnections,
  saveGlooCredentials,
  glooErrorMessage,
  type GlooCredentials,
} from "@/lib/connections/gloo-connect";
import {
  requestDisconnect,
  disconnectErrorMessage,
} from "@/lib/connections/disconnect";
import { generateCodeVerifier, computeCodeChallenge } from "@/lib/connections/pkce";
import type { ConnectionsSeedName } from "@/lib/session/session-model";

const CREDIT_CHECKING = "Checking credits…";
const CREDIT_UNAVAILABLE = "Credits unavailable";

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
  /** Begin a connect. In real/seed mode github/openrouter/gloo run their real BFF
   *  flows; in mock mode (or as a fallback) it's the `MOCK_OAUTH_DELAY_MS` timer.
   *  Gloo passes its `{clientId, clientSecret}` payload; the others take none. */
  connectProvider: (provider: Provider, payload?: GlooCredentials) => void;
  disconnectProvider: (provider: Provider) => void;
  /** The Gloo save-&-verify server error (e.g. a live `invalid_gloo_credentials`
   *  verify failure), surfaced in the Gloo form; null when there is none. */
  glooError: string | null;
  /** Clear the Gloo server error (the form calls this as the user edits). */
  clearGlooError: () => void;
  /** Per-provider disconnect error: set when a real DELETE failed (non-2xx or
   *  network) so the provider stayed connected — surfaced on the connected card so
   *  the user knows the disconnect didn't take and can retry. Null when there is
   *  none. */
  disconnectErrors: Record<Provider, string | null>;
  /** Clear a provider's disconnect error (a fresh disconnect attempt does this). */
  clearDisconnectError: (provider: Provider) => void;
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
  const [glooError, setGlooError] = useState<string | null>(null);
  const [disconnectErrors, setDisconnectErrors] = useState<
    Record<Provider, string | null>
  >({ github: null, openrouter: null, gloo: null });
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

  // Hydrate the REAL connection statuses (Tasks 24/25, real/seed mode only) once a
  // server session exists — so a returning user whose accounts are already
  // connected shows them on load without reconnecting. One `GET /api/connections`
  // read, mapped per provider by the pure snapshot helpers. Never sets not-linked
  // and yields to an in-flight `pending`, so it can't clobber an optimistic
  // connect. OpenRouter credits are fetched LIVE (§2.4). Runs only after the mock
  // seed has initialized the connections object.
  useEffect(() => {
    if (!mounted || !connectionsSeeded) return;
    if (parseMockSession(search, DEMO_FLAG)) return; // pure-client mock: no network
    if (!serverUser) return; // no server session → nothing to hydrate
    let active = true;
    void (async () => {
      let body: unknown = null;
      try {
        const res = await fetch("/api/connections", { cache: "no-store" });
        if (res.ok) body = await res.json();
      } catch {
        return; // API unreachable → leave the seeded (not-linked) state
      }
      if (!active || !body) return;

      // GitHub — flip connected immediately, backfill the live repo count.
      const gh = githubSnapshotFromConnections(body);
      if (gh.connected && gh.login) {
        const username = githubUsername(gh.login);
        setConnections((s) =>
          s.github.status === "pending" ? s : connectGithub(s, { username, repos: 0 }),
        );
        const repos = await fetchGithubRepoCount({});
        if (active) {
          setConnections((s) =>
            s.github.status === "connected" ? connectGithub(s, { username, repos }) : s,
          );
        }
      }

      // OpenRouter — masked key now, live credits backfilled (§2.4/§9-Q5).
      const or = openrouterSnapshotFromConnections(body);
      if (active && or.connected && or.keyLast4) {
        const maskedKey = maskOpenRouterKey(or.keyLast4);
        setConnections((s) =>
          s.openrouter.status === "pending"
            ? s
            : connectOpenRouter(s, { maskedKey, credit: CREDIT_CHECKING }),
        );
        const credit = await fetchOpenRouterCreditsLabel({});
        if (active) {
          setConnections((s) =>
            s.openrouter.status === "connected"
              ? connectOpenRouter(s, { maskedKey, credit: credit ?? CREDIT_UNAVAILABLE })
              : s,
          );
        }
      }

      // Gloo — the real stored clientId.
      const gl = glooSnapshotFromConnections(body);
      if (active && gl.connected && gl.clientId) {
        const clientId = gl.clientId;
        setConnections((s) =>
          s.gloo.status === "pending"
            ? s
            : connectGloo(s, { method: "CLIENT CREDENTIALS", clientId }),
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [mounted, connectionsSeeded, search, serverUser]);

  const clearGlooError = () => setGlooError(null);

  const setDisconnectError = (provider: Provider, message: string) =>
    setDisconnectErrors((e) => ({ ...e, [provider]: message }));
  const clearDisconnectError = (provider: Provider) =>
    setDisconnectErrors((e) => (e[provider] ? { ...e, [provider]: null } : e));

  const connectProvider = (provider: Provider, payload?: GlooCredentials) => {
    const isMock = parseMockSession(search, DEMO_FLAG) !== null;

    // Real GitHub App connect (§5.3/§6a): open the install tab, then poll the BFF
    // until the callback has stored the connection — `pending` spans that real
    // round-trip. Only in the real/seed session path.
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

    // Real OpenRouter PKCE connect (§5.1/§6a/§9-Q5): generate the verifier +
    // challenge, stash the verifier (the popup callback page reads it), open the
    // authorize tab, then POLL until the callback page's exchange + key POST has
    // stored the connection — `pending` spans that real round-trip. The exchange
    // stays browser-side; the server only ever sees the final key.
    if (provider === "openrouter" && !isMock) {
      setConnections((s) => beginConnect(s, "openrouter"));
      void (async () => {
        const verifier = generateCodeVerifier();
        const challenge = await computeCodeChallenge(verifier);
        storeVerifier(verifier);
        const callbackUrl = `${window.location.origin}${OPENROUTER_CALLBACK_PATH}`;
        const authorizeUrl = buildAuthorizeUrl({
          baseUrl: openrouterBrowserBaseUrl(),
          callbackUrl,
          codeChallenge: challenge,
        });
        try {
          window.open(authorizeUrl, "_blank");
        } catch {
          /* popup blocked — the callback page can still complete via the poll */
        }
        const last4 = await pollOpenRouterConnected({});
        if (!last4) {
          setConnections((s) => disconnectReducer(s, "openrouter"));
          return;
        }
        const maskedKey = maskOpenRouterKey(last4);
        // Flip to connected immediately (opens the optional-step advance); backfill
        // the LIVE credit label without blocking.
        setConnections((s) =>
          connectOpenRouter(s, { maskedKey, credit: CREDIT_CHECKING }),
        );
        const credit = await fetchOpenRouterCreditsLabel({});
        setConnections((s) =>
          s.openrouter.status === "connected"
            ? connectOpenRouter(s, { maskedKey, credit: credit ?? CREDIT_UNAVAILABLE })
            : s,
        );
      })();
      return;
    }

    // Real Gloo save-&-verify (§2.5/§6a): PUT the credentials; the API mints a LIVE
    // client-credentials test token. Success → connected with the real clientId; a
    // failed verify (400) surfaces as a real form error, back to not-linked.
    if (provider === "gloo" && !isMock) {
      if (!payload) return; // the form guarantees credentials
      setGlooError(null);
      setConnections((s) => beginConnect(s, "gloo"));
      void (async () => {
        const result = await saveGlooCredentials({
          clientId: payload.clientId,
          clientSecret: payload.clientSecret,
        });
        if (result.ok) {
          setConnections((s) =>
            connectGloo(s, {
              method: "CLIENT CREDENTIALS",
              clientId: result.connection.clientId,
            }),
          );
        } else {
          setGlooError(glooErrorMessage(result.error));
          setConnections((s) => disconnectReducer(s, "gloo"));
        }
      })();
      return;
    }

    // Mock mode (any provider) OR a real fallback: the pure `MOCK_OAUTH_DELAY_MS`
    // timer with the hardcoded mock detail — keeps the pure-UI e2e specs unchanged.
    setConnections((s) => beginConnect(s, provider));
    setTimeout(() => {
      setConnections((s) => completeConnect(s, provider));
    }, MOCK_OAUTH_DELAY_MS);
  };

  const disconnectProvider = (provider: Provider) => {
    const isMock = parseMockSession(search, DEMO_FLAG) !== null;

    // Mock mode: pure-client, instant optimistic flip (unchanged — keeps the
    // pure-UI e2e specs synchronous, no network).
    if (isMock) {
      if (provider === "gloo") setGlooError(null);
      setConnections((s) => disconnectReducer(s, provider));
      return;
    }

    // Real/seed mode: the DELETE must actually SUCCEED before we tell the user the
    // account is disconnected. A user often disconnects precisely because they
    // believe a credential is compromised (an OpenRouter key / Gloo secret), so
    // falsely showing "disconnected" while the server still holds the live
    // credential is the exact failure we must avoid. On a non-2xx or a network
    // error, leave the provider CONNECTED and surface a per-provider error so the
    // user knows the disconnect didn't take and can retry. Applied to all three
    // providers for consistency (they share this one code path).
    clearDisconnectError(provider);
    void (async () => {
      const { ok } = await requestDisconnect(provider);
      if (!ok) {
        setDisconnectError(provider, disconnectErrorMessage(provider));
        return; // stay connected — the credential is still live server-side
      }
      if (provider === "gloo") setGlooError(null);
      setConnections((s) => disconnectReducer(s, provider));
    })();
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
    glooError,
    clearGlooError,
    disconnectErrors,
    clearDisconnectError,
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
