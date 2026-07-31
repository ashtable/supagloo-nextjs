import type {
  AiGenerationSettings,
  AiModelInfo,
  AiProvider,
  FaithAlignment,
} from "../api/contracts";
import {
  providersForKind,
  type GenerationKindName,
  type ProviderConnectivity,
} from "../api/ai-matrix";

/**
 * The pure rules behind the Inspector's `GENERATION` section (genesis-1 items 1, 2 and 4).
 *
 * ── What the design gave us and what is invented ────────────────────────────────────
 * `13b` is a TRANSCRIBED screen with exactly five sections and no settings control of any
 * kind, so a sixth section is an EXTENSION. What is composed rather than invented: the
 * `· whole video` scope qualifier (drawn on 13b's NARRATOR VOICE), the gold-label
 * convention for AI-driven sections, the bare provider names `Gloo AI` / `OpenRouter`
 * (10a/10b), and the present-but-disabled treatment — `opacity:.5` plus a plain-language
 * reason (13a's repo list, "Pattern B"), with a `Link ▸` escape hatch (10a, "Pattern A")
 * only where linking is what the user actually needs to do.
 *
 * ── Why the selectors are project-level ─────────────────────────────────────────────
 * A model choice configures the project, not a scene. Per-scene would make the user pick
 * a model 5–10 times — the opposite of item 3's "know the cost of iterating" — and a
 * per-scene faith alignment would let scene 3 argue with scene 4. Project-level → per
 * scene is a later additive field; the reverse is a manifest migration.
 */

/** The kinds the Inspector offers a selector for. Items 1 (image/narration/music) and 4
 *  (video). The text kinds have no selector, so they are deliberately absent — offering
 *  one would invent a control the task did not ask for. */
export const SELECTABLE_KINDS = ["image", "narration", "music", "video"] as const;
export type SelectableKind = (typeof SELECTABLE_KINDS)[number];

/** The four REAL faith alignments, ordered neutral-first (the design's rule for an
 *  unmade choice is a dim placeholder, and "not faith specific" is the honest name for
 *  Gloo's own default). NO `protestant`, NO `orthodox` — those return 200 from Gloo and
 *  silently degrade to neutral, so offering them would be an invisible failure. */
export const FAITH_ALIGNMENTS = [
  "not_faith_specific",
  "evangelical",
  "mainline",
  "catholic",
] as const;

/**
 * The design's own words for these, in the design's own vocabulary — **"faith-aligned",
 * never "denomination" and never "tradition"**. `tradition` is Gloo's WIRE field name and
 * keeps that name in code and comments; it is simply not a word we show a user.
 *
 * The rule is enforced by `U-FA3a`, because a JSDoc is not a gate: this map shipped with
 * `not_faith_specific: "No specific tradition"` three lines under the rule that forbids it.
 */
export const FAITH_ALIGNMENT_LABELS: Record<FaithAlignment, string> = {
  not_faith_specific: "No particular faith alignment",
  evangelical: "Evangelical",
  mainline: "Mainline Protestant",
  catholic: "Catholic",
};

/**
 * The sub-line under the FAITH ALIGNMENT select.
 *
 * Lives here rather than inline in `ai-settings-panel.tsx` so the vocabulary rule above
 * governs it and `U-FA3b` can hold it — the shipped inline version read *"Steers Gloo's
 * faith-aligned models. Only these four traditions are supported."*, which broke the rule
 * AND over-promised the scope.
 *
 * **Scope is the substantive half.** `faithAlignment` reaches exactly one call site:
 * `studio-context.tsx`'s `rerollVisual`, behind `provider === "gloo"`. So it steers Gloo
 * IMAGE generation and nothing else — not narration/music/video (Gloo serves none of
 * them), and not the storyboard/script text kinds, which have no selector here and whose
 * `CallLlmStructuredArgs` carries no pass-through for it. Saying "steers Gloo's models"
 * unqualified promises steering the product does not perform, and Gloo returns 200 for a
 * value it ignores, so nothing would ever tell the user otherwise.
 */
export const FAITH_ALIGNMENT_HELP =
  "Applies to scene images generated with Gloo AI. These four are the only values Gloo honours.";

