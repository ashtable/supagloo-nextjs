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

/** The deterministic fake OpenRouter key the intercepted token exchange returns —
 *  its last 4 chars (`cafe`) are what the profile card must render masked. */
export const E2E_OPENROUTER_KEY = "sk-or-v1-e2etest-cafe";
export const E2E_OPENROUTER_LAST4 = "cafe";

/**
 * Route-intercept the browser↔OpenRouter PKCE leg (design-delta §5.1/§9-Q9). The
 * openrouter-stub is a bare REST server — it can't render OpenRouter's hosted
 * authorize HTML page, and the token exchange is a cross-origin browser call — so
 * we fulfill both locally at the context (all pages, popups included):
 *  - `**​/auth?**` (the authorize popup) → a blank no-op; the throwaway callback
 *    page below drives the real completion, so the popup is irrelevant.
 *  - `**​/api/v1/auth/keys` (the token exchange) → a deterministic `{ key }`, with
 *    CORS + preflight headers so the browser's cross-origin fetch is allowed.
 */
/** The Playwright route surface we use — Stagehand's `context` IS a Playwright
 *  BrowserContext at runtime, but its `V3Context` TYPE doesn't surface `.route`, so
 *  we narrow through this minimal structural type. */
interface RoutableContext {
  route(
    url: string,
    handler: (route: {
      request(): { method(): string };
      fulfill(opts: {
        status: number;
        headers?: Record<string, string>;
        contentType?: string;
        body?: string;
      }): Promise<void>;
    }) => void | Promise<void>,
  ): Promise<void>;
}

export async function interceptOpenRouter(
  context: Stagehand["context"],
): Promise<void> {
  const ctx = context as unknown as RoutableContext;
  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  };

  await ctx.route("**/auth?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>authorize</title><body>ok</body>",
    });
  });

  await ctx.route("**/api/v1/auth/keys", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", ...CORS },
      body: JSON.stringify({ key: E2E_OPENROUTER_KEY, user_id: "usr_e2e" }),
    });
  });
}

/**
 * Simulate OpenRouter's redirect-back after the user approves (design-delta §6a).
 * Mirrors `completeGithubConnectViaCallback`: after the wizard/card has kicked off
 * the connect (`connect-openrouter-submit` → `pending` + the stashed verifier in
 * localStorage + the main-tab `GET /api/connections` poll), open a throwaway page
 * in the SAME context (shares localStorage + the httpOnly session cookie) and drive
 * it to the client callback page with a `code`. That page reads the stashed
 * verifier, exchanges the code → key (intercepted above), and POSTs ONLY the key to
 * the BFF — after which the main tab's poll flips openrouter to connected.
 */
export async function completeOpenRouterConnectViaCallback(
  context: Stagehand["context"],
  opts: { code?: string } = {},
): Promise<void> {
  const code = opts.code ?? "e2e-code";
  const cb = await context.newPage();
  try {
    await cb.goto(`${BASE_URL}/connect/openrouter/callback?code=${code}`, {
      waitUntil: "load",
    });
    // Wait for the callback page to finish the exchange + BFF POST before closing.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const status = await cb.evaluate(() => {
        const el = document.querySelector<HTMLElement>(
          '[data-testid="openrouter-callback-status"]',
        );
        return el?.getAttribute("data-state") ?? "";
      });
      if (status === "done" || status === "error") break;
      await cb.waitForTimeout(150);
    }
  } finally {
    await cb.close();
  }
}
