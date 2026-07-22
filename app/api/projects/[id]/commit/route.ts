import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `POST /api/projects/:id/commit` — persist the edited manifest, proxied from
 * `POST /v1/projects/:id/commit { manifest, message }` → `{ jobId }` (the commit
 * ProjectJob the studio polls via `GET .../jobs/:jobId`). This replaces the studio's
 * mocked `setTimeout` commit. Status + body pass through verbatim (so 409
 * `git_ops_in_flight` / 422 `manifest_invalid` reach the client unchanged).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const body = await request.json().catch(() => ({}));
  const result = await forwardToApi({
    path: `projects/${id}/commit`,
    method: "POST",
    token,
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
