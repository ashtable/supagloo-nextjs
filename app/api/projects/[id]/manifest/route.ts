import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/projects/:id/manifest?ref=` — the Zod-parsed `supagloo.project.json`
 * composition, proxied from `GET /v1/projects/:id/manifest?ref=` (the manifest is the
 * sole source of truth; the studio reducer hydrates from it). The `?ref=` query param
 * (the version branch/SHA) is forwarded when present; omitted → the API defaults it to
 * the project's `currentBranch`. Status + body pass through verbatim, so the distinct
 * error codes (404 `manifest_not_found`, 409 `github_not_connected`, 422
 * `manifest_invalid`) reach the client unchanged.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ref = request.nextUrl.searchParams.get("ref");
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const path = ref
    ? `projects/${id}/manifest?ref=${encodeURIComponent(ref)}`
    : `projects/${id}/manifest`;
  const result = await forwardToApi({ path, method: "GET", token });
  return NextResponse.json(result.body, { status: result.status });
}
