import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/renders?mine=1` — "Your videos", proxied from `GET /v1/renders?mine=1` →
 * `{ renders }`, newest first.
 *
 * `mine=1` is sent as a LITERAL rather than forwarded from the request. Upstream it is
 * a REQUIRED parameter and a bare `GET /v1/renders` is a 400 precisely so no URL in
 * this system ever reads like "all renders"; hard-coding it here means this proxy
 * cannot be talked into asking a different question.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: "renders?mine=1",
    method: "GET",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
