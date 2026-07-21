import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import { RepoAuthorizeUrlResponseSchema } from "@/lib/api/contracts";

/**
 * `GET /api/connect/github/create-repo/start` — step 1 of the create-new-repo JIT hop
 * (§2.3/§6b). Opened in a popup by the New-project wizard (with its `?state` nonce).
 * Computes the redirect target (this origin's client callback page), forwards to the
 * API's `GET /v1/projects/repo-authorize-url`, and 302-redirects the popup to the
 * hosted GitHub user-authorization URL, where the user grants repo-creation access.
 * GitHub then redirects back to `/connect/github/create-repo/callback`.
 *
 * No session / an upstream error → send the user back into the app with an error
 * signal instead of a dead tab.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const redirectUri = new URL(
    "/connect/github/create-repo/callback",
    request.url,
  ).toString();
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;

  const result = await forwardToApi({
    path: `projects/repo-authorize-url?redirectUri=${encodeURIComponent(
      redirectUri,
    )}&state=${encodeURIComponent(state)}`,
    method: "GET",
    token,
  });

  const parsed = RepoAuthorizeUrlResponseSchema.safeParse(result.body);
  if (result.status === 200 && parsed.success) {
    return NextResponse.redirect(parsed.data.url, 302);
  }
  return NextResponse.redirect(new URL("/?newproject=error", request.url), 302);
}
