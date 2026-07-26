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
 * The three parameters are forwarded by NAME, not by copying the whole querystring —
 * and the reason is the OPPOSITE of the obvious one. `GalleryListQuerySchema` (db-lib)
 * is a plain `z.object({ sort, q, cursor })` with no `.strict()`, bound as the route's
 * `querystring`, so Zod STRIPS unknown keys: the API IGNORES an unrecognised parameter
 * and answers 200. Its own e2e pins that (`?q=…&book=GEN` returns every item).
 *
 * So nothing upstream would stop this route from becoming a general-purpose passthrough
 * — the allowlist is the only thing that does. It is also what makes a REMOVED parameter
 * visibly gone: `book` is not forwarded, so a stale link carrying `?book=GEN` cannot
 * read as "accepted but unfiltered". There is no book filter (plan §5.2), and adding a
 * name here is the deliberate act that would create one.
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
