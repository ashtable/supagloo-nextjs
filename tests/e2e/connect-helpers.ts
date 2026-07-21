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
 * Fake OpenRouter's browser↔OpenRouter token exchange (design-delta §5.1/§9-Q9).
 * The openrouter-stub is a bare REST server that can't render OpenRouter's hosted
 * authorize HTML page, and the exchange is a cross-origin browser call (the stub has
 * no CORS). Stagehand v3 is a CDP understudy (no Playwright `route`), so instead we
 * inject an init script that patches `window.fetch` in every page: any request to
 * `…/api/v1/auth/keys` resolves in-page to a deterministic `{ key }` (last-4 `cafe`,
 * asserted below) — no network, no CORS. Everything else passes through. Applies to
 * pages created AFTER this call, so the throwaway callback page (created per test) is
 * covered. The authorize popup itself is irrelevant — the throwaway page drives the
 * real completion — and with `NEXT_PUBLIC_OPENROUTER_BASE_URL` → the stub host it
 * never touches the public internet.
 */
export async function interceptOpenRouter(
  context: Stagehand["context"],
): Promise<void> {
  await context.addInitScript((key: string) => {
    const orig = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      if (url && url.endsWith("/api/v1/auth/keys")) {
        return Promise.resolve(
          new Response(JSON.stringify({ key, user_id: "usr_e2e" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return orig(input as RequestInfo, init);
    }) as typeof window.fetch;
  }, E2E_OPENROUTER_KEY);
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
