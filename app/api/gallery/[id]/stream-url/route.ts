import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";

/**
 * `GET /api/gallery/:id/stream-url` — a short-lived (120s) presigned GET for a
 * published item's mp4, proxied from `GET /v1/gallery/:id/stream-url` →
 * `{ url, expiresAt }`.
 *
 * NO session cookie is read, deliberately: the upstream route takes no auth at all —
 * the published ITEM is the authorization, and nothing is read from the request beyond
 * `:id`. Forwarding a bearer here would imply an ownership check that does not exist.
 *
 * The returned URL points at the PUBLIC S3 endpoint, so the browser fetches the object
 * directly; this proxy never streams bytes.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await forwardToApi({
    path: `gallery/${encodeURIComponent(id)}/stream-url`,
    method: "GET",
  });
  return NextResponse.json(result.body, { status: result.status });
}
