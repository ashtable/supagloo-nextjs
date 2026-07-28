import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import {
  githubCallbackMode,
  githubCallbackRedirectTarget,
  githubCallbackRedirectPath,
} from "@/lib/connections/github-connect";
import { appUrl } from "@/lib/api/app-url";

/**
 * `GET /api/connect/github/callback` — GitHub's redirect-back target for BOTH ways a
 * connection can be established.
 *
 * `installation_id` (+ `setup_action`, received but never gating the flow — any value
 * proceeds to verify) is the §6a install path: POST it to
 * `POST /v1/connections/github/callback`, which App-JWT-verifies the installation and
 * stores the pointer.
 *
 * A bare `code` is the recovery path. GitHub redirects to the App's Setup URL only when
 * an installation is CREATED, so a user who installed previously — a reinstall, an
 * install from GitHub's directory, or one App registration shared across environments —
 * can never produce an `installation_id` here. `POST /v1/connections/github/link-existing`
 * spends the code on a short-lived user token and asks GitHub which installations that
 * user actually has.
 *
 * Either way the main tab's `GET /api/connections` poll observes the stored connection
 * and flips the wizard/card to connected.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const installationId = params.get("installation_id");
  const code = params.get("code");
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;

  const mode = githubCallbackMode({ installationId, code });

  let upstreamStatus: number | null = null;
  if (mode === "install") {
    const result = await forwardToApi({
      path: "connections/github/callback",
      method: "POST",
      token,
      body: { installationId },
    });
    upstreamStatus = result.status;
  } else if (mode === "link-existing") {
    const result = await forwardToApi({
      path: "connections/github/link-existing",
      method: "POST",
      token,
      body: { code },
    });
    upstreamStatus = result.status;
  }

  const target = githubCallbackRedirectTarget({
    installationId,
    code,
    upstreamStatus,
  });
  return NextResponse.redirect(
    appUrl(githubCallbackRedirectPath(target), request),
    302,
  );
}