/**
 * The kind→provider compatibility matrix.
 *
 * MOVED to `lib/api/ai-matrix.ts` on 2026-07-31. It used to be a local four-kind copy —
 * the SELECTABLE kinds only — which meant nothing in the repo knew which providers could
 * serve `storyboard` or `script`. The connection-aware resolver needs all six, and two
 * partial hand-mirrors of one db-lib constant is one too many.
 */
const PROVIDERS_BY_KIND: Record<SelectableKind, readonly AiProvider[]> = {
  image: providersForKind("image") as readonly AiProvider[],
  narration: providersForKind("narration") as readonly AiProvider[],
  music: providersForKind("music") as readonly AiProvider[],
  video: providersForKind("video") as readonly AiProvider[],
};

/** Plain-language reasons, in the design's register. Used ONLY when the matrix excludes
 *  Gloo for that kind — so if the matrix ever widens, the reason cannot be shown by
 *  accident. */
const GLOO_UNSUPPORTED_REASON: Record<SelectableKind, string> = {
  image: "",
  narration: "No speech models",
  music: "No music models",
  video: "No video models",
};

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  gloo: "Gloo AI",
  openrouter: "OpenRouter",
};

export interface ProviderOption {
  provider: AiProvider;
  label: string;
  available: boolean;
  /** Plain-language reason, shown as the design's gray reason badge when unavailable. */
  reason?: string;
  /** True only when the reason is something the user can act on by linking the provider —
   *  which is what earns the 10a `Link ▸` escape hatch. Never true for "Gloo has no speech
   *  models", because there is nowhere useful to send them. */
  connectable?: boolean;
}

/** Models of `provider` that can serve `kind`. */
export function modelsFor(
  kind: SelectableKind,
  provider: AiProvider,
  catalogue: readonly AiModelInfo[],
): AiModelInfo[] {
  return catalogue.filter((m) => m.provider === provider && m.kinds.includes(kind));
}

/**
 * Both providers, always PRESENT, each with whether it can be chosen and why not.
 *
 * `connected === null` means we have not been told yet — NOT "not connected". Rendering an
 * unresolved state as a hard "not connected" with a `Link ▸` would tell a connected user to
 * go and connect. Same trap as `isAuthed === false`.
 *
 * ── The input was RETYPED on 2026-07-31 (decision D4) ───────────────────────────────
 *
 * It used to take the client's `ConnectionsState`. That state is wrong for this question in
 * two independent ways: `applyConnectionsBase` never sets not-linked and the hydrate effect
 * returns early on a failed read, so it conflates "not connected" with "we could not ask";
 * and `?seed=authed-returning` pre-marks GitHub + OpenRouter connected regardless of the
 * database, which has already made a connect helper a silent no-op once.
 *
 * `AiModelCatalogueResponse.providers` has neither problem. It is server-derived, it is
 * documented (api `model-catalogue-service.ts`) to mean "is this user CONNECTED" rather
 * than "did the catalogue read succeed", and its reader returns `null` on any failure and
 * never throws — so "we could not ask" is a structurally distinct state here in a way it
 * never was for `ConnectionsState`.
 */
export function providerOptionsFor(
  kind: SelectableKind,
  connected: ProviderConnectivity | null,
  catalogue: readonly AiModelInfo[],
): ProviderOption[] {
  return (["gloo", "openrouter"] as const).map<ProviderOption>((provider) => {
    const label = PROVIDER_LABELS[provider];

    if (!connected) {
      return { provider, label, available: false, reason: "Checking…" };
    }
    if (!PROVIDERS_BY_KIND[kind].includes(provider)) {
      return {
        provider,
        label,
        available: false,
        reason:
          provider === "gloo"
            ? GLOO_UNSUPPORTED_REASON[kind]
            : "Not available for this kind",
      };
    }
    if (!connected[provider]) {
      return {
        provider,
        label,
        available: false,
        reason: "Not connected",
        connectable: true,
      };
    }
    if (modelsFor(kind, provider, catalogue).length === 0) {
      // Connected and allowed, but the live catalogue offers nothing — choosing it would
      // create a generation with no model id.
      return { provider, label, available: false, reason: "No models available" };
    }
    return { provider, label, available: true };
  });
}

export interface KindAvailability {
  enabled: boolean;
  /** Present whenever `enabled` is false. A disabled control with no stated reason reads
   *  as a bug, which is the dishonesty R5/R7 exist to remove. */
  reason?: string;
}

