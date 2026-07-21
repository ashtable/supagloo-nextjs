import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `DELETE /api/connect/github` — disconnect, proxied to the API's idempotent
 * `DELETE /v1/connections/github` (deletes the stored installation pointer). Used
 * by the profile card's Disconnect action. Status + body (`{ ok: true }`) pass
 * through verbatim.
 */
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: "connections/github",
    method: "DELETE",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
