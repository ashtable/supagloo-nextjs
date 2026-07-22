import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `POST /api/projects/:id/publish` — publish the working version, proxied from
 * `POST /v1/projects/:id/publish { message }` → `{ jobId }` (the publish ProjectJob
 * the studio polls via `GET .../jobs/:jobId`). This drives the 14a wizard's real
 * merge→tag→cut-next dance in place of the mocked PR ticker. Status + body pass
 * through verbatim (so 409 `github_not_connected` / `no_working_version` /
 * `git_ops_in_flight` reach the client unchanged).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const body = await request.json().catch(() => ({}));
  const result = await forwardToApi({
    path: `projects/${id}/publish`,
    method: "POST",
    token,
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
