import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/renders/:id` — render polling, proxied from `GET /v1/renders/:id` (the
 * `{ render }` envelope with status + framesDone/framesTotal + the echoed output spec).
 * This is the 14c overlay's DATA SOURCE, replacing the fake frame ticker. Status + body
 * pass through verbatim.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: `renders/${id}`,
    method: "GET",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
