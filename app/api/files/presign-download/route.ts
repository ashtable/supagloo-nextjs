import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/files/presign-download?key=` — presign an S3 object for the scene
 * preview, proxied from `GET /v1/files/presign-download?key=` → `{ url, expiresAt }`.
 * The API ownership-scopes the key (a foreign/unknown key → 404). Status + body pass
 * through verbatim.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "key_required" }, { status: 400 });
  }
  const result = await forwardToApi({
    path: `files/presign-download?key=${encodeURIComponent(key)}`,
    method: "GET",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
