"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useYVAuth } from "@youversion/platform-react-ui";
import {
  resolveSession,
  parseMockSession,
  onboardingStorageKey,
  firstSignIn as computeFirstSignIn,
  type Session,
} from "@/lib/session/session-model";
import {
  seedWireframe,
  seedNoneLinked,
  seedAllLinked,
  beginConnect,
  completeConnect,
  disconnect as disconnectReducer,
  MOCK_OAUTH_DELAY_MS,
  type ConnectionsState,
  type Provider,
} from "@/lib/connections/connections-model";
import type { ConnectionsSeedName } from "@/lib/session/session-model";

// Build-time constant — inlined by Next.js. Absent/unset in prod, so the
// `?mock=` override is always a hard no-op there (plan R1).
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

interface SessionContextValue {
  /** False until after the client mount effect — first paint is always signed-out. */
  mounted: boolean;
  session: Session;
  firstSignIn: boolean;
  connections: ConnectionsState;
  /** Begin the mocked OAuth transition: pending now, connected after `MOCK_OAUTH_DELAY_MS`. */
  connectProvider: (provider: Provider) => void;
  disconnectProvider: (provider: Provider) => void;
  /** Marks onboarding complete (dismisses the wizard) and persists it for real sessions. */
  markOnboarded: () => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const yv = useYVAuth();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [onboardedOverride, setOnboardedOverride] = useState(false);
  const [onboardedRaw, setOnboardedRaw] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionsState>(() =>
    seedNoneLinked(),
  );
  const [connectionsSeeded, setConnectionsSeeded] = useState(false);

  const userId = yv.userInfo?.userId;

  // Intentional post-hydration mount gate (matches nav-auth's pattern): read
  // `window.location.search` + the localStorage onboarding stopgap once on the
  // client, so SSR + first client render always stay signed-out (D-ROUTE's
  // accepted first-paint trade-off) — never `useSearchParams` (dodges its
  // Suspense/CSR-bailout requirement, plan R6). One-shot effect setStates, not
  // a cascading-render bug — same documented exception as `nav-auth.tsx`.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(window.location.search);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOnboardedRaw(null);
      return;
    }
    setOnboardedRaw(window.localStorage.getItem(onboardingStorageKey(userId)));
  }, [mounted, userId]);

  const baseSession = useMemo(
    () =>
      resolveSession({
        yvAuth: yv,
        demoFlag: DEMO_FLAG,
        search,
        onboardedRaw,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yv.auth.isAuthenticated, yv.userInfo, search, onboardedRaw],
  );

  const session: Session = !mounted
    ? SIGNED_OUT_SESSION
    : onboardedOverride
      ? { ...baseSession, hasOnboarded: true }
      : baseSession;

  // Seed the mocked connections state once, from the `?mock=` scenario (or
  // "none-linked" for a real, non-demo session — nothing is faked in prod).
  useEffect(() => {
    if (!mounted || connectionsSeeded) return;
    const mock = parseMockSession(search, DEMO_FLAG);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnections(seedFor(mock?.connectionsSeed ?? "none-linked"));
    setConnectionsSeeded(true);
  }, [mounted, connectionsSeeded, search]);

  const connectProvider = (provider: Provider) => {
    setConnections((s) => beginConnect(s, provider));
    setTimeout(() => {
      setConnections((s) => completeConnect(s, provider));
    }, MOCK_OAUTH_DELAY_MS);
  };

  const disconnectProvider = (provider: Provider) => {
    setConnections((s) => disconnectReducer(s, provider));
  };

  const markOnboarded = () => {
    setOnboardedOverride(true);
    if (typeof window !== "undefined" && userId) {
      window.localStorage.setItem(onboardingStorageKey(userId), "1");
    }
  };

  const value: SessionContextValue = {
    mounted,
    session,
    firstSignIn: computeFirstSignIn(session),
    connections,
    connectProvider,
    disconnectProvider,
    markOnboarded,
    signOut: () => yv.signOut(),
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
