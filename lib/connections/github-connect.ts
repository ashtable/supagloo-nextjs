/**
 * The REAL GitHub App connect flow's browser-side orchestration (Task #24,
 * design-delta §5.3/§6a) plus the callback route's redirect-decision helpers.
 *
 * This is the effect layer §5.3 calls for: "keep the reducer; effects become BFF
 * calls; `pending` now spans a real OAuth round-trip." Everything here is pure and
 * injectable — `fetch`, `sleep`, `now`, and `open` are all parameters — so the
 * whole connect/poll/map surface is unit-testable with zero network and no React.
 * The `SessionProvider` wires these to the real `window`/`fetch`; the thin route
 * adapters wire `githubCallbackRedirect*` to `NextResponse`.
 *
 * Resolution mechanism: the main tab POLLS `GET /api/connections` (the merged
 * status endpoint) until github is connected — that is what lets `pending` span
 * the real install→callback→store round-trip while keeping the wizard's in-place
 * step state (a full-page redirect would reset the wizard). The `window.open` of
 * the install tab is fire-and-forget UX; correctness rides on the poll.
 */

const CONNECTIONS_URL = "/api/connections";
const REPOS_URL = "/api/github/repos";
const START_URL = "/api/connect/github/start";

export interface GithubSnapshot {
  connected: boolean;
  /** The real GitHub login (WITHOUT the leading `@`), or null when not connected. */
  login: string | null;
}

const NOT_CONNECTED: GithubSnapshot = { connected: false, login: null };

/** `@`-prefix a bare login for display; idempotent + trims. */
export function githubUsername(login: string): string {
  const trimmed = login.trim();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

/** Map the merged `GET /api/connections` body → github connected + login. Reads
 *  defensively (unknown body) — a non-object / null / empty-login all mean "not
 *  connected". */
export function githubSnapshotFromConnections(body: unknown): GithubSnapshot {
  const github = (body as { github?: unknown } | null | undefined)?.github as
    | { githubLogin?: unknown }
    | null
    | undefined;
  const login = github?.githubLogin;
  if (typeof login === "string" && login.length > 0) {
    return { connected: true, login };
  }
  return NOT_CONNECTED;
}

export interface FetchDeps {
  fetchImpl?: typeof fetch;
}

/** Read the current github connection status via the BFF. Never throws — a dead
 *  API / non-200 / no session all resolve to not-connected. */
export async function fetchGithubConnection(
  deps: FetchDeps = {},
): Promise<GithubSnapshot> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(CONNECTIONS_URL, { cache: "no-store" });
    if (!res.ok) return NOT_CONNECTED;
    return githubSnapshotFromConnections(await res.json());
  } catch {
    return NOT_CONNECTED;
  }
}

/** The live "N repos accessible" count (`GET /api/github/repos` →
 *  `repositories.length`). Best-effort: any failure (non-200 incl. 409
 *  not-connected, bad body, thrown fetch) → 0, so it never blocks the connected
 *  transition or the wizard auto-advance. */
export async function fetchGithubRepoCount(deps: FetchDeps = {}): Promise<number> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(REPOS_URL, { cache: "no-store" });
    if (!res.ok) return 0;
    const body = (await res.json()) as { repositories?: unknown };
    return Array.isArray(body.repositories) ? body.repositories.length : 0;
  } catch {
    return 0;
  }
}

export interface PollDeps extends FetchDeps {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  timeoutMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1200;
// Generous — spans the user tabbing over to GitHub, picking repos, and the
// callback round-trip. Best-effort UX: a timeout just returns the user to
// not-linked (they can retry), it does not error.
const DEFAULT_POLL_TIMEOUT_MS = 120_000;

/** Poll `GET /api/connections` until github is connected; returns the real login,
 *  or null once the deadline passes. Does an immediate first check, then waits
 *  `intervalMs` between polls. */
export async function pollGithubConnected(deps: PollDeps = {}): Promise<string | null> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const interval = deps.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeout = deps.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const deadline = now() + timeout;

  for (;;) {
    const snap = await fetchGithubConnection(deps);
    if (snap.connected && snap.login) return snap.login;
    if (now() >= deadline) return null;
    await sleep(interval);
  }
}

export type OpenWindow = (url: string, target?: string) => unknown;

/** Open the GitHub App install flow in a new tab (matches the "Opens GitHub in a
 *  new tab" footnote). A blocked/throwing `open` is swallowed — the poll still
 *  resolves the connection regardless of the popup. */
export function openGithubInstall(open: OpenWindow): void {
  try {
    open(START_URL, "_blank");
  } catch {
    /* popup blocked — the main-tab poll is the source of truth */
  }
}

// ── Callback route helpers (§6a) ──────────────────────────────────────────────

export type GithubCallbackTarget = "connected" | "error";

/**
 * The callback's redirect decision. Per the §6a diagram only `installationId` is
 * forwarded to the API (`setup_action` is received but never gates the flow — any
 * value proceeds to verify). Missing `installationId` → error (nothing forwarded);
 * otherwise the API's verify (200 vs anything else) is the source of truth.
 */
export function githubCallbackRedirectTarget(input: {
  installationId: string | null;
  /** The upstream `POST /v1/connections/github/callback` status, or null when the
   *  request was never forwarded (missing installationId). */
  upstreamStatus: number | null;
}): GithubCallbackTarget {
  if (!input.installationId) return "error";
  return input.upstreamStatus === 200 ? "connected" : "error";
}

/** The in-app path the callback redirects the tab back to. */
export function githubCallbackRedirectPath(target: GithubCallbackTarget): string {
  return target === "connected" ? "/?github=connected" : "/?github=error";
}