/** Shown when a kind has no connected provider and BOTH would do — "connect OpenRouter"
 *  would be a half-truth for `image`, where Gloo works equally well. */
const NO_PROVIDER_REASON = "No model provider connected";

/**
 * R5 / R7 / D2 / D3 — can this kind be GENERATED at all right now?
 *
 * ## Why this is a DIFFERENT question from `providerOptionsFor`
 *
 * `providerOptionsFor` answers "which provider TABS can be clicked", and it requires the
 * live catalogue to hold a model for that provider. This answers "should the `↻` / `▶`
 * ACTION button be live", and it is deliberately connection-only:
 *
 *  · it must work for `storyboard`, which has no selector and therefore no catalogue
 *    entries at all (the api narrows the catalogue to the selectable kinds) — a
 *    catalogue-aware rule would report `✦ Generate storyboard` as permanently dead;
 *  · a momentarily thin catalogue is not a reason to refuse to generate. An unconnected
 *    provider is, because the api answers `409 provider_not_connected` before creating a
 *    row.
 *
 * They must never CONTRADICT each other in the direction that matters — a clickable
 * provider tab above a dead action button — which is what `U-KA7` holds.
 *
 * ## `connected === null` disables with "Checking…", never with "not connected"
 *
 * The consequence is accepted deliberately: while the catalogue read is in flight or has
 * failed, every AI control is disabled and says "Checking…". That is NOT a regression —
 * today a failed read already yields `providerOptionsFor(kind, …, [])`, so every provider
 * was already unavailable. It is simply now honest about WHY.
 */
export function kindAvailability(
  kind: GenerationKindName,
  connected: ProviderConnectivity | null,
  // DELIBERATELY UNUSED, and kept in the signature for that reason: this rule must NOT
  // consult the catalogue (see the docblock — `storyboard` has no catalogue entries at all),
  // and taking the same arguments as `providerOptionsFor` is what makes the omission visible
  // at every call site rather than looking like something nobody thought about.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  catalogue: readonly AiModelInfo[],
): KindAvailability {
  if (!connected) return { enabled: false, reason: "Checking…" };

  const providers = providersForKind(kind);
  if (providers.some((p) => connected[p])) return { enabled: true };

  // Nothing viable. When the kind has exactly one possible provider the reason can name it,
  // which is the actionable form; when it has two, either would do and naming one would be
  // wrong.
  if (providers.length === 1) {
    return {
      enabled: false,
      reason: `${PROVIDER_LABELS[providers[0]!]} — not connected`,
    };
  }
  return { enabled: false, reason: NO_PROVIDER_REASON };
}

/**
 * The same rule, for a GENERATE BUTTON rather than for a picker — and it differs in exactly
 * one case: UNKNOWN connectivity leaves the button LIVE.
 *
 * ## Why the split exists
 *
 * The picker and the button are asking different things of the same fact.
 *
 *  · A picker with no catalogue has nothing to offer: choosing a provider whose models we
 *    do not have would produce a generation with no model id. "Checking…" and disabled is
 *    the honest state, and it is what has always shipped.
 *  · A generate button with no catalogue is fine. It runs on the COMMITTED manifest
 *    settings plus the BFF's own defaults; it does not read the catalogue at all. Three
 *    standing regression tests (`U-V69`/`U-V70`/`U-V71`) prove exactly that: a project with
 *    a committed voice id and a committed narration model generates correctly while the
 *    catalogue is in flight AND after the read has failed. That capability was won by
 *    fixing a real shipped bug.
 *
 * So refusing on `null` here would treat "we could not ask" as "the answer is no" — the
 * precise mistake this codebase keeps re-learning — and it would take a WORKING capability
 * away from any user whose `GET /api/ai/models` blipped, for a whole session, with the
 * button reading "Checking…" forever.
 *
 * The permissive direction is bounded and already covered: `POST /v1/ai/generations`
 * answers `409 provider_not_connected` before creating a row, so an unconnected user whose
 * catalogue read failed gets a clear, immediate refusal instead of a dead button. Same
 * shape as R3's guardrail, which allows on an unresolved connections read for the same
 * reason.
 *
 * One rule, one module: the Inspector's four action buttons, the empty-state
 * `✦ Generate storyboard`, and the studio context's dispatcher guards all call THIS, so
 * they cannot drift apart.
 */
