/**
 * The app's own PUBLIC origin — the one a browser can actually reach — for building the
 * absolute URLs that leave this process: 302 `Location` headers, and the `redirect_uri`
 * we hand to GitHub.
 *
 * `request.url` cannot do this job, and the failure is silent. In a container it reports
 * the origin the server LISTENS on, not the origin the browser arrived by, so with
 * compose's `8000:3000` mapping every `new URL(path, request.url)` resolved against
 * `http://localhost:3000` — a port nothing is published on. MEASURED against the running
 * stack: a request to `:8000` returned `location: http://localhost:3000/?github=error`,
 * and it did so unchanged when sent an explicit `Host: example.test` AND when sent
 * `X-Forwarded-Host: localhost:8000`. So this is not a header-trust question at all —
 * `request.url` simply does not carry the public origin, and no proxy configuration makes
 * it. The GitHub connect tab landed on a dead address; worse, `create-repo/start` built
 * its OAuth `redirect_uri` the same way, so GitHub itself was told to send the user there.
 *
 * `Host` is the origin the browser used, so it is the source of truth here.
 * `X-Forwarded-Proto` supplies only the SCHEME, for a TLS-terminating proxy.
 *
 * `X-Forwarded-Host` is deliberately NOT honoured. It is settable by anyone when a
 * deployment does not strip it, and every value this module returns becomes either a
 * redirect target or an OAuth `redirect_uri` — the two places where an attacker-chosen
 * origin is exactly an open redirect / a stolen authorization code. `Host` is validated by
 * the serving infrastructure in a way a forwarded header is not, so it is the safer of the
 * two even though both are request-supplied.
 */

/** The slice of `NextRequest`/`Request` this needs — keeps the module pure and testable. */
export interface OriginSource {
  headers: Pick<Headers, "get">;
  url: string;
}

/** Only these two are ever accepted from `X-Forwarded-Proto`. */
const ALLOWED_PROTOCOLS = new Set(["http", "https"]);

/**
 * The scheme to build with. A proxy may send a comma-separated list
 * (`https, http`) — the FIRST entry is the client-facing hop, which is the one we want.
 * Anything outside {http, https} is ignored rather than trusted, so a header like
 * `javascript:` can never reach a `Location`.
 */
function forwardedProtocol(headers: Pick<Headers, "get">): string | null {
  const raw = headers.get("x-forwarded-proto");
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_PROTOCOLS.has(first) ? first : null;
}

/**
 * The public origin (`scheme://host`, no trailing slash).
 *
 * Falls back to `request.url`'s own origin when there is no `Host` header. HTTP/1.1
 * requires one, so that path is for synthetic requests rather than real traffic — and
 * falling back preserves exactly today's behaviour instead of throwing at a redirect.
 */
export function appOrigin(request: OriginSource): string {
  const host = request.headers.get("host");
  const selfUrl = new URL(request.url);
  if (!host) return selfUrl.origin;

  const scheme =
    forwardedProtocol(request.headers) ?? selfUrl.protocol.replace(/:$/, "");
  return `${scheme}://${host}`;
}

/**
 * Resolve an app-relative path against {@link appOrigin}. The one call every route that
 * emits an absolute self-URL should use in place of `new URL(path, request.url)`.
 */
export function appUrl(path: string, request: OriginSource): URL {
  return new URL(path, appOrigin(request));
}
