import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/connections` — the merged connection status, proxied from the API's
 * `GET /v1/connections` (all three provider tables, keyed by provider, each null
 * when not connected). Status + body pass through verbatim. The `SessionProvider`
 * polls this during the GitHub/OpenRouter connect flows and hydrates all three
 * provider statuses on bootstrap; the profile page reads it too.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({ path: "connections", method: "GET", token });
  return NextResponse.json(result.body, { status: result.status });
}
