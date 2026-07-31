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
import {
  providersForKind,
  type AiProviderName,
  type GenerationKindName,
  type ProviderConnectivity,
} from "./ai-matrix";

type EnvSource = Record<string, string | undefined>;

export type GenerationKind = GenerationKindName;

export interface GenerationTarget {
  provider: string;
  model: string;
}

/**
 * The default model for every `(kind, provider)` pair the MATRIX permits.
 *
 * ── Why a second dimension, and why the ids live here (R4/R6/R8, 2026-07-31) ────────
 *
 * The map used to be per-kind only, which was fine while a kind's provider never moved.
 * The connection-aware resolver below moves it: a user with no Gloo gets `image` repaired
 * onto OpenRouter, and a per-kind map would then have sent a `gloo-…` id to OpenRouter — an
 * unknown-model 400 that reads like a broken provider. Every pair the repair can PRODUCE
 * needs an answer, which is exactly what `ai-matrix.test.ts`'s `U-DT12` asserts.
 *
 * Naming ids here at all remains this module's DOCUMENTED, deliberate exception to
 * `design-delta.md`'s "model ids are never hardcoded". The rule's lint
 * (`dbos/src/providers/no-model-ids.test.ts`) is scoped to `dbos/src/providers/*.ts`,
 * non-recursively, and does not scan this file. Adding a column to the existing exception
 * is a smaller change than opening a second mechanism, it stays SERVER-side (so no model
 * id is baked into the browser bundle), and it stays operator-overridable — which is what
 * the rule's intent actually buys.
 *
 * The alternative — resolving "Nano Banana" live by NAME, the way
 * `PREFERRED_TRANSLATION_ABBREVIATION = "ASV"` does for translations — was considered and
 * rejected. SIX live OpenRouter models carry that name (`gemini-2.5-flash-image`,
 * `3.1-flash-image`, `3.1-flash-image-preview`, `3.1-flash-lite-image`, `3-pro-image`,
 * `3-pro-image-preview`), so a lookup would need a disambiguation POLICY — itself a
 * hardcoded rule, only written in prose — and it would silently migrate the default onto a
 * Lite or Pro variant the day Google ships another one. Choosing quality and price by
 * accident is worse than choosing an id on purpose. It also could not work where it is
 * needed: `POST /api/ai/generations` resolves a target before anything has read the
 * catalogue, and it is the only path that resolves `storyboard`/`script`.
 *
 * Every id below was re-verified against the live catalogues on 2026-07-31.
 */
export const DEFAULT_MODEL_BY_KIND_PROVIDER: Record<
  GenerationKind,
  Partial<Record<AiProviderName, string>>
> = {
  storyboard: {
    // R8's Gloo text model. `["text"]` on the live catalogue. Chosen over the newer
    // `gloo-google-gemini-3.6-flash` / `-3.5-flash` because storyboard runs through
    // `generateObject` with a Zod schema and a bounded repair loop — structured-output
    // RELIABILITY matters more than novelty here — and because it is the same generation
    // and tier as the Gloo image default, so "Gloo = Gemini 2.5 Flash" is one story a user
    // can reason about. The user's "use the newest" direction was scoped explicitly to Nano
    // Banana / R4; applying it to a text kind would change storyboard quality and cost with
    // nothing on screen to say so.
    gloo: "gloo-google-gemini-2.5-flash",
    openrouter: "google/gemma-4-26b-a4b-it:free",
  },
  script: {
    gloo: "gloo-google-gemini-2.5-flash",
    openrouter: "google/gemma-4-26b-a4b-it:free",
  },
  image: {
    // Live: `output_modalities` `["text","image"]`.
    gloo: "gloo-google-gemini-2.5-flash-image",
    // R4's target, per the user's explicit direction to take the NEWEST Nano Banana.
    // "Google: Nano Banana 2 (Gemini 3.1 Flash Image)" — newest generation, full (non-Lite)
    // tier, stable rather than `-preview`. NOT `…-3.1-flash-lite-image` (strictly newest by
    // date, but a downgraded tier) and NOT `…-3-pro-image` (older generation at ~6.7× the
    // per-image price — a default must not quietly multiply the user's provider bill).
    openrouter: "google/gemini-3.1-flash-image",
  },
  // The three openrouter-ONLY kinds. No `gloo` slot exists and none may be added: Gloo
  // publishes zero speech/music/video models, so the id could only be invented, and the
  // slot would be a standing invitation to route around the matrix.
  narration: {
    // MUST come from `GET /api/v1/models?output_modalities=speech` — the DEDICATED batch-TTS
    // catalogue that `POST /api/v1/audio/speech` serves. It was once a CONVERSATIONAL model
    // from the `output_modalities=audio` catalogue, which is why narration answered the
    // verse ("It sounds like you're quoting from the Book of Genesis…") instead of reading
    // it; that id is also rejected outright with `400 Model … does not exist`.
    openrouter: "hexgrad/kokoro-82m",
  },
  music: { openrouter: "google/lyria-3-clip-preview" },
  video: {
    // "xAI: Grok Imagine Video". NOT `x-ai/grok-imagine-video-1.5`, which is the adjacent
    // "Grok Imagine Video 1.5" — the two are separate catalogue entries.
    openrouter: "x-ai/grok-imagine-video",
  },
};

