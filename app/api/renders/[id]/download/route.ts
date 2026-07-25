import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/renders/:id/download` — a presigned GET for the finished mp4, proxied from
 * `GET /v1/renders/:id/download` → `{ url, expiresAt }`. The API is the only S3 signer
 * (design-delta §8) and scopes the key to the render's owner; a render whose output is
 * not ready yet comes back 404. Status + body pass through verbatim.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: `renders/${id}/download`,
    method: "GET",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
