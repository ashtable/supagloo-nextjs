/**
 * The flag-gated mock-session reachability seam (plan D-AUTH).
 *
 * Stagehand can't complete real YouVersion OAuth, so the signed-in UI (10a
 * workspace, 10b profile, 11a wizard, 11b/11c modals) would otherwise be
 * unreachable in E2E. In demo mode only (`NEXT_PUBLIC_SUPAGLOO_DEMO === "1"`,
 * set in `.env.local` for dev + E2E, absent in prod), a `?mock=<scenario>`
 * query param can force a deterministic signed-in session. This module is
 * pure — no React, no `window` — so it's fully unit-testable; the client
 * `SessionProvider` is the only place that touches `window`/`localStorage`.
 */

export type MockScenario = "authed-fresh" | "authed-returning" | "authed-unlinked";

/** Which `lib/connections/connections-model.ts` seed a mock scenario starts from. */
export type ConnectionsSeedName = "wireframe" | "none-linked" | "all-linked";

export interface MockSession {
  scenario: MockScenario;
  isAuthed: true;
  hasOnboarded: boolean;
  connectionsSeed: ConnectionsSeedName;
}

const MOCK_SCENARIOS: Record<
  MockScenario,
  { hasOnboarded: boolean; connectionsSeed: ConnectionsSeedName }
> = {
  // Fresh sign-in, onboarding NOT done → the wizard overlays the workspace.
  // Nothing is linked yet; the wizard is what links them.
  "authed-fresh": { hasOnboarded: false, connectionsSeed: "none-linked" },
  // Onboarded returning user, the wireframe's connection mix (github +
  // openrouter connected, gloo not-linked).
  "authed-returning": { hasOnboarded: true, connectionsSeed: "wireframe" },
  // Onboarded, but every provider is not-linked — exercises 10b's Connect
  // buttons (→ 11b/11c) on an otherwise-settled account.
  "authed-unlinked": { hasOnboarded: true, connectionsSeed: "none-linked" },
};

/**
 * Parse the demo `?mock=` override. Returns `null` when the demo flag is off
 * (prod safety — real YouVersion auth is the only path to `isAuthed`), or the
 * scenario is missing/unrecognized.
 */
export function parseMockSession(
  search: string,
  demoFlag: boolean,
): MockSession | null {
  if (!demoFlag) return null;

  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const scenario = params.get("mock");
  if (!scenario || !(scenario in MOCK_SCENARIOS)) return null;

  const s = scenario as MockScenario;
  const { hasOnboarded, connectionsSeed } = MOCK_SCENARIOS[s];
  return { scenario: s, isAuthed: true, hasOnboarded, connectionsSeed };
}

/**
 * Parse the extended real-cookie seam's `?seed=` override (Task 23). Distinct
 * from `?mock=` so the pure-client mock path stays byte-for-byte unchanged: where
 * `?mock=` fabricates a session client-side with zero network, `?seed=` tells the
 * `SessionProvider` to mint a REAL httpOnly cookie via `POST /api/test/seed` and
 * then run the actual server-driven session/onboarding path. Returns `null` (a
 * HARD no-op) unless the demo flag is set and the scenario is recognized — the
 * connections seed still drives the wizard's (still-mocked) connect steps.
 */
export function parseSeedRequest(
  search: string,
  demoFlag: boolean,
): { scenario: MockScenario; connectionsSeed: ConnectionsSeedName } | null {
  if (!demoFlag) return null;

  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const scenario = params.get("seed");
  if (!scenario || !(scenario in MOCK_SCENARIOS)) return null;

  const s = scenario as MockScenario;
  return { scenario: s, connectionsSeed: MOCK_SCENARIOS[s].connectionsSeed };
}

/** The minimal shape of the server `AuthUser` this pure module consumes (from
 *  `GET /api/me` / the session exchange). */
export interface AuthUserLike {
  displayName: string;
  email: string;
  onboardingCompletedAt: string | null;
}

/** Server truth for onboarding — replaces the retired localStorage `"1"` stopgap.
 *  Onboarded iff the server user carries a non-null `onboardingCompletedAt`. */
export function hasOnboardedFromServer(user: AuthUserLike | null): boolean {
  return !!user && user.onboardingCompletedAt !== null;
}

export interface SessionUser {
  name: string;
  email: string;
}

export interface Session {
  isAuthed: boolean;
  user: SessionUser | null;
  hasOnboarded: boolean;
}

/** The minimal shape of `useYVAuth()` this module consumes (memory `auth-integration`). */
export interface YvAuthLike {
  auth: { isAuthenticated: boolean; isLoading?: boolean };
  userInfo: { name?: string; email?: string; userId?: string } | null;
}

export interface ResolveSessionInput {
  yvAuth: YvAuthLike;
  demoFlag: boolean;
  search: string;
  /** The resolved server user (from `GET /api/me` / the session exchange / the
   *  seed), or `null` before/without a server session. Replaces the retired
   *  `onboardedRaw` localStorage input — onboarding is now server-driven. */
  serverUser: AuthUserLike | null;
}

// The seeded demo identity (plan D-DATA) — used only when the mock override wins.
const DEMO_USER: SessionUser = { name: "Ash Srinivas", email: "ash@supagloo.com" };

/**
 * Resolve the final session. Precedence:
 *   1. the pure-client `?mock=` override (demo flag + scenario) — unchanged;
 *   2. a resolved SERVER user (real sign-in or the seed seam) — its
 *      `onboardingCompletedAt` decides `hasOnboarded`;
 *   3. real YouVersion auth without a server user yet (pre-exchange) — authed,
 *      onboarding-unknown (the provider suppresses the wizard until #2 lands);
 *   4. signed out.
 */
export function resolveSession(input: ResolveSessionInput): Session {
  const mock = parseMockSession(input.search, input.demoFlag);
  if (mock) {
    return { isAuthed: true, user: DEMO_USER, hasOnboarded: mock.hasOnboarded };
  }

  if (input.serverUser) {
    return {
      isAuthed: true,
      user: { name: input.serverUser.displayName, email: input.serverUser.email },
      hasOnboarded: hasOnboardedFromServer(input.serverUser),
    };
  }

  if (input.yvAuth.auth.isAuthenticated) {
    const info = input.yvAuth.userInfo;
    return {
      isAuthed: true,
      user: { name: info?.name ?? "", email: info?.email ?? "" },
      hasOnboarded: false,
    };
  }

  return { isAuthed: false, user: null, hasOnboarded: false };
}

/** Is this the visitor's first authed visit (wizard territory)? */
export function firstSignIn(session: Session): boolean {
  return session.isAuthed && !session.hasOnboarded;
}
