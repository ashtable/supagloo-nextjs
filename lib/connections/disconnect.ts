/**
 * The REAL provider-disconnect effect layer (Task #25 revision). All three
 * providers share one shape: a `DELETE` to the BFF that tells the API to drop the
 * stored credential. The subtlety the original fire-and-forget version got wrong:
 * the UI must NOT report "disconnected" unless the DELETE actually succeeded —
 * otherwise a non-2xx leaves the server still holding the live credential (an
 * OpenRouter key or Gloo client secret) while the card falsely shows it cleared.
 * This matters most for openrouter/gloo (a user often disconnects precisely
 * because they believe a credential is compromised), but we keep all three
 * consistent.
 *
 * Pure + injectable (`fetch` is a param) → zero-network unit tests, no React. The
 * `SessionProvider` awaits `requestDisconnect` and only flips the reducer to
 * not-linked on `ok`; on failure it keeps the provider connected and surfaces
 * `disconnectErrorMessage` so the user knows the disconnect didn't take and can
 * retry.
 */

import type { Provider } from "./connections-model";

/** Each provider's BFF disconnect route (the single source of truth for the map). */
export const DISCONNECT_PATHS: Record<Provider, string> = {
  github: "/api/connect/github",
  openrouter: "/api/connect/openrouter",
  gloo: "/api/connect/gloo",
};

export interface DisconnectResult {
  /** True only when the server actually cleared the credential (a 2xx). A non-2xx
   *  or a network error is `false` — the credential is still live server-side. */
  ok: boolean;
}

/**
 * `DELETE /api/connect/<provider>` (idempotent). Awaits the response and reports
 * whether it succeeded. Never throws — a thrown/network error is treated exactly
 * like a non-2xx (a failed disconnect), so the caller keeps the provider connected.
 */
export async function requestDisconnect(
  provider: Provider,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<DisconnectResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(DISCONNECT_PATHS[provider], { method: "DELETE" });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

const PROVIDER_LABELS: Record<Provider, string> = {
  github: "GitHub",
  openrouter: "OpenRouter",
  gloo: "Gloo",
};

/**
 * The user-facing message for a failed disconnect. It must make clear the account
 * is STILL connected (the credential is still live) so the user retries rather than
 * assuming it was cleared.
 */
export function disconnectErrorMessage(provider: Provider): string {
  return `Couldn't disconnect ${PROVIDER_LABELS[provider]} — it's still connected. Please try again.`;
}
