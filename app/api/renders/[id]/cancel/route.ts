import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `POST /api/renders/:id/cancel` — abort a running render, proxied from
 * `POST /v1/renders/:id/cancel` → `{ render }` at its post-cancel state. The API cancels
 * the DBOS workflow first and then conditionally flips the row, so a render that
 * finished in the window comes back `completed` rather than a false `canceled`. Status +
 * body pass through verbatim (409 `render_not_cancelable` reaches the client unchanged).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: `renders/${id}/cancel`,
    method: "POST",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
