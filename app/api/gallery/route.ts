import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/gallery?sort=&q=&cursor=` — the PUBLIC listing, proxied from
 * `GET /v1/gallery` → `{ items, nextCursor }`.
 *
 * This is the app's first ANONYMOUS-CAPABLE proxy, and it needs no special case to be
 * one: `forwardToApi` already omits the `Authorization` header when the token is
 * falsy, and the API's `optionalAuth` resolves a session if one is present and
 * degrades to anonymous otherwise — including for a present-but-stale cookie, which
 * must never turn a public gallery into an error page.
 *
 * The three parameters are forwarded by NAME, not by copying the whole querystring:
 * the API's query schema is closed, an unknown parameter is a 400, and an allowlist
 * keeps this route from silently becoming a general-purpose passthrough. There is no
 * `book` — the book filter does not exist (plan §5.2).
 *
 * Status + body pass through verbatim, so `invalid_cursor` / `invalid_query` reach the
 * client unchanged.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const search = request.nextUrl.searchParams;

  const parts: string[] = [];
  for (const key of ["sort", "q", "cursor"] as const) {
    const value = search.get(key);
    if (value !== null && value !== "") {
      parts.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  const query = parts.length > 0 ? `?${parts.join("&")}` : "";

  const result = await forwardToApi({
    path: `gallery${query}`,
    method: "GET",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