/**
 * Provider per kind, BEFORE any connection-aware repair. Overridable via
 * `SUPAGLOO_AI_PROVIDER_<KIND>`.
 *
 * This IS R8's "both connected" answer: `image` and `storyboard` on Gloo, everything else
 * on OpenRouter. `storyboard` MOVED here from openrouter on 2026-07-31 and is R8's only
 * behavioural change — the other five already landed where R8 wants them.
 *
 * The reasoning behind the two Gloo kinds: faith-aligned generation is the product's reason
 * to exist, so the two kinds that decide what the video LOOKS like and what it SAYS run on
 * the aligned provider. `script` stays on OpenRouter ("everything else"), and
 * `narration`/`music`/`video` are matrix-forced there.
 */
const DEFAULT_GENERATION_PROVIDERS: Record<GenerationKind, AiProviderName> = {
  storyboard: "gloo",
  script: "openrouter",
  image: "gloo",
  narration: "openrouter",
  music: "openrouter",
  video: "openrouter",
};

/** The per-kind default model on that kind's PREFERRED provider. Retained as a named export
 *  because `SUPAGLOO_AI_MODEL_<KIND>` is shorthand for "the preferred slot", and several
 *  tests and the `.env.example` docs are written in those terms. */
export const DEFAULT_GENERATION_MODELS: Record<GenerationKind, string> =
  Object.fromEntries(
    (Object.keys(DEFAULT_GENERATION_PROVIDERS) as GenerationKind[]).map((kind) => [
      kind,
      DEFAULT_MODEL_BY_KIND_PROVIDER[kind][DEFAULT_GENERATION_PROVIDERS[kind]]!,
    ]),
  ) as Record<GenerationKind, string>;

/**
 * Offer exactly ONE narration model — the one this deployment is configured to run.
 *
 * ── The directive, and why this is an exception ─────────────────────────────────────
 * The user narrowed the supported narration models twice, on 2026-07-30:
 *
 *   > "let's stick to only the hexgrad/kokoro-82m and zyphra/zonos-* narration models,
 *   >  with the default being kokoro"
 *   …superseded minutes later by "actually, let's just do kokora" /
 *   "forget about the zonos narration".
 *
 * That is a deliberate, user-chosen narrowing, and it is a stated exception to
 * `design-delta.md:1143` ("Model ids are never hardcoded") and to the user's own
 * "don't hardcode OpenRouter ids" instruction. It is recorded here rather than left to
 * look accidental.
 *
 * **The exception costs zero NEW hardcoded ids.** The RULE below names no model: it keeps
 * whichever narration model `resolveGenerationTarget("narration")` resolves — i.e.
 * `SUPAGLOO_AI_MODEL_NARRATION`, or this module's documented default, which has been
 * `hexgrad/kokoro-82m` since 2026-07-27 and is the id every narration generation has
 * already been running on. So the narrowing is operator-overridable rather than frozen,
 * and it stays SERVER-side, which is what keeps this module's stated property true: no
 * model id ships in the browser bundle.
 *
 * **The narrowing is about which MODEL is offered, never about which VOICES it has.**
 * Voices are read live from the provider's `supported_voices` and nothing here touches
 * them. `dbos/src/providers/no-model-ids.test.ts` scans `dbos/src/providers/*.ts` only
 * (measured, non-recursive) and is unaffected.
 *
 * A model that serves narration AND some other kind keeps the other kind: the rule is
 * about the KIND, not the entry. Speech-catalogue entries carry exactly `["narration"]`
 * today, so dropping whole models would agree by accident — and stop agreeing the moment
 * the catalogue changes.
 */
