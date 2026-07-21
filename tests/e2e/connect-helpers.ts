import type { Stagehand } from "@browserbasehq/stagehand";

const BASE_URL = "http://localhost:3000";

/**
 * Simulate GitHub's redirect-back after the user installs the App (design-delta
 * §6a). The real flow can't run headlessly — the github-stub exposes only REST
 * endpoints, no HTML install-picker page — so, after the wizard/card has kicked
 * off the connect (`connect-authorize` → `pending` + the main-tab
 * `GET /api/connections` poll), we open a throwaway page in the SAME browser
 * context (which shares the httpOnly session cookie) and navigate it directly to
 * the callback URL, exactly as GitHub would.
 *
 * That callback route POSTs `{ installationId }` to the REAL API, which App-JWT-
 * verifies the installation against the stub (`account.login → "acme"`) and stores
 * the pointer. The main tab's poll then observes the connection and flips github to
 * connected — with the REAL login, not the mock 350ms timer.
 */
export async function completeGithubConnectViaCallback(
  context: Stagehand["context"],
  opts: { installationId?: string } = {},
): Promise<void> {
  const installationId = opts.installationId ?? "42";
  const cb = await context.newPage();
  try {
    await cb.goto(
      `${BASE_URL}/api/connect/github/callback?installation_id=${installationId}&setup_action=install`,
      { waitUntil: "load" },
    );
  } finally {
    await cb.close();
  }
}
