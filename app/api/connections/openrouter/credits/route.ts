import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/connections/openrouter/credits` — the LIVE OpenRouter balance, proxied
 * from the API's `GET /v1/connections/openrouter/credits` (§2.4: never stored —
 * fetched fresh on every profile view; the API proxies OpenRouter with the
 * decrypted key and reshapes to `{ totalCredits, totalUsage, remaining }`). 409
 * `openrouter_not_connected` when there is no connection. Status + body pass
 * through verbatim.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: "connections/openrouter/credits",
    method: "GET",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
