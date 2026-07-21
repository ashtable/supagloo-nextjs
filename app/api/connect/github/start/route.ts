import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import { GithubInstallUrlResponseSchema } from "@/lib/api/contracts";

/**
 * `GET /api/connect/github/start` — step 1 of the §6a GitHub App connect flow.
 * Opened in a new tab by the wizard. Forwards the session cookie to the API's
 * `GET /v1/connections/github/install-url` and 302-redirects the tab to the hosted
 * App install-picker URL, where the user chooses which repos to grant. GitHub then
 * redirects back to `/api/connect/github/callback`.
 *
 * No session / an upstream error → send the user back into the app with an error
 * signal instead of a dead tab.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: "connections/github/install-url",
    method: "GET",
    token,
  });

  const parsed = GithubInstallUrlResponseSchema.safeParse(result.body);
  if (result.status === 200 && parsed.success) {
    return NextResponse.redirect(parsed.data.url, 302);
  }
  return NextResponse.redirect(new URL("/?github=error", request.url), 302);
}
