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
const LINK_EXISTING_URL = "/api/connect/github/link-existing/start";

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

/**
 * The live "N repos accessible" count (`GET /api/github/repos` →
 * `repositories.length`). Best-effort: any failure (non-200 incl. 409
 * not-connected, bad body, thrown fetch) → 0, so it never blocks the connected
 * transition or the wizard auto-advance.
 *
 * **`?filter=all` is stated EXPLICITLY, and that is the point** (deferred review
 * finding DR2). This call renders a COUNT; it never reads `empty`. The API prices
 * plan row 65's per-repo emptiness probe off the query — `filter=empty` or a `q`
 * narrowing buys an authoritative verdict, the unnarrowed listing buys none — so
 * asking for the whole listing with no narrowing is what makes this request cost
 * one token mint plus the page walk and NOTHING else. It is issued on every hard
 * page load of every page in the app (see `SessionProvider`), against an
 * installation with a ~5,000-requests/hour budget, so the difference is ~700 page
 * loads before exhaustion instead of ~80. Relying on the route's `filter` default
 * would produce the same request; saying it out loud is what stops the next reader
 * from "tidying" this into `?filter=empty` without seeing the bill.
 */
export async function fetchGithubRepoCount(deps: FetchDeps = {}): Promise<number> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${REPOS_URL}?filter=all`, { cache: "no-store" });
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

/**
 * Open `url` in a new tab and report whether the browser actually opened one.
 *
 * `window.open` signals a refused popup by returning `null`, NOT by throwing, so a
 * bare try/catch sees a blocked popup as success. Both are treated as a refusal here.
 *
 * The refusal has to reach the caller because it is TERMINAL for these flows: the
 * provider callback can only fire from inside that tab, so with no tab there is
 * nothing for the poll to observe and it can only run out its timeout. The previous
 * "the poll is the source of truth" posture was true of the poll and false of the
 * user, who watched a spinner for two minutes and learned nothing.
 */
function openTab(open: OpenWindow, url: string): boolean {
  try {
    return open(url, "_blank") != null;
  } catch {
    return false;
  }
}

/** Open the GitHub App install flow in a new tab (matches the "Opens GitHub in a
 *  new tab" footnote). Returns false when the browser refused the popup — see
 *  {@link openTab} for why that is not swallowed. */
export function openGithubInstall(open: OpenWindow): boolean {
  return openTab(open, START_URL);
}

/**
 * Open the "I already installed it" path in a new tab.
 *
 * Needed because {@link openGithubInstall} silently dead-ends for anyone already
 * installed: GitHub redirects to the App's Setup URL only when an installation is
 * CREATED, so a reinstall, an install made from GitHub's own directory, or one App
 * registration shared across environments lands the user on the installation settings
 * page. No callback fires, the poll never sees a connection, and the only remaining
 * move is one the UI does not offer. This is that move.
 *
 * Same refusal reporting as the install open — see {@link openTab}.
 */
export function openGithubLinkExisting(open: OpenWindow): boolean {
  return openTab(open, LINK_EXISTING_URL);
}

// ── Callback route helpers (§6a) ──────────────────────────────────────────────

export type GithubCallbackTarget = "connected" | "error";

/**
 * The callback's redirect decision. Per the §6a diagram only `installationId` is
 * forwarded to the API (`setup_action` is received but never gates the flow — any
 * value proceeds to verify). Neither `installationId` NOR `code` → error (nothing was
 * forwarded); otherwise the API's verify (200 vs anything else) is the source of truth.
 */
export function githubCallbackRedirectTarget(input: {
  installationId: string | null;
  /** The user-authorization `code`, when GitHub returned one. */
  code?: string | null;
  /** The upstream status, or null when nothing was forwarded. */
  upstreamStatus: number | null;
}): GithubCallbackTarget {
  if (!input.installationId && !input.code) return "error";
  return input.upstreamStatus === 200 ? "connected" : "error";
}

/** Which upstream call this callback should make, if any. */
export type GithubCallbackMode = "install" | "link-existing" | "none";

/**
 * One callback URL now serves two arrivals, so this names which one happened.
 *
 * `installation_id` means GitHub just CREATED an installation and told us its id — the
 * original §6a path, and the cheaper one, because the id needs only an App-JWT verify.
 *
 * A bare `code` means the user authorized us without an installation being created.
 * That is the case the install callback structurally cannot produce: GitHub redirects
 * to the Setup URL only on creation, so a reinstall, an install made from GitHub's own
 * directory, or one App registration shared across environments arrives here with no
 * id at all. The server resolves it by asking which installations the user has.
 *
 * When BOTH are present — which is what "Request user authorization (OAuth) during
 * installation" produces — the id wins. It is the direct answer; spending the code to
 * re-derive something GitHub already told us would be a round trip for nothing.
 */
export function githubCallbackMode(input: {
  installationId: string | null;
  code: string | null;
}): GithubCallbackMode {
  if (input.installationId) return "install";
  if (input.code) return "link-existing";
  return "none";
}

/** The in-app path the callback redirects the tab back to. */
export function githubCallbackRedirectPath(target: GithubCallbackTarget): string {
  return target === "connected" ? "/?github=connected" : "/?github=error";
}
