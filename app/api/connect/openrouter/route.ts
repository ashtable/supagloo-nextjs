import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `POST /api/connect/openrouter` — store the PKCE-obtained OpenRouter key, proxied
 * to the API's `POST /v1/connections/openrouter { key }` (encrypt at rest + derive
 * `keyLast4`). Per §5.1/§9-Q5 the browser did the PKCE exchange directly with
 * OpenRouter; ONLY the resulting key reaches the server here. Body + status pass
 * through verbatim.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const body = (await request.json().catch(() => ({}))) as { key?: unknown };
  const result = await forwardToApi({
    path: "connections/openrouter",
    method: "POST",
    token,
    body: { key: body.key },
  });
  return NextResponse.json(result.body, { status: result.status });
}

/**
 * `DELETE /api/connect/openrouter` — disconnect, proxied to the API's idempotent
 * `DELETE /v1/connections/openrouter`. Used by the profile card's Disconnect.
 */
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: "connections/openrouter",
    method: "DELETE",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
