import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import {
  narrowNarrationModels,
  resolveGenerationTarget,
  type GenerationKind,
} from "@/lib/api/ai-config";

/**
 * `GET /api/ai/models` — the live provider/model catalogue behind the Inspector's model
 * selectors and its cost estimate (genesis-1 items 1 and 3).
 *
 * A thin passthrough of `GET /v1/ai/models` plus exactly ONE addition: `defaults`.
 *
 * That addition is not business logic in the BFF, and the distinction matters. Item 1
 * says each selector "defaults to whatever the system currently uses today" — and what
 * the system uses today is `resolveGenerationTarget(kind)`, which reads
 * `SUPAGLOO_AI_PROVIDER_<KIND>` / `SUPAGLOO_AI_MODEL_<KIND>` from THIS process's
 * environment. The api has no way to know it. Publishing it here is the same enrichment
 * `POST /api/ai/generations` already performs with the same function; the alternative
 * would be duplicating this deployment's configuration into another service.
 *
 * The api never 5xxs this route (it contains every upstream failure to its own slice), so
 * a non-2xx here means auth or the api itself being down — in which case the studio's
 * reader returns null and the picker shows its unavailable state.
 */

/** The kinds the Inspector offers a selector for. Deliberately not every kind: the text
 *  kinds have no selector, so publishing a default for them would imply a control that
 *  does not exist. */
const SELECTABLE_KINDS: GenerationKind[] = ["image", "narration", "music", "video"];

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;

  const result = await forwardToApi({ path: "ai/models", method: "GET", token });
  if (result.status < 200 || result.status >= 300) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const body = (result.body ?? {}) as Record<string, unknown>;

  /**
   * R4/R6/R8 — the published defaults are CONNECTION-AWARE.
   *
   * `providers` is already in this response (the api derives it from the same rows
   * `GET /v1/connections` reads), so this costs ZERO extra fetches. Fixing it here fixes
   * every consumer at once: all six `resolveChoice` call sites — the picker, the generation
   * target that is actually POSTed, the voice vocabulary, the busy label, the video cost
   * estimate and the reducer — read `defaults` out of this response.
   *
   * The shape is validated rather than trusted: a body without `providers` (an older api,
   * or a response the schema has not caught up with) yields `null`, which the resolver
   * treats as UNKNOWN and answers exactly as it did before connections existed. Coercing a
   * missing field to `{gloo:false, openrouter:false}` would "repair" every user onto
   * whichever provider came first in the matrix.
   */
  const raw = body.providers as { gloo?: unknown; openrouter?: unknown } | undefined;
  const providers =
    raw && typeof raw.gloo === "boolean" && typeof raw.openrouter === "boolean"
      ? { gloo: raw.gloo, openrouter: raw.openrouter }
      : null;

  const defaults: Record<string, { provider: string; model: string }> = {};
  for (const kind of SELECTABLE_KINDS) {
    defaults[kind] = resolveGenerationTarget(kind, process.env, providers);
  }

  // The narration narrowing (2026-07-30, at the user's direction — see
  // `narrowNarrationModels`). It belongs HERE for the same reason `defaults` does: the
  // narration model is `resolveGenerationTarget`'s answer, which is THIS process's
  // configuration and something the api has no way to know. Publishing config, not
  // business logic.
  //
  // Narrowing the offer without narrowing the default would let the picker show a model
  // the narration path will not run, so the two must be answered by the same call.
  const models = Array.isArray(body.models)
    ? narrowNarrationModels(
        body.models as Array<{ id: string; kinds: string[] }>,
        defaults.narration.model,
      )
    : body.models;

  return NextResponse.json({ ...body, models, defaults }, { status: 200 });
}
