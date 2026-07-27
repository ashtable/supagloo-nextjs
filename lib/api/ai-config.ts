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

import { redactSecrets } from "../logging/redact";

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

/** Greppable prefix for the first (and only) `console.*` in the codebase — kept a
 *  plain string, no logger abstraction, so `grep '\[supagloo:ai-config\]'` surfaces
 *  every model/provider resolution and which path (override vs. fallback) was taken. */
const LOG_PREFIX = "[supagloo:ai-config]";

/** Emit one distinguishable line naming the resolution path for `what` (model/provider):
 *  the `SUPAGLOO_AI_..._<KIND>` override, or the built-in fallback (which also names the
 *  var to set). This is the observability the task-35 review flagged as missing.
 *
 *  Task 43 / R4344-9: the line goes through `redactSecrets` against the SAME env source the
 *  resolution read. The interpolated `value` is operator-supplied — nothing stops a
 *  deployment from pointing `SUPAGLOO_AI_MODEL_<KIND>` at a value that is also held by a
 *  secret-named variable (an id with an embedded key, a copy-paste, a proxy URL carrying
 *  `user:pass@`) — and this is the only `console.*` in `lib/`, so it is the only place that
 *  could put such a value into a log. Redacting here is what makes
 *  `tests/unit/boot-hardening.test.ts`'s claim about this log site non-vacuous: before it,
 *  that case passed because the string never contained a secret, not because anything
 *  removed one. It cannot corrupt an ordinary model id: needles are values ≥ 8 chars held by
 *  SECRET/TOKEN/…-named vars, plus `scheme://user:pass@` and `Bearer <token>` shapes. */
function logResolution(
  what: "model" | "provider",
  kind: GenerationKind,
  envKey: string,
  overridden: boolean,
  value: string,
  env: EnvSource,
): void {
  if (overridden) {
    console.info(
      redactSecrets(
        `${LOG_PREFIX} ${what} for kind "${kind}" resolved via ${envKey} override -> ${value}`,
        env,
      ),
    );
  } else {
    console.info(
      redactSecrets(
        `${LOG_PREFIX} ${what} for kind "${kind}" resolved via built-in fallback -> ${value} (set ${envKey} to use a different one)`,
        env,
      ),
    );
  }
}

/** Resolve `{provider, model}` for a generation kind: env override wins, else the
 *  documented default. Pure result (injectable env, default `process.env`); as a side
 *  effect it logs which PATH (override vs. fallback) produced each value so a
 *  deployment can see whether its `SUPAGLOO_AI_*_<KIND>` overrides actually took. */
export function resolveGenerationTarget(
  kind: GenerationKind,
  env: EnvSource = process.env,
): GenerationTarget {
  const key = kind.toUpperCase();

  const providerKey = `SUPAGLOO_AI_PROVIDER_${key}`;
  const providerOverride = nonEmpty(env[providerKey]);
  const provider = providerOverride ?? DEFAULT_GENERATION_PROVIDERS[kind];
  logResolution(
    "provider",
    kind,
    providerKey,
    providerOverride !== undefined,
    provider,
    env,
  );

  const modelKey = `SUPAGLOO_AI_MODEL_${key}`;
  const modelOverride = nonEmpty(env[modelKey]);
  const model = modelOverride ?? DEFAULT_GENERATION_MODELS[kind];
  logResolution("model", kind, modelKey, modelOverride !== undefined, model, env);

  return { provider, model };
}
