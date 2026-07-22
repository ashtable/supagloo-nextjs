import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/projects/:id` — the single-project detail, proxied from
 * `GET /v1/projects/:id` (the owner-scoped `{ project }` envelope). The studio
 * resolver reads this after matching the URL slug in `GET /api/projects`. Status +
 * body pass through verbatim.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: `projects/${id}`,
    method: "GET",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
