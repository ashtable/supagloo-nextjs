import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/projects/:id/jobs/:jobId` — job polling, proxied from
 * `GET /v1/projects/:id/jobs/:jobId` (the `{ job }` envelope with the stage log the
 * provisioning UI renders). This is the provisioning-log DATA SOURCE that replaces
 * the fake ticker. Status + body pass through verbatim.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  const { id, jobId } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: `projects/${id}/jobs/${jobId}`,
    method: "GET",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
