import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/projects/:id/versions` — the project's version history, proxied from
 * `GET /v1/projects/:id/versions` (the owner-scoped `{ versions }` envelope, ordered
 * by real semver descending). The 14b version dropdown derives its rows from this
 * (working / LIVE ON MAIN / archived / template). Status + body pass through verbatim.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: `projects/${id}/versions`,
    method: "GET",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
