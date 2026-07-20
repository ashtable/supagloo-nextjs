import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `PATCH /api/me/onboarding` — mark onboarding complete via the API's
 * `PATCH /v1/me/onboarding` (which sets `onboardingCompletedAt = now`
 * server-side). No request body is forwarded — the API derives everything from
 * the bearer session. Status + body (200 `{ user }`) pass through verbatim.
 */
export async function PATCH(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({ path: "me/onboarding", method: "PATCH", token });
  return NextResponse.json(result.body, { status: result.status });
}
