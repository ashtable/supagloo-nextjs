import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `POST /api/projects/:id/renders` — start a render, proxied from
 * `POST /v1/projects/:id/renders { versionId, outputSpec, runInBackground }` →
 * `{ renderJobId }` (the render job the studio polls to drive the 14c overlay).
 *
 * Unlike `POST /api/ai/generations` this injects NOTHING server-side: the studio owns
 * both the version being rendered and the output spec, and no model id is involved.
 * Status + body pass through verbatim (so a 404 unknown project/version and a 400
 * malformed spec reach the client unchanged).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const body = await request.json().catch(() => ({}));
  const result = await forwardToApi({
    path: `projects/${id}/renders`,
    method: "POST",
    token,
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
