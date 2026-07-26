import type { Stagehand } from "@browserbasehq/stagehand";

import type { StagehandPage } from "./helpers";
// The ONE authored name of the PKCE verifier's localStorage slot. Imported from the
// app rather than re-typed here so the "has the opener stashed the verifier yet?"
// barrier below can never silently drift from what the app actually writes (a drifted
// literal would make the barrier a no-op and re-introduce the race it exists to close).
import { VERIFIER_STORAGE_KEY } from "../../lib/connections/openrouter-connect";

const BASE_URL = "http://localhost:3000";

/**
 * Simulate GitHub's redirect-back after the user installs the App (design-delta
 * §6a).
 *
 * ── WHY THIS SHIM SURVIVES THE STUB → REAL-GITHUB SWAP (task-62) ─────────────
 * The designed happy path (wireframe 11/11b: "Authorize with GitHub · Opens
 * GitHub in a new tab") is *a human clicking Authorize on a GitHub-hosted consent
 * screen*. No headless spec can complete that — not against a stub, and not
 * against real github.com either. So this is one of the two sanctioned
 * interactive-hop shims: we fake ONLY the redirect-back, and everything after it
 * is real. After the wizard/card has kicked off the connect (`connect-authorize`
 * → `pending` + the main-tab `GET /api/connections` poll), we open a throwaway
 * page in the SAME browser context (which shares the httpOnly session cookie) and
 * navigate it directly to the callback URL, exactly as GitHub would.
 *
 * That callback route POSTs `{ installationId }` to the REAL API, which mints an
 * App JWT, verifies the installation against **real api.github.com**, reads the
 * real `account.login`, and stores the pointer. The main tab's poll then observes
 * the connection and flips github to connected — with the REAL login, not the mock
 * 350ms timer.
 *
 * ── `installationId` IS NOW REQUIRED (task-62 D5) ────────────────────────────
 * This parameter used to default to the literal `"42"`. That default WAS plan row
 * 62 item (d): the dbos worker was never pointed at the github-stub in the first
 * place, so it asked real GitHub for `POST /app/installations/42/access_tokens`
 * and got a permanent 404. Making it required means no spec can silently
 * fabricate an installation again; callers pass the runtime-DISCOVERED id from
 * `resolveInstallationId()` (`tests/e2e/github-e2e.ts`), which reads
 * `GET /app/installations` and fails fast with remediation text when the App is
 * not installed. Installation ids also change on every reinstall, so a hardcoded
 * one is wrong even when it works.
 */