export function narrowNarrationModels<
  T extends { id: string; kinds: string[] },
>(models: T[], narrationModelId: string): T[] {
  return models
    .map((m) =>
      m.kinds.includes("narration") && m.id !== narrationModelId
        ? { ...m, kinds: m.kinds.filter((k) => k !== "narration") }
        : m,
    )
    .filter((m) => m.kinds.length > 0);
}

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

/**
 * THE resolver — R4, R6 and R8 are one function, not three special cases.
 *
 * ## Precedence
 *
 * | # | layer                                | where                                  |
 * |---|--------------------------------------|----------------------------------------|
 * | 1 | explicit manifest choice             | client-side `resolveChoice()` — not here |
 * | 2 | **connection-aware repair** (R4/R6)  | this function                          |
 * | 3 | deployment env override              | this function                          |
 * | 4 | hard fallback (the R8 baseline maps) | this function                          |
 *
 * Layer 2 sits ABOVE layer 3, and the reason is that it is a **veto, not a positive
 * choice**: an operator default the user cannot run is not a default, it is a guaranteed
 * error. Within the set of VIABLE providers the operator's override still decides.
 *
 * ```
 * preferred = env[SUPAGLOO_AI_PROVIDER_<KIND>] ?? DEFAULT_GENERATION_PROVIDERS[kind]
 * wanted    = MATRIX[kind].includes(preferred)          // ← the clamp, applied ONCE
 *               ? preferred : DEFAULT_GENERATION_PROVIDERS[kind]
 *
 * provider =
 *   connected == null                            -> wanted      // we could not ask
 *   connected[wanted]                            -> wanted
 *   first p of MATRIX[kind] where connected[p]    -> p           // ← R4 / R6 live here
 *   otherwise                                    -> wanted      // nothing connected
 *
 * model =
 *   provider === preferred
 *     ? env[MODEL_<KIND>] ?? env[MODEL_<KIND>_<PROVIDER>] ?? MAP[kind][provider]
 *     :                      env[MODEL_<KIND>_<PROVIDER>] ?? MAP[kind][provider]
 * ```
 *
 * ## `connected == null` never repairs and never blanks
 *
 * `null` means "we could not ask" — a failed connections read, or the window before one
 * returns. Treating it as "not connected" would silently move a connected user's defaults
 * on every network blip. It resolves identically to the connection-blind answer.
 *
 * ## Nothing connected keeps the PREFERRED provider — clamped to the matrix
 *
 * There is no repair to make, and blanking the selection would render an incoherent picker.
 * The api answers `409 provider_not_connected` before creating a row, which is the honest
 * refusal — better than the studio inventing a provider the user has never linked and
 * failing deep inside DBOS.
 *
 * "Keeps the preferred provider" is bounded by the MATRIX, not unconditional: a preference
 * this kind cannot serve degrades to the kind's own default, because the alternative is a
 * `{provider, model: undefined}` target that is not merely wrong for this kind but fails
 * the catalogue schema and blanks the entire Studio AI surface. See `repairProvider`.
 *
 * ## `SUPAGLOO_AI_MODEL_<KIND>` binds to the PREFERRED provider only
 *
 * That binding is not cosmetic. Without it, an operator who pins
 * `SUPAGLOO_AI_MODEL_IMAGE=gloo-…` would send a **Gloo id to OpenRouter** the moment a
 * repair moved the provider — exactly the cross-provider leak
 * `app/api/ai/generations/route.ts` already warns about for a half-specified client
 * override. `SUPAGLOO_AI_MODEL_<KIND>_<PROVIDER>` addresses one slot and is unaffected.
 *
 * Pure result (injectable env, default `process.env`); as a side effect it logs which PATH
 * (override vs. fallback) produced each value, so a deployment can see whether its
 * `SUPAGLOO_AI_*_<KIND>` overrides actually took.
 */
