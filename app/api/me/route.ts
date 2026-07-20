import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/me` — proxy the current user from the API's `GET /v1/me`, forwarding
 * the httpOnly session cookie as the bearer token. Status + body pass through
 * verbatim (200 `{ user }`, or 401 when there is no valid session). This is the
 * server-driven onboarding gate's read: `user.onboardingCompletedAt`.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({ path: "me", method: "GET", token });
  return NextResponse.json(result.body, { status: result.status });
}