export function generationActionAvailability(
  kind: GenerationKindName,
  connected: ProviderConnectivity | null,
  catalogue: readonly AiModelInfo[],
): KindAvailability {
  if (!connected) return { enabled: true };
  return kindAvailability(kind, connected, catalogue);
}

/** The BFF-published system defaults (`resolveGenerationTarget(kind)`), keyed by kind. */
export type GenerationDefaults = Partial<
  Record<string, { provider: AiProvider; model: string }>
>;

export interface ResolvedChoice {
  provider: AiProvider;
  model: string | null;
}

/**
 * What this kind will actually run on: the manifest choice if there is one, else the
 * system default — "each defaults to whatever the system currently uses today".
 *
 * The default is deliberately NOT written into the manifest until the user changes
 * something. A default frozen into a file committed to the user's repo stops being a
 * default: the deployment could never move it again.
 *
 * A persisted model that is no longer in the catalogue is KEPT rather than swapped.
 * Models get retired upstream between sessions, and silently substituting a different one
 * would change what the project generates with nothing on screen to say so.
 */
export function resolveChoice(
  kind: SelectableKind,
  settings: AiGenerationSettings | undefined,
  defaults: GenerationDefaults,
  catalogue: readonly AiModelInfo[],
): ResolvedChoice {
  const chosen = settings?.[kind];
  const fallback = defaults[kind];

  if (chosen) {
    if (chosen.model) return { provider: chosen.provider, model: chosen.model };
    // Provider chosen, model left to the system. Prefer the system default when it is on
    // the same provider; otherwise take the first catalogue model for that provider.
    if (fallback && fallback.provider === chosen.provider) {
      return { provider: chosen.provider, model: fallback.model };
    }
    const first = modelsFor(kind, chosen.provider, catalogue)[0];
    return { provider: chosen.provider, model: first?.id ?? null };
  }

  if (fallback) return { provider: fallback.provider, model: fallback.model };
  return { provider: "openrouter", model: null };
}

/** Is any selectable kind going to run on Gloo? Item 2: the faith-alignment control is
 *  shown only then, and never for OpenRouter. */
export function needsFaithAlignment(
  settings: AiGenerationSettings | undefined,
  defaults: GenerationDefaults,
): boolean {
  return SELECTABLE_KINDS.some((kind) => {
    const chosen = settings?.[kind];
    if (chosen) return chosen.provider === "gloo";
    return defaults[kind]?.provider === "gloo";
  });
}

/**
 * Apply a provider change, with the two consequences that are easy to forget:
 *
 *  1. **The model id is dropped.** A Gloo model id sent to OpenRouter is a 400 minutes
 *     later; the picker re-resolves a default for the new provider instead.
 *  2. **`faithAlignment` is cleared once nothing runs on Gloo.** Otherwise the manifest
 *     keeps a setting nothing reads, it rides into the user's committed repo, and it
 *     silently comes back into force the moment they switch back — a setting that
 *     reappears without being re-chosen.
 */
export function settingsAfterProviderChange(
  settings: AiGenerationSettings | undefined,
  kind: SelectableKind,
  provider: AiProvider,
  defaults: GenerationDefaults,
): AiGenerationSettings {
  const next: AiGenerationSettings = { ...(settings ?? {}), [kind]: { provider } };
  if (!needsFaithAlignment(next, defaults)) delete next.faithAlignment;
  return next;
}

/** Apply a model pin under whatever provider the kind is currently resolved to. */
export function settingsAfterModelChange(
  settings: AiGenerationSettings | undefined,
  kind: SelectableKind,
  provider: AiProvider,
  model: string | null,
): AiGenerationSettings {
  return {
    ...(settings ?? {}),
    [kind]: model ? { provider, model } : { provider },
  };
}

/** Set or clear the faith alignment. */
export function settingsAfterFaithAlignmentChange(
  settings: AiGenerationSettings | undefined,
  value: FaithAlignment | null,
): AiGenerationSettings {
  const next: AiGenerationSettings = { ...(settings ?? {}) };
  if (value) next.faithAlignment = value;
  else delete next.faithAlignment;
  return next;
}

/** True when nothing has been chosen — used to keep the block out of the manifest
 *  entirely rather than writing an empty object into the user's repo. */
export function isEmptySettings(settings: AiGenerationSettings | undefined): boolean {
  return !settings || Object.keys(settings).length === 0;
}
