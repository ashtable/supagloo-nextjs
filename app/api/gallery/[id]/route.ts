import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/gallery/:id` — ONE published item, proxied from `GET /v1/gallery/:id`
 * → `{ item }`, for Turn 16a's watch page.
 *
 * THIS HANDLER WAS DELIBERATELY ABSENT until now, and the comment that stood here named
 * its own reversal condition: *"if a detail page is ever designed, re-adding a five-line
 * handler is trivial and honest."* Turn 16a designed it (`/gallery/:id`, the product's
 * one genuinely shareable public URL), so here is the five-line handler. The original
 * argument was never that the endpoint was wrong — it was that an unused proxy is still
 * an exposed one. It is now used.
 *
 * The session cookie IS forwarded, unlike the sibling `stream-url` route. Upstream is
 * `optionalAuth`: the response carries the viewer's own `viewerHasUpvoted`, so a signed-in
 * viewer must be identified for the upvote pill to render their own state — while an
 * anonymous visitor, or one holding a stale cookie the API degrades to anonymous, still
 * gets a 200 and a readable page. That is the whole reason a public page can also be a
 * personalised one without a second endpoint.
 *
 * Status + body pass through verbatim, so a 404 (unknown OR unlisted-to-a-stranger — the
 * API denies uniformly) reaches the client unchanged and becomes the not-found state.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: `gallery/${encodeURIComponent(id)}`,
    method: "GET",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}

/**
 * `DELETE /api/gallery/:id` — un-publish; owner-only upstream, `200 { ok: true }`.
 * Thin: status + body pass through verbatim, so a 404 (unknown OR foreign item — the
 * API denies uniformly) reaches the client unchanged.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: `gallery/${encodeURIComponent(id)}`,
    method: "DELETE",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
