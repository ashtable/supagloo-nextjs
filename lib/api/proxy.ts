import { apiBaseUrl } from "./config";

/**
 * The generic bearer-forwarding core every BFF route handler is built on (tasks
 * 24/25 — GitHub/OpenRouter/Gloo connect — reuse it verbatim). It forwards the
 * session cookie's raw token as `Authorization: Bearer …` to
 * `${baseUrl}/v1/<path>`, sends/receives JSON, and passes status + body + errors
 * straight through. It NEVER throws on a dead upstream — a network failure becomes
 * a 502 result, so a route handler can always answer.
 *
 * The Next.js-runtime glue (reading the httpOnly cookie, building a NextResponse,
 * setting cookies) lives in the thin route adapters, not here — this stays pure so
 * it's fully unit-testable with an injected `fetchImpl`.
 */

export interface ForwardResult {
  status: number;
  /** The parsed JSON body, or the raw text if it wasn't JSON, or null if empty. */
  body: unknown;
}

/**
 * How long any BFF forward waits for the API before giving up.
 *
 * `fetch` has NO default timeout, so before this existed a wedged upstream held this
 * proxy's promise — and the browser connection behind it — open indefinitely. That
 * stopped being theoretical when plan row 64 put an in-process GitHub rate-limit
 * backoff on `GET /v1/github/repos`, a page-load path: a throttled installation could
 * keep the API request open for minutes, and this proxy would simply wait (deferred
 * review finding DR3).
 *
 * It is a BACKSTOP, not a latency budget. It sits comfortably above the API's own
 * bounded interactive backoff (`INTERACTIVE_GITHUB_RETRY_BUDGET_MS`, 10 s, plus the
 * round trips around it), so a legitimately slow request still succeeds and only a
 * genuinely stuck one is cut — and it sits far below anything a user would sit through,
 * so "stuck" surfaces as an error a route handler can answer with.
 */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * The backstop for the ONE forward that legitimately blocks on GitHub for a minute:
 * `POST /api/projects/create-repo`.
 *
 * The api's `createRepoAndProject` creates a real repository and then waits up to **60 s**
 * (`VISIBILITY_DEFAULTS.timeoutMs`) for the installation to list it, because enqueueing
 * the scaffold before that lands makes it fail PERMANENTLY rather than slowly. The
 * default 30 s backstop above is therefore shorter than the operation it guards, and
 * `E-RNP1b` failed on it at exactly 30.0 s on two consecutive runs.
 *
 * Two things go wrong when the backstop is the shorter of the two, and the second is the
 * serious one:
 *
 *  1. the api's typed `RepoNotVisibleError` — which names the repo, the installation and
 *     the remedy — can never reach the browser here; the user gets a bare
 *     `upstream_timeout` instead, and every investigation starts from the wrong place;
 *  2. when the wait settles between 30 s and 60 s the api goes on to **succeed**, so the
 *     user is told their project failed while it is in fact being created. On a
 *     non-idempotent hop that creates a real GitHub repository, inviting a retry is the
 *     expensive direction to be wrong in.
 *
 * It stays a per-call exception rather than a new default (`U-PX2`): the patience is
 * justified by this hop's specific blocking behaviour, and granting it to every page-load
 * forward would reintroduce exactly the hang DR3 exists to prevent.
 */
export const PROVISIONING_UPSTREAM_TIMEOUT_MS = 90_000;

export interface ForwardOptions {
  /** API path WITHOUT the `/v1` prefix, e.g. `"me"` or `"me/onboarding"`. */
  path: string;
  method: string;
  /** Raw bearer token from the session cookie; omit/null for a public call. */
  token?: string | null;
  /** JSON body to send; omit for a bodyless request (GET/PATCH-no-body). */
  body?: unknown;
  baseUrl?: string;
  /** Override the {@link DEFAULT_UPSTREAM_TIMEOUT_MS} backstop for this one call. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function forwardToApi(opts: ForwardOptions): Promise<ForwardResult> {
  const base = opts.baseUrl ?? apiBaseUrl();
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${base}/v1/${opts.path}`;

  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;

  // Every forward carries an abort signal — the routes that never think about a hung
  // upstream are exactly the ones that need the backstop.
  const timeoutMs = opts.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeoutMs);
  const init: RequestInit = { method: opts.method, headers, signal };
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  let response: Response;
  try {
    response = await doFetch(url, init);
  } catch (err) {
    // A hung upstream is reported SEPARATELY from a dead one. They are different
    // operational faults — a timeout means the API answered nothing in
    // `timeoutMs`, an ECONNREFUSED means there was nothing there to answer — and
    // collapsing them would hide the one that only appears under load.
    if (isTimeout(err, signal)) {
      return { status: 504, body: { error: "upstream_timeout" } };
    }
    // A dead/unreachable upstream must not throw out of a route handler.
    return { status: 502, body: { error: "upstream_unreachable" } };
  }

  // The body stream is inside the same deadline: a response whose HEADERS arrive and
  // whose body then stalls is the same hang from the caller's side, and `text()` would
  // otherwise reject unhandled once the signal fires.
  let text: string;
  try {
    text = await response.text();
  } catch (err) {
    if (isTimeout(err, signal)) {
      return { status: 504, body: { error: "upstream_timeout" } };
    }
    return { status: 502, body: { error: "upstream_unreachable" } };
  }

  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}

/**
 * Did this failure come from our own deadline rather than from the network?
 *
 * `signal.aborted` is the authoritative signal — it is OURS, and it holds whatever the
 * runtime chose to reject with (Node has shipped both `AbortError` and `TimeoutError`
 * here). The name check is the fallback for a `fetch` stand-in that rejects without
 * flipping the signal.
 */
function isTimeout(err: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  const name = (err as { name?: unknown } | null | undefined)?.name;
  return name === "AbortError" || name === "TimeoutError";
}
