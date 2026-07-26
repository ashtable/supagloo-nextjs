import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/gallery/:id` — one public item (`optionalAuth` upstream: anonymous OK, the
 * viewer's vote state resolved when a session is present).
 * `DELETE /api/gallery/:id` — un-publish; owner-only upstream, `200 { ok: true }`.
 *
 * Both are thin: status + body pass through verbatim, so a 404 (unknown OR foreign
 * item — the API denies uniformly) reaches the client unchanged.
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