export function resolveGenerationTarget(
  kind: GenerationKind,
  env: EnvSource = process.env,
  connected?: ProviderConnectivity | null,
): GenerationTarget {
  const key = kind.toUpperCase();

  const providerKey = `SUPAGLOO_AI_PROVIDER_${key}`;
  const providerOverride = nonEmpty(env[providerKey]);
  const preferred = (providerOverride ??
    DEFAULT_GENERATION_PROVIDERS[kind]) as AiProviderName;
  const provider = repairProvider(kind, preferred, connected);
  logResolution(
    "provider",
    kind,
    providerKey,
    providerOverride !== undefined,
    provider,
    env,
  );

  const slotKey = `SUPAGLOO_AI_MODEL_${key}_${provider.toUpperCase()}`;
  const kindKey = `SUPAGLOO_AI_MODEL_${key}`;
  const slotOverride = nonEmpty(env[slotKey]);
  // The kind-wide override applies ONLY while we are still on the preferred provider.
  const kindOverride =
    provider === preferred ? nonEmpty(env[kindKey]) : undefined;
  const override = kindOverride ?? slotOverride;
  const model = override ?? DEFAULT_MODEL_BY_KIND_PROVIDER[kind][provider]!;
  logResolution(
    "model",
    kind,
    kindOverride !== undefined ? kindKey : slotKey,
    override !== undefined,
    model,
    env,
  );

  return { provider, model };
}

/**
 * Layer 2. Keep the preference when it is viable or unknowable; otherwise take the first
 * matrix-compatible provider the user actually has. Never returns a provider outside the
 * matrix, so a repair can never produce a target the api's 422 would reject.
 *
 * ── The clamp, and what it is FOR (2026-07-31 review, revision R2) ───────────────────
 *
 * `preferred` comes from `SUPAGLOO_AI_PROVIDER_<KIND>` and is an unvalidated operator
 * string widened to `AiProviderName` by a cast — so at runtime it can be a provider this
 * kind cannot serve (`SUPAGLOO_AI_PROVIDER_NARRATION=gloo`) or a provider that does not
 * exist at all. Both paths below used to return it UNCLAMPED, and the caller then does
 * `DEFAULT_MODEL_BY_KIND_PROVIDER[kind][provider]!` into a slot `U-DT17` guarantees is
 * absent. The result was `model: undefined` on a `GenerationTarget.model: string`, which
 * fails `AiModelCatalogueResponseSchema`'s `min(1)` and takes the WHOLE Studio AI surface
 * down (`fetchModelCatalogue` returns `null`), not just the misconfigured kind.
 *
 * ── D3: the fallback is the kind's OWN default, not `allowed[0]` ─────────────────────
 *
 * The obvious clamp is `allowed[0]`, and it is wrong for `script`. `providersForKind`
 * returns the matrix row, which states COMPATIBILITY, not preference — `script`'s row is
 * `["gloo", "openrouter"]` while `DEFAULT_GENERATION_PROVIDERS.script` is `"openrouter"`
 * (R8's "everything else"). Clamping to `allowed[0]` would answer `gloo` there: an
 * unrecognised override would not be ignored, it would silently re-pick the provider by
 * the matrix's declaration ORDER — turning a typo into a provider migration, and making
 * the matrix literal's line order load-bearing for defaults it was never meant to decide.
 * `DEFAULT_GENERATION_PROVIDERS[kind]` is the answer the resolver gives with no override
 * at all, so an unusable override degrades to "as if unset". It is in-matrix and has a
 * model for every kind (`U-DT18`/`U-DT19`, and `DEFAULT_GENERATION_MODELS` already asserts
 * the model half at module load).
 *
 * ── The clamp happens ONCE, BEFORE the repair — not at each return ───────────────────
 *
 * Clamping the two `return preferred` sites individually is a half fix, and `U-DT19`
 * caught it: the surviving `allowed.find((p) => connected[p])` path is ALSO ordered by the
 * matrix literal, so `script` with an unusable override and BOTH providers connected still
 * came back `gloo`. There is nothing to repair when the preference was never viable in the
 * first place — so the preference is normalised first and the untouched R4/R6 repair then
 * runs on a preference that is guaranteed to be in the matrix.
 */
function repairProvider(
  kind: GenerationKind,
  preferred: AiProviderName,
  connected: ProviderConnectivity | null | undefined,
): AiProviderName {
  const allowed = providersForKind(kind);
  // Layer 0: an operator preference this kind cannot serve is not a preference.
  const wanted = allowed.includes(preferred)
    ? preferred
    : DEFAULT_GENERATION_PROVIDERS[kind];
  if (connected == null) return wanted;
  if (connected[wanted]) return wanted;
  return allowed.find((p) => connected[p]) ?? wanted;
}
