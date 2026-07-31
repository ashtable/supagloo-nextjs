/**
 * The kind→provider compatibility matrix, hand-mirrored from db-lib's
 * `AI_PROVIDERS_BY_KIND` (`supagloo-database-lib/src/workflows.ts`). This repo deliberately
 * does not import db-lib; every wire contract here is a hand copy.
 *
 * ## Why it is its own module (2026-07-31)
 *
 * There were two partial copies and one hole. `lib/studio/ai-settings.ts` mirrored only the
 * four SELECTABLE kinds — the ones with a UI selector — and nothing anywhere covered
 * `storyboard` or `script`. The connection-aware resolver (R4/R6/R8) needs all six, and it
 * is the ONLY code path that ever resolves `storyboard`: storyboard has no selector, so it
 * never appears in the catalogue's published `defaults`, which is exactly why R8's
 * storyboard flip is unreachable from the picker.
 *
 * One rule, one module, applied at each boundary: the resolver reads it to decide what a
 * kind may be REPAIRED onto, and the picker reads it to explain why a provider is greyed
 * out. `ai-matrix.test.ts` pins that it covers exactly the six kinds, so a seventh cannot
 * arrive without someone answering the provider question for it.
 *
 * ## Why `narration` / `music` / `video` are openrouter-only
 *
 * A MEASURED fact, not caution. Gloo's live catalogue (`GET /platform/v2/models`, verified
 * 2026-07-31) holds 107 models: 11 declare image output and every other entry is text.
 * ZERO declare speech, music or video, and those routes answer 404 (absent) rather than 405.
 * So with OpenRouter missing there is no fallback to reroute onto — which is why R7 disables
 * those controls instead of moving them.
 */

/** Kept as a local literal union rather than imported from `contracts.ts` so this module
 *  stays a pure, dependency-free constant that the server resolver and the client picker
 *  can both hold. Structurally identical to `AiProvider` / `AiGenerationKind`. */
export type AiProviderName = "gloo" | "openrouter";

export type GenerationKindName =
  | "storyboard"
  | "script"
  | "image"
  | "narration"
  | "music"
  | "video";

/**
 * Which providers this user has CONNECTED, as published by the api's model catalogue
 * (`AiModelCatalogueResponse.providers`).
 *
 * `null` wherever this type is accepted means UNKNOWN — the read failed, or has not
 * returned. It never means "not connected"; see `evaluateConnectionGuardrail` and
 * `kindAvailability` for why that distinction is load-bearing.
 */
export interface ProviderConnectivity {
  gloo: boolean;
  openrouter: boolean;
}

export const AI_PROVIDERS_BY_KIND: Record<
  GenerationKindName,
  readonly AiProviderName[]
> = {
  storyboard: ["gloo", "openrouter"],
  script: ["gloo", "openrouter"],
  image: ["gloo", "openrouter"],
  narration: ["openrouter"],
  music: ["openrouter"],
  video: ["openrouter"],
};

/** The providers that can serve `kind`, in preference order. */
export function providersForKind(
  kind: GenerationKindName,
): readonly AiProviderName[] {
  return AI_PROVIDERS_BY_KIND[kind];
}

/** Does the matrix permit this pair? Mirrors db-lib's `isProviderCompatible`, which is the
 *  authority — the api answers 422 on it before any row is created. */
export function isKindProviderCompatible(
  kind: GenerationKindName,
  provider: AiProviderName,
): boolean {
  return AI_PROVIDERS_BY_KIND[kind].includes(provider);
}
