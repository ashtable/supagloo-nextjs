import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import {
  githubCallbackRedirectTarget,
  githubCallbackRedirectPath,
} from "@/lib/connections/github-connect";

/**
 * `GET /api/connect/github/callback` — GitHub's redirect-back target after the
 * user installs the App (§6a). Reads `installation_id` (+ `setup_action`, which is
 * received but never gates the flow — any value proceeds to verify), POSTs
 * `{ installationId }` to the API's `POST /v1/connections/github/callback` (which
 * App-JWT-verifies the installation and stores the pointer), then redirects the
 * tab back into the app. The main tab's `GET /api/connections` poll observes the
 * stored connection and flips the wizard/card to connected.
 */
export async function GET(request: NextRequest) {
  const installationId = new URL(request.url).searchParams.get("installation_id");
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;

  let upstreamStatus: number | null = null;
  if (installationId) {
    const result = await forwardToApi({
      path: "connections/github/callback",
      method: "POST",
      token,
      body: { installationId },
    });
    upstreamStatus = result.status;
  }

  const target = githubCallbackRedirectTarget({ installationId, upstreamStatus });
  return NextResponse.redirect(
    new URL(githubCallbackRedirectPath(target), request.url),
    302,
  );
}