export async function completeGithubConnectViaCallback(
  context: Stagehand["context"],
  opts: { installationId: string },
): Promise<void> {
  const { installationId } = opts;
  if (!installationId) {
    throw new Error(
      "completeGithubConnectViaCallback requires a real, runtime-discovered " +
        "installationId — pass `await resolveInstallationId()` from tests/e2e/github-e2e.ts. " +
        "A fabricated id makes every downstream installation-token mint a permanent 404.",
    );
  }
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

/**
 * ── THE CREDENTIAL IS REAL; ONLY THE INTERACTIVE HOP IS SHIMMED ──────────────
 *
 * This used to be a hardcoded FAKE key (`sk-or-v1-e2etest-cafe`), written when a
 * local openrouter-stub accepted anything. Task 34-E8 deleted that stub, so the fake
 * key became the reason every real-stack generation failed auth the moment the seam
 * was connected at all: the app stored it, the DBOS ai-generation worker sent it to
 * real OpenRouter, and OpenRouter 401'd. A "connected" provider whose key cannot
 * authenticate is worse than an unconnected one — it moves the failure a layer away
 * from its cause.
 *
 * So the key now comes from the environment, and there is deliberately NO fallback:
 * design-delta §10.8 — "a gating suite that silently skips its provider tests is a
 * green lie", and a fake-key fallback is the same lie wearing a connected badge.
 *
 * What stays shimmed is only OpenRouter's INTERACTIVE hop (§10.2, the same pattern
 * GitHub's callback shim uses): the hosted authorize consent screen needs a human,
 * and the code→key exchange is a cross-origin browser call. Everything downstream of
 * the exchange — the BFF store, the API, the worker's generations — carries this real
 * key to real OpenRouter.
 */
export const OPENROUTER_KEY_ENV_VAR = "OPENROUTER_E2E_TEST_API_KEY";

/**
 * The REAL OpenRouter key the intercepted token exchange hands back, from the root
 * repo's untracked `.env` (loaded into the worker by `tests/e2e/load-root-env.ts`,
 * task-62 D24 — the same seam the real-GitHub credentials arrive through).
 *
 * Throws, never falls back. Called lazily from `interceptOpenRouter` /
 * `openRouterKeyLast4` rather than at module scope on purpose: `connect-helpers.ts`
 * is imported by every real-stack spec, including the ZERO-EGRESS render lane, and a
 * module-scope throw would make an OpenRouter credential a hard requirement of specs
 * that never touch OpenRouter.
 */
export function requireOpenRouterE2eKey(): string {
  const key = process.env[OPENROUTER_KEY_ENV_VAR]?.trim();
  if (!key) {
    throw new Error(
      `[connect-helpers] ${OPENROUTER_KEY_ENV_VAR} is unset or empty, so this spec ` +
        `cannot connect OpenRouter with a credential that actually works.\n` +
        `  Set it in the ROOT supagloo checkout's untracked \`.env\` (the single ` +
        `credential source for every lane in every repo); ` +
        `\`tests/e2e/load-root-env.ts\` loads that file into each Vitest worker for ` +
        `the real + render lanes.\n` +
        `  There is deliberately no fake-key fallback: a stored key that real ` +
        `OpenRouter 401s makes every downstream generation fail with an auth error ` +
        `far from its cause (design-delta §10.8).`,
    );
  }
  return key;
}

/** The last 4 chars of the REAL key — what the profile card must render masked as
 *  `sk-or-••••••<last4>`. Derived, never a literal: the literal `cafe` it replaced was
 *  a property of the fake key and silently became false the moment the key went real. */
export function openRouterKeyLast4(): string {
  return requireOpenRouterE2eKey().slice(-4);
}

/**
 * Shim OpenRouter's browser↔OpenRouter PKCE token exchange (design-delta §5.1/§9-Q9,
 * §10.2). The hosted authorize page is a human-only consent screen and the exchange
 * is a cross-origin browser call, so no headless spec can complete it — against a
 * stub or against real openrouter.ai. Stagehand v3 is a CDP understudy (no Playwright
 * `route`), so we inject an init script that patches `window.fetch` in every page:
 * any request to `…/api/v1/auth/keys` resolves in-page to `{ key }` — no network, no
 * CORS. Everything else passes through, including every later call made WITH that key.
 *
 * The key is the REAL `OPENROUTER_E2E_TEST_API_KEY` (see above), so what this shim
 * removes is the consent click and nothing else. Applies to pages created AFTER this
 * call, so the throwaway callback page (created per connect) is covered.
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
  }, requireOpenRouterE2eKey());
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
 *
 * Pass `opener` (the page the connect was clicked on) to wait for the verifier to
 * actually be stashed first. `connectProvider("openrouter")` generates + stores the
 * verifier ASYNCHRONOUSLY after the click (it awaits a WebCrypto SHA-256), while the
 * callback page fails closed on a missing verifier — so without the barrier this is a
 * race that presents as an inexplicable `data-state="error"`.
 */
export async function completeOpenRouterConnectViaCallback(
  context: Stagehand["context"],
  opts: { code?: string; opener?: StagehandPage } = {},
): Promise<void> {
  const code = opts.code ?? "e2e-code";
  if (opts.opener) await waitForStashedVerifier(opts.opener);
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

/** Poll the opener until `connectProvider("openrouter")` has stashed the PKCE
 *  verifier the callback page needs. Throws (never warns-and-continues) so a broken
 *  connect surfaces here rather than as a downstream `not connected` mystery. */
async function waitForStashedVerifier(
  opener: StagehandPage,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const stashed = await opener.evaluate((storageKey: string) => {
      try {
        return window.localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    }, VERIFIER_STORAGE_KEY);
    if (stashed) return;
    await opener.waitForTimeout(100);
  }
  throw new Error(
    `[connect-helpers] no PKCE verifier appeared under localStorage["${VERIFIER_STORAGE_KEY}"] ` +
      `within ${timeoutMs}ms of clicking connect-openrouter-submit. The connect never ` +
      `started (is this the real/seed session path rather than \`?mock=\`?), so driving ` +
      `the callback page would fail closed with data-state="error".`,
  );
}

// ── the OpenRouter connect PRECONDITION for generation specs ─────────────────

/**
 * Connect OpenRouter for the CURRENT seeded user, through the shipping profile-page
 * affordance (wireframe 10b card → 11c modal), and wait until the card reports
 * connected.
 *
 * ── WHY EVERY GENERATION SPEC NEEDS THIS ─────────────────────────────────────
 * The `?seed=` seam mints a User + a session cookie and, BY DESIGN, no provider
 * connections at all. So a spec that only calls `completeGithubConnectViaCallback`
 * has a user with no OpenRouter connection, and the first generation it triggers dies
 * in the API/worker with `OpenRouterNotConnectedError` ("no OpenRouter connection for
 * user <id>") — which surfaces in the browser only as a `script-input` that never
 * arrives, i.e. a 240 s timeout with no attribution. Add this to any real-stack spec
 * that performs a generation; do NOT add it to specs that do not (notably
 * `studio-render-real.e2e.ts`, whose zero-egress blank manifest is load-bearing for
 * plan row 62's spend-free acceptance).
 *
 * Drives the REAL product path rather than POSTing the key at the BFF directly: the
 * only thing faked anywhere in here is OpenRouter's own consent screen + cross-origin
 * token exchange (`interceptOpenRouter`), and the key it yields is the real one.
 *
 * Expects `page` to be sitting on `workspace-home` (i.e. straight after the spec's
 * `gotoWorkspace`, so the session cookie exists) and leaves it on `/profile` — callers
 * navigate on from there, which every current caller does anyway via
 * `createProjectViaExistingEmptyRepo`. Navigation to /profile goes through the profile
 * pill (a client-side `router.push`) rather than a deep link, to keep the resolved
 * server session and dodge the redirect race a cold `/profile` load has (ProfilePage
 * redirects to `/` while `session.isAuthed` is still false, and `serverUser` resolves
 * asynchronously after `mounted` flips).
 *
 * ── WHY IT RELOADS `/` WITHOUT `?seed=` FIRST ────────────────────────────────
 * `?seed=authed-returning` maps to the MOCK `wireframe` connections seed
 * (`lib/session/session-model.ts` → `seedWireframe()`), which starts the client with
 * openrouter ALREADY `connected` and a fabricated `sk-or-••••••4f2a` / `$18.40`
 * detail. The server hydration that follows deliberately only ever UPGRADES a
 * provider ("Never sets not-linked", session-provider.tsx), so on a real-stack run
 * with no stored connection the card sits at `data-status="connected"` while the
 * database has no `OpenRouterConnection` row at all.
 *
 * That made the first version of this helper a silent no-op: its idempotency check
 * read the card, saw "connected", and returned — every generation then died in the
 * worker with `OpenRouterNotConnectedError`, which is the exact failure this helper
 * exists to prevent. It also means the card renders Disconnect, so
 * `card-connect-openrouter` is not even on the page.
 *
 * Re-loading `/` with NO query string remounts `SessionProvider` with
 * `connectionsSeed = "none-linked"` (nothing in `search` to parse) while the httpOnly
 * session cookie — already minted by the caller's `?seed=` navigation — keeps the same
 * server user. The card then shows the provider's REAL state, hydrated from
 * `GET /api/connections`, and the connect affordance is reachable.
 *
 * ── AND WHY THE GATES ARE SERVER TRUTH, NOT THE CARD ─────────────────────────
 * Both the "already connected?" check and the final "did it work?" assertion read
 * `GET /api/connections` from the page (same origin, same session cookie) rather than
 * the card's `data-status`. The card is client state that a mock seed can pre-colour;
 * the stored connection is what the API and the DBOS worker actually read. Asserting
 * on anything weaker is how this helper passed while connecting nothing.
 */
export async function connectOpenRouterViaProfile(
  context: Stagehand["context"],
  page: StagehandPage,
): Promise<void> {
  // Must precede the throwaway callback page's creation — init scripts only apply to
  // pages created afterwards. Idempotent enough to re-apply if a spec also called it.
  await interceptOpenRouter(context);

  const count = (id: string) => page.locator(`[data-testid="${id}"]`).count();
  const click = (id: string) => page.locator(`[data-testid="${id}"]`).click();
  const waitFor = async (id: string, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await count(id)) > 0) return;
      await page.waitForTimeout(200);
    }
    throw new Error(
      `[connect-helpers] connectOpenRouterViaProfile: [data-testid="${id}"] never ` +
        `appeared within ${timeoutMs}ms`,
    );
  };

  // SERVER truth: is there actually a stored OpenRouter connection for this session?
  // Mirrors `openrouterSnapshotFromConnections` — connected iff a non-empty keyLast4.
  const serverConnectedLast4 = () =>
    page.evaluate(async () => {
      try {
        const res = await fetch("/api/connections", { cache: "no-store" });
        if (!res.ok) return null;
        const body = (await res.json()) as { openrouter?: { keyLast4?: unknown } };
        const last4 = body?.openrouter?.keyLast4;
        return typeof last4 === "string" && last4.length > 0 ? last4 : null;
      } catch {
        return null;
      }
    });

  // Drop the `?seed=` query so the connections state is none-linked + server-hydrated
  // rather than the mock `wireframe` seed (see the header). The cookie is already set,
  // so this is the SAME user.
  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await waitFor("workspace-home");

  if (await serverConnectedLast4()) return; // genuinely already connected

  // workspace-home → profile pill → Account settings → /profile
  await waitFor("workspace-profile-pill");
  await click("workspace-profile-pill");
  await waitFor("menu-account-settings");
  await click("menu-account-settings");
  await waitFor("profile-page");
  await waitFor("connection-card-openrouter");

  await waitFor("card-connect-openrouter");
  await click("card-connect-openrouter");
  await waitFor("connect-openrouter-modal");

  // `connectProvider("openrouter")` does `window.open(authorizeUrl, "_blank")`, so
  // submitting spawns a real openrouter.ai consent tab. Snapshot the tabs first so
  // that popup can be closed again below.
  const tabsBefore = new Set(context.pages());
  await click("connect-openrouter-submit");

  await completeOpenRouterConnectViaCallback(context, { opener: page });

  // ── CLOSE THE ORPHANED AUTHORIZE POPUP (this is load-bearing) ───────────────
  // The consent tab is opened last, so it becomes the FOREGROUND tab and leaves the
  // app's tab backgrounded. Chrome throttles background tabs hard, and a backgrounded
  // Next dev tab then never finishes hydrating: the very next `page.goto(SEED_URL)`
  // renders an EMPTY body forever, and the caller's `createProjectViaExistingEmptyRepo`
  // dies on "workspace-home never rendered" — a failure that looks like a dead API and
  // has nothing to do with the API. Nothing ever reads this tab (the throwaway callback
  // page drives the completion), so close it and re-foreground the app.
  for (const p of context.pages()) {
    if (p === page || tabsBefore.has(p)) continue;
    try {
      await p.close();
    } catch {
      /* already gone — fine */
    }
  }
  try {
    await (page as unknown as { sendCDP: (m: string) => Promise<unknown> }).sendCDP(
      "Page.bringToFront",
    );
  } catch {
    /* best-effort focus restore */
  }

  // The STORED connection is the source of truth — the DBOS worker reads that row,
  // not the card.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await serverConnectedLast4()) return;
    await page.waitForTimeout(300);
  }
  throw new Error(
    `[connect-helpers] GET /api/connections still reports no stored OpenRouter ` +
      `connection 60s after the callback completed. The callback page's exchange + ` +
      `POST /api/connect/openrouter did not produce a stored connection — check that ` +
      `${OPENROUTER_KEY_ENV_VAR} is the real key and that the API is reachable.`,
  );
}

