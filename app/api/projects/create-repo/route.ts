import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi, PROVISIONING_UPSTREAM_TIMEOUT_MS } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `POST /api/projects/create-repo` — the create-new-repo JIT hop (§2.3/§6b),
 * proxied from `POST /v1/projects/create-repo`. Called by the popup callback page
 * with `{ code, repoName, visibility, name, createdFrom }`: the API exchanges the
 * user-authorization `code` for a short-lived user token, creates the repo, adds it
 * to the installation, discards the token, and delegates to the scaffold create path
 * → `{ projectId, jobId }`. Status + body pass through verbatim.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const body = await request.json().catch(() => ({}));
  const result = await forwardToApi({
    path: "projects/create-repo",
    method: "POST",
    token,
    body,
    // The api blocks here for up to 60 s waiting for the installation to see the repo it
    // just created, so the default 30 s backstop would cut its own typed error off — and
    // would report a 504 for a create that is still on its way to succeeding. See
    // `PROVISIONING_UPSTREAM_TIMEOUT_MS`.
    timeoutMs: PROVISIONING_UPSTREAM_TIMEOUT_MS,
  });
  return NextResponse.json(result.body, { status: result.status });
}
