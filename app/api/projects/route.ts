import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/projects` — the workspace grid, proxied from `GET /v1/projects`
 * (owner-scoped `{ projects }`). `POST /api/projects` — the use-existing-empty
 * scaffold create, proxied from `POST /v1/projects` (the repo already exists, so no
 * JIT hop) → `{ projectId, jobId }`. Status + body pass through verbatim.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({ path: "projects", method: "GET", token });
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const body = await request.json().catch(() => ({}));
  const result = await forwardToApi({
    path: "projects",
    method: "POST",
    token,
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
