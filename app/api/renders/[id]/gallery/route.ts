import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `POST /api/renders/:id/gallery` — publish a completed render to the gallery, proxied
 * from the owner-scoped upstream route → `201 { item }`.
 *
 * The body carries only what the SERVER cannot know: title, description, scripture
 * reference, translation, visibility. `scriptureBook`, `durationSeconds` and both asset
 * keys are derived upstream — a client that could send a duration could make the
 * `mm:ss` badge lie about its own video.
 *
 * Status + body pass through verbatim, so the three distinct refusals stay
 * distinguishable: 409 `render_not_publishable`, 409 `already_published`, 422
 * `scripture_book_underivable`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const body = await request.json().catch(() => ({}));
  const result = await forwardToApi({
    path: `renders/${encodeURIComponent(id)}/gallery`,
    method: "POST",
    token,
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
