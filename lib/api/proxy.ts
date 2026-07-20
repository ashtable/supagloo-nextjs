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

export interface ForwardOptions {
  /** API path WITHOUT the `/v1` prefix, e.g. `"me"` or `"me/onboarding"`. */
  path: string;
  method: string;
  /** Raw bearer token from the session cookie; omit/null for a public call. */
  token?: string | null;
  /** JSON body to send; omit for a bodyless request (GET/PATCH-no-body). */
  body?: unknown;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function forwardToApi(opts: ForwardOptions): Promise<ForwardResult> {
  const base = opts.baseUrl ?? apiBaseUrl();
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${base}/v1/${opts.path}`;

  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;

  const init: RequestInit = { method: opts.method, headers };
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  let response: Response;
  try {
    response = await doFetch(url, init);
  } catch {
    // A dead/unreachable upstream must not throw out of a route handler.
    return { status: 502, body: { error: "upstream_unreachable" } };
  }

  const text = await response.text();
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
