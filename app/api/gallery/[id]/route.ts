import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `DELETE /api/gallery/:id` — un-publish; owner-only upstream, `200 { ok: true }`.
 * Thin: status + body pass through verbatim, so a 404 (unknown OR foreign item — the
 * API denies uniformly) reaches the client unchanged.
 *
 * THERE IS DELIBERATELY NO `GET` HERE. One shipped alongside `fetchGalleryItem` because
 * §5.2/§5.3 listed the endpoint — but the only thing that reads a SINGLE item is an item
 * DETAIL page, and that page was deliberately not built: the grid gets whole items from
 * the listing and playback goes through `stream-url`. Both halves were dead on arrival,
 * and five unit tests made the client half read as load-bearing. They are deleted rather
 * than commented out, because an unused proxy is still an exposed one; if a detail page
 * is ever designed, re-adding a five-line handler is trivial and honest.
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
