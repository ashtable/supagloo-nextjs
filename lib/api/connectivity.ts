import { forwardToApi } from "./proxy";
import type { ProviderConnectivity } from "./ai-matrix";

/**
 * "Which model providers has this user connected?", for the ONE BFF path that has no
 * catalogue in hand.
 *
 * `GET /api/ai/models` already knows: the api's catalogue response carries `providers`, so
 * that route passes `body.providers` straight into the resolver and makes no extra call.
 * `POST /api/ai/generations` does not — it resolves `{provider, model}` before anything has
 * read a catalogue, and it is the ONLY path that ever resolves `storyboard` and `script`
 * (neither is a selectable kind, so neither appears in the published `defaults`). Without
 * this read, R8's storyboard flip and R4's image repair would be unreachable on the very
 * request that spends the money.
 *
 * ## The cost, measured
 *
 * `GET /v1/connections` is three `findUnique`s and NO provider egress — it maps rows to
 * DTOs and nothing else. It is only called on the FALLBACK path: when the client sends both
 * `{provider, model}` (which the Inspector always does once the catalogue has landed) the
 * override wins and this is never reached.
 *
 * ## Any failure is `null`, never `{gloo:false, openrouter:false}`
 *
 * A failed read is not an answer about the user's data. `null` makes the resolver behave
 * exactly as it did before connections existed — keep the preferred provider, repair
 * nothing — instead of "repairing" a fully-connected user onto whatever the first entry in
 * the matrix happens to be because the api blipped.
 */
export async function readProviderConnectivity(
  token: string | null,
): Promise<ProviderConnectivity | null> {
  if (!token) return null;
  try {
    const result = await forwardToApi({
      path: "connections",
      method: "GET",
      token,
    });
    if (result.status < 200 || result.status >= 300) return null;
    const body = result.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return null;
    // ROW PRESENCE is the connection, exactly as the api's own DTO mapping and
    // `ConnectionsService.isConnected` define it — `status` is written as the literal
    // "connected" and never read back.
    return {
      gloo: body.gloo != null,
      openrouter: body.openrouter != null,
    };
  } catch {
    return null;
  }
}
