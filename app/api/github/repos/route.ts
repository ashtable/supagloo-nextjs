import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/github/repos` — the live repo listing, proxied from the API's
 * `GET /v1/github/repos?filter=&q=` (the API mints a fresh installation token per
 * request; 409 if the user has no GitHub connection). The `SessionProvider` uses
 * `repositories.length` as the "N repos accessible" count on the connection card.
 * Any `filter`/`q` query is forwarded through. Status + body pass through verbatim.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const search = new URL(request.url).search; // preserves ?filter=&q=
  const result = await forwardToApi({
    path: `github/repos${search}`,
    method: "GET",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
