/**
 * The REAL Gloo "save & verify" flow's browser-side effect layer + form validation
 * (Task #25, design-delta §2.5/§6a). Unlike OpenRouter, Gloo is a direct form PUT
 * with NO external redirect: `PUT /api/connect/gloo` → the API mints a LIVE
 * client-credentials test token and stores the pair only if it succeeds. A failed
 * mint comes back as a 400 that MUST surface as a real form error (§6a), not a
 * local-only validation message.
 *
 * Pure + injectable (`fetch` is a param) → zero-network unit tests, no React. The
 * form owns the inputs + local pre-submit validation; the `SessionProvider` owns
 * the async save and threads the server error back into the form.
 */

const CONNECTIONS_URL = "/api/connections";
const CONNECT_URL = "/api/connect/gloo";

export interface GlooCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Local, pre-submit validation: both fields must be non-empty. Returns a message
 * to show inline, or null when the form may be submitted. This is DISTINCT from the
 * server's live verify — passing here does NOT mean the credentials are valid, only
 * that they are worth sending.
 */
export function validateGlooCredentials(creds: GlooCredentials): string | null {
  if (!creds.clientId.trim()) return "Enter your Gloo client ID.";
  if (!creds.clientSecret.trim()) return "Enter your Gloo client secret.";
  return null;
}

export interface GlooSnapshot {
  connected: boolean;
  /** The stored plaintext clientId (the only credential fragment on the wire), or
   *  null when not connected. */
  clientId: string | null;
}

const NOT_CONNECTED: GlooSnapshot = { connected: false, clientId: null };

/** Map the merged `GET /api/connections` body → gloo connected + clientId. */
export function glooSnapshotFromConnections(body: unknown): GlooSnapshot {
  const gloo = (body as { gloo?: unknown } | null | undefined)?.gloo as
    | { clientId?: unknown }
    | null
    | undefined;
  const clientId = gloo?.clientId;
  if (typeof clientId === "string" && clientId.length > 0) {
    return { connected: true, clientId };
  }
  return NOT_CONNECTED;
}

export interface FetchDeps {
  fetchImpl?: typeof fetch;
}

/** Read the current gloo connection via the BFF. Never throws → not-connected. */
export async function fetchGlooConnection(deps: FetchDeps = {}): Promise<GlooSnapshot> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(CONNECTIONS_URL, { cache: "no-store" });
    if (!res.ok) return NOT_CONNECTED;
    return glooSnapshotFromConnections(await res.json());
  } catch {
    return NOT_CONNECTED;
  }
}

export interface GlooConnectionStatusLike {
  clientId: string;
  status: string;
  connectedAt: string;
  lastVerifiedAt: string;
}

export type GlooSaveError = "invalid_gloo_credentials" | "network";

export type GlooSaveResult =
  | { ok: true; connection: GlooConnectionStatusLike }
  | { ok: false; error: GlooSaveError };

/**
 * `PUT /api/connect/gloo` (verify-then-store). 200 → stored; 400 → the live verify
 * failed (`invalid_gloo_credentials`); anything else / a dead upstream → a generic
 * network error. Never throws — the caller renders the error in the form.
 */
export async function saveGlooCredentials(input: {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<GlooSaveResult> {
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const res = await doFetch(CONNECT_URL, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: input.clientId, clientSecret: input.clientSecret }),
    });
    if (res.ok) {
      const body = (await res.json()) as { connection?: GlooConnectionStatusLike };
      if (body.connection) return { ok: true, connection: body.connection };
      return { ok: false, error: "network" };
    }
    if (res.status === 400) return { ok: false, error: "invalid_gloo_credentials" };
    return { ok: false, error: "network" };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** The user-facing message for a save failure. */
export function glooErrorMessage(error: GlooSaveError): string {
  if (error === "invalid_gloo_credentials") {
    return "We couldn't verify those credentials with Gloo. Double-check the client ID and secret.";
  }
  return "Couldn't reach Gloo to verify. Please try again.";
}
