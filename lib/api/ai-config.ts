/**
 * Task #35 — the BFF-side provider/model resolver for AI generations.
 *
 * The studio client never chooses a provider or a model: it posts
 * `{kind, projectId?, sceneId?, input}` and the BFF route
 * (`app/api/ai/generations/route.ts`) enriches it with `{provider, model}` via
 * this pure, env-overridable resolver — server-side, so no model id ships in the
 * browser bundle and it can be changed (e.g. for e2e) without a rebuild.
 *
 * WHY a default id lives here at all (the honest judgment call): the design's
 * "model ids are never hardcoded" targets the backend discovery layer, but the
 * `POST /v1/ai/generations` contract *requires* `model`, the generation workflows
 * consume `request.model` directly (they do NOT re-discover), and there is no
 * model-discovery API/BFF route (building one expands into the api repo, out of
 * scope for this UI task). Keeping the id in this ONE server-side, env-overridable
 * place — not buried at call sites, not baked into the client — honours the intent
 * of the rule while satisfying the contract. The fallbacks below are the
 * last-known-good live ids observed in the 2026-07-24 real-provider e2e run (via
 * OpenRouter discovery); override per deployment/e2e with `SUPAGLOO_AI_MODEL_<KIND>`.
 * A real discovery endpoint is the correct long-term fix (tracked as a follow-up).
 */

type EnvSource = Record<string, string | undefined>;

export type GenerationKind =
  | "storyboard"
  | "script"
  | "image"
  | "narration"
  | "music"
  | "video";

export interface GenerationTarget {
  provider: string;
  model: string;
}

/** Last-known-good live OpenRouter model ids per kind (2026-07-24 e2e run).
 *  Overridable via `SUPAGLOO_AI_MODEL_<KIND>`. */
export const DEFAULT_GENERATION_MODELS: Record<GenerationKind, string> = {
  storyboard: "google/gemma-4-26b-a4b-it:free",
  script: "google/gemma-4-26b-a4b-it:free",
  image: "google/gemini-2.5-flash-image",
  narration: "openai/gpt-audio-mini",
  music: "google/lyria-3-clip-preview",
  video: "alibaba/wan-2.7",
};

/** Provider per kind. openrouter is valid for EVERY kind in the compatibility
 *  matrix (`image`/`narration`/`music`/`video` are openrouter-only; text kinds
 *  allow gloo too but openrouter is the simplest always-valid default — no picker
 *  UI). Overridable via `SUPAGLOO_AI_PROVIDER_<KIND>`. */
const DEFAULT_GENERATION_PROVIDERS: Record<GenerationKind, string> = {
  storyboard: "openrouter",
  script: "openrouter",
  image: "openrouter",
  narration: "openrouter",
  music: "openrouter",
  video: "openrouter",
};

const nonEmpty = (v: string | undefined): string | undefined =>
  v && v.length > 0 ? v : undefined;

/** Resolve `{provider, model}` for a generation kind: env override wins, else the
 *  documented default. Pure — injectable env (default `process.env`). */
export function resolveGenerationTarget(
  kind: GenerationKind,
  env: EnvSource = process.env,
): GenerationTarget {
  const key = kind.toUpperCase();
  const provider =
    nonEmpty(env[`SUPAGLOO_AI_PROVIDER_${key}`]) ??
    DEFAULT_GENERATION_PROVIDERS[kind];
  const model =
    nonEmpty(env[`SUPAGLOO_AI_MODEL_${key}`]) ?? DEFAULT_GENERATION_MODELS[kind];
  return { provider, model };
}
