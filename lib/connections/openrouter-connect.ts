/**
 * The REAL OpenRouter connect flow's browser-side orchestration (Task #25,
 * design-delta §5.1/§6a/§9-Q5) plus its masked-key / live-credits display helpers.
 *
 * OpenRouter's PKCE is entirely browser-side (§5.1 — NO server callback route): the
 * browser generates a verifier/challenge, redirects to OpenRouter's authorize page,
 * exchanges the returned code for a key DIRECTLY with OpenRouter (the BFF/API never
 * see the code/verifier, §9-Q5), and POSTs only the resulting key to the BFF. The
 * `SessionProvider` (main tab) then POLLS the merged status endpoint until
 * openrouter is connected — mirroring the GitHub flow so `pending` spans the real
 * round trip and the wizard keeps its in-place step state.
 *
 * Everything here is pure + injectable (`fetch`/`sleep`/`now` are params), so the
 * whole surface is unit-testable with zero network and no React. The thin route
 * adapters, the client callback page, and the provider glue wire it to the real
 * `window`/`fetch`/`localStorage`.
 */

const CONNECTIONS_URL = "/api/connections";
const CREDITS_URL = "/api/connections/openrouter/credits";
const CONNECT_URL = "/api/connect/openrouter";

/** The in-app client callback page OpenRouter redirects back to (§5.1: this is a
 *  client page, not a server route — it completes the exchange in the browser). */
export const OPENROUTER_CALLBACK_PATH = "/connect/openrouter/callback";

/** localStorage key the verifier is stashed under between authorize and callback.
 *  localStorage (not sessionStorage) so the popup callback tab can read what the
 *  opener wrote (same origin, shared). Cleared immediately after the exchange. */
const VERIFIER_STORAGE_KEY = "supagloo.openrouter.pkce_verifier";

/** Six U+2022 bullets — the exact §9-Q5 mask body. */
const MASK_BODY = "•".repeat(6);

/** Compose the §9-Q5 masked display: `sk-or-` + six bullets + the last four chars. */
export function maskOpenRouterKey(last4: string): string {
  return `sk-or-${MASK_BODY}${last4}`;
}

/** The connected-card credit label from a live `remaining` balance (§2.4). */
export function formatCreditRemaining(remaining: number): string {
  return `$${remaining.toFixed(2)} credit remaining`;
}

/** The browser-side OpenRouter base URL (authorize + token exchange). Overridable
 *  for e2e (`NEXT_PUBLIC_OPENROUTER_BASE_URL`), else the real hosted origin. */
export function openrouterBrowserBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_OPENROUTER_BASE_URL ?? "https://openrouter.ai";
  return raw.replace(/\/+$/, "");
}

export interface OpenRouterSnapshot {
  connected: boolean;
  /** The masked-display suffix (last 4 of the key), or null when not connected. */
  keyLast4: string | null;
}

const NOT_CONNECTED: OpenRouterSnapshot = { connected: false, keyLast4: null };

/** Map the merged `GET /api/connections` body → openrouter connected + keyLast4.
 *  Defensive read (unknown body): non-object / null / empty keyLast4 = not linked. */
export function openrouterSnapshotFromConnections(body: unknown): OpenRouterSnapshot {
  const or = (body as { openrouter?: unknown } | null | undefined)?.openrouter as
    | { keyLast4?: unknown }
    | null
    | undefined;
  const last4 = or?.keyLast4;
  if (typeof last4 === "string" && last4.length > 0) {
    return { connected: true, keyLast4: last4 };
  }
  return NOT_CONNECTED;
}

/** The OpenRouter authorize URL: `${base}/auth?callback_url=…&code_challenge=…&
 *  code_challenge_method=S256`. */
export function buildAuthorizeUrl(input: {
  baseUrl: string;
  callbackUrl: string;
  codeChallenge: string;
}): string {
  const base = input.baseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/auth`);
  url.searchParams.set("callback_url", input.callbackUrl);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Read the `code` OpenRouter appends to the callback URL, or null. */
export function readCallbackCode(search: string): string | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("code");
}

export interface FetchDeps {
  fetchImpl?: typeof fetch;
}

/**
 * The browser↔OpenRouter token exchange (§5.1): POST the code + verifier to
 * `${baseUrl}/api/v1/auth/keys`, returning the minted key. Never throws — a
 * non-200 / bad body / dead network all resolve to null (the caller surfaces it).
 */
export async function exchangeOpenRouterCode(input: {
  code: string;
  verifier: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const doFetch = input.fetchImpl ?? fetch;
  const base = input.baseUrl.replace(/\/+$/, "");
  try {
    const res = await doFetch(`${base}/api/v1/auth/keys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: input.code,
        code_verifier: input.verifier,
        code_challenge_method: "S256",
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { key?: unknown };
    return typeof body.key === "string" && body.key.length > 0 ? body.key : null;
  } catch {
    return null;
  }
}

/** POST the exchanged key to the BFF (`POST /api/connect/openrouter`). This is the
 *  ONLY leg the server sees (§9-Q5). true iff stored (200). Never throws. */
export async function postOpenRouterKey(input: {
  key: string;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const res = await doFetch(CONNECT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: input.key }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Read the current openrouter connection via the BFF. Never throws → not-connected. */
export async function fetchOpenRouterConnection(
  deps: FetchDeps = {},
): Promise<OpenRouterSnapshot> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(CONNECTIONS_URL, { cache: "no-store" });
    if (!res.ok) return NOT_CONNECTED;
    return openrouterSnapshotFromConnections(await res.json());
  } catch {
    return NOT_CONNECTED;
  }
}

export interface PollDeps extends FetchDeps {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  timeoutMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1200;
const DEFAULT_POLL_TIMEOUT_MS = 120_000;

/** Poll `GET /api/connections` until openrouter is connected; returns keyLast4, or
 *  null once the deadline passes (best-effort — a timeout returns to not-linked). */
export async function pollOpenRouterConnected(deps: PollDeps = {}): Promise<string | null> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const interval = deps.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeout = deps.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const deadline = now() + timeout;

  for (;;) {
    const snap = await fetchOpenRouterConnection(deps);
    if (snap.connected && snap.keyLast4) return snap.keyLast4;
    if (now() >= deadline) return null;
    await sleep(interval);
  }
}

/** The live credit label (§2.4 — never stored, fetched per view). Best-effort: any
 *  failure (409 not-connected, bad body, thrown fetch) → null so the card can fall
 *  back gracefully rather than block. */
export async function fetchOpenRouterCreditsLabel(deps: FetchDeps = {}): Promise<string | null> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(CREDITS_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { remaining?: unknown };
    return typeof body.remaining === "number"
      ? formatCreditRemaining(body.remaining)
      : null;
  } catch {
    return null;
  }
}

// ── PKCE verifier stash (localStorage; SSR-safe) ──────────────────────────────

export function storeVerifier(verifier: string): void {
  try {
    window.localStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
  } catch {
    /* storage unavailable — the connect will fail closed on the callback */
  }
}

export function readVerifier(): string | null {
  try {
    return window.localStorage.getItem(VERIFIER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearVerifier(): void {
  try {
    window.localStorage.removeItem(VERIFIER_STORAGE_KEY);
  } catch {
    /* no-op */
  }
}
