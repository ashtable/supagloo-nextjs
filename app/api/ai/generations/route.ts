import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import { resolveGenerationTarget, type GenerationKind } from "@/lib/api/ai-config";

/**
 * `POST /api/ai/generations` — start an AI generation, proxied to
 * `POST /v1/ai/generations` (design-delta §6b). The studio client posts only
 * `{kind, projectId?, sceneId?, input}`; this route ENRICHES it server-side with
 * `{provider, model}` via `resolveGenerationTarget` (so no model id ships in the
 * browser bundle, and the compatibility matrix is honoured by construction).
 * Status + body pass through verbatim, so the API's gates (400 structural / 422
 * kind_provider_incompatible / 404 / 501) reach the client unchanged.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    [k: string]: unknown;
  };

  const kind = body.kind as GenerationKind | undefined;
  if (!kind) {
    return NextResponse.json({ error: "kind_required" }, { status: 400 });
  }
  const { provider, model } = resolveGenerationTarget(kind);

  const result = await forwardToApi({
    path: "ai/generations",
    method: "POST",
    token,
    body: { ...body, provider, model },
  });
  return NextResponse.json(result.body, { status: result.status });
}
