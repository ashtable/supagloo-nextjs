import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `PUT /api/connect/gloo` — save & verify Gloo credentials, proxied to the API's
 * idempotent `PUT /v1/connections/gloo { clientId, clientSecret }` (verify-then-
 * store: the API mints a LIVE client-credentials test token and writes nothing on
 * failure). A failed verify returns 400 `invalid_gloo_credentials`, which the form
 * surfaces as a real error. Body + status pass through verbatim (the secret never
 * comes back — only the plaintext `clientId` + timestamps).
 */
export async function PUT(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const body = (await request.json().catch(() => ({}))) as {
    clientId?: unknown;
    clientSecret?: unknown;
  };
  const result = await forwardToApi({
    path: "connections/gloo",
    method: "PUT",
    token,
    body: { clientId: body.clientId, clientSecret: body.clientSecret },
  });
  return NextResponse.json(result.body, { status: result.status });
}

/**
 * `DELETE /api/connect/gloo` — disconnect, proxied to the API's idempotent
 * `DELETE /v1/connections/gloo`. Used by the profile card's Disconnect.
 */
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: "connections/gloo",
    method: "DELETE",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
