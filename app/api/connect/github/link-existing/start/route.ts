import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import { GithubAuthorizeUrlResponseSchema } from "@/lib/api/contracts";
import { appUrl } from "@/lib/api/app-url";

/**
 * `GET /api/connect/github/link-existing/start` — the recovery path for a user who is
 * ALREADY installed.
 *
 * The install button cannot help them. GitHub redirects to the App's Setup URL only
 * when an installation is CREATED, so a reinstall, an install made from GitHub's own
 * directory, or one App registration shared between environments sends the user to the
 * installation's settings page and never to us. Nothing posts an `installationId`, the
 * main tab's poll never sees a connection, and the wizard sits on "Connecting…" until
 * it times out — with no way through the UI at all.
 *
 * So this asks GitHub who they are instead: 302 to the hosted user-authorization page,
 * which returns a `code` to `/api/connect/github/callback`. The server spends that code
 * on a short-lived user token, reads `GET /user/installations`, and resolves the
 * installation it should have been handed.
 *
 * The redirect target is deliberately the SAME callback route as the install flow, not
 * a new one. A GitHub App only honours redirect URIs registered on it, and every extra
 * path is another thing that must be added in two places before the flow works in an
 * environment — which is the failure mode this whole route exists to remove.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const redirectUri = appUrl("/api/connect/github/callback", request).toString();
  // `state` is required by the upstream schema and echoed back by GitHub. It is NOT yet
  // verified on return — binding it to the session is plan row 51, which covers the
  // install callback and this one together, and is deliberately not widened here.
  const state = request.nextUrl.searchParams.get("state") ?? "link-existing";

  const result = await forwardToApi({
    path:
      `connections/github/authorize-url?redirectUri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`,
    method: "GET",
    token,
  });

  const parsed = GithubAuthorizeUrlResponseSchema.safeParse(result.body);
  if (result.status === 200 && parsed.success) {
    return NextResponse.redirect(parsed.data.url, 302);
  }
  return NextResponse.redirect(appUrl("/?github=error", request), 302);
}
