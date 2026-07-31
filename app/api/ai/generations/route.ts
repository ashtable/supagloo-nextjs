import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import { resolveGenerationTarget, type GenerationKind } from "@/lib/api/ai-config";
import { readProviderConnectivity } from "@/lib/api/connectivity";

/**
 * `POST /api/ai/generations` — start an AI generation, proxied to
 * `POST /v1/ai/generations` (design-delta §6b). Status + body pass through verbatim, so
 * the API's gates (400 structural / 422 kind_provider_incompatible / 404 / 501) reach the
 * client unchanged.
 *
 * ── provider/model resolution, as of genesis-1 item 1 ───────────────────────────────
 * The route still resolves `{provider, model}` server-side via `resolveGenerationTarget`,
 * which remains the answer to "whatever the system currently uses today". What changed is
 * that the client may now OVERRIDE it, because the Inspector lets the user choose — and a
 * choice the user made and can see on screen has to win over a deployment default.
 *
 * The override is taken as-is and not validated here on purpose. The api's compatibility
 * matrix is the real gate (422 before any row is created) and the discriminated-union body
 * schema is the structural one (400); re-checking either in the BFF would put a second,
 * drifting copy of the rules in front of the authoritative one. The design's "no business
 * logic in the BFF" line is the same instruction.
 *
 * This does mean a model id can now reach the browser — unavoidably, since a picker has to
 * render one. The rule it does not break is the one that matters: no model id is BAKED
 * into the client bundle. Every id the browser holds came from the live catalogue at
 * runtime, which is exactly what `lib/api/ai-config.ts` calls the correct long-term fix.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    provider?: unknown;
    model?: unknown;
    [k: string]: unknown;
  };

  const kind = body.kind as GenerationKind | undefined;
  if (!kind) {
    return NextResponse.json({ error: "kind_required" }, { status: 400 });
  }
  // Both must be present to override: a provider without a model would send this
  // deployment's default model for a DIFFERENT provider, which the upstream would reject
  // as an unknown model — an error that would look like a broken provider rather than a
  // half-specified request.
  const overridden =
    typeof body.provider === "string" &&
    body.provider.length > 0 &&
    typeof body.model === "string" &&
    body.model.length > 0;

  let provider: string;
  let model: string;
  if (overridden) {
    provider = body.provider as string;
    model = body.model as string;
  } else {
    // R4/R6/R8 — the FALLBACK path is connection-aware, and this is the only path that is
    // ever reached for `storyboard` and `script` (neither is a selectable kind, so neither
    // appears in the catalogue's published `defaults` and the client cannot override them).
    // Reading connections only here keeps the extra round-trip off the request the
    // Inspector actually makes, which always carries an explicit target.
    const connectivity = await readProviderConnectivity(token);
    const fallback = resolveGenerationTarget(kind, process.env, connectivity);
    provider = fallback.provider;
    model = fallback.model;
  }

  const result = await forwardToApi({
    path: "ai/generations",
    method: "POST",
    token,
    body: { ...body, provider, model },
  });
  return NextResponse.json(result.body, { status: result.status });
}