/*
 * ── DELETED: `completeCreateRepoViaCallback` (task-62 D13, tier 2) ───────────
 *
 * It drove `/connect/github/create-repo/callback?code=e2e-create-repo-code&state=…`
 * to fake GitHub's redirect-back for the create-new-repo JIT user-authorization
 * hop. The retired github-stub accepted ANY non-empty `code`; real GitHub answers
 * `bad_verification_code`, so that literal can never work again and the helper was
 * dead weight that only looked like coverage.
 *
 * It is deleted rather than repaired because there is no seam to repair it AT.
 * The exchange happens inside the CONTAINERISED api, which exposes no injectable
 * `fetchImpl`, and the only container-level seam — `GITHUB_OAUTH_BASE_URL` —
 * is simultaneously the BROWSER's authorize-redirect target, so overriding it
 * reproduces exactly the `DNS_PROBE_FINISHED_NXDOMAIN` failure that plan row 62
 * item (e) was about. This is a REPORTED DEVIATION, not a silent drop.
 *
 * What still covers the create-new-repo path:
 *   • its SERVER half — the api repo's `tests/e2e/repo-provisioning.e2e.ts`, which
 *     builds the client in-process and shims ONLY `POST /login/oauth/access_token`
 *     at the `fetchImpl` seam; `POST /user/repos` and the whole scaffold chain hit
 *     real github.com;
 *   • its CLIENT half — the mock lane's `project-wizards.e2e.ts`;
 *   • its effect/mapping logic — the nextjs unit suite.
 * Restoring BROWSER-level coverage needs an api-side public/internal OAuth
 * base-URL split plus a double-gated test-only exchange route: its own plan row.
 *
 * Every spec that used it now acquires its project through
 * `createProjectViaExistingEmptyRepo` (`tests/e2e/github-e2e.ts`) — the wizard's
 * already-shipping "use existing empty repo" tab (wireframe 13a), which has no
 * consent hop at all.
 */
