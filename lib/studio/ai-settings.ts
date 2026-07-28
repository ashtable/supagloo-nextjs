import type {
  AiGenerationSettings,
  AiModelInfo,
  AiProvider,
  FaithAlignment,
} from "../api/contracts";
import type { ConnectionsState } from "../connections/connections-model";

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

/** The design's own words for these, in the design's own vocabulary ("faith-aligned",
 *  never "denomination" and never "tradition"). */
export const FAITH_ALIGNMENT_LABELS: Record<FaithAlignment, string> = {
  not_faith_specific: "No specific tradition",
  evangelical: "Evangelical",
  mainline: "Mainline Protestant",
  catholic: "Catholic",
};

/**
 * The kind→provider compatibility matrix, hand-mirrored from db-lib `AI_PROVIDERS_BY_KIND`
 * (this repo deliberately does not import db-lib; every wire contract here is a hand copy).
 *
 * `image` carries BOTH providers as of 2026-07-28: Gloo's catalogue has 11 image-capable
 * models and a real PNG was generated from one — they simply route through
 * `POST /ai/v2/responses` rather than chat/completions, which is why the capability went
 * unnoticed. The other three stay openrouter-only and that is a measured fact, not
 * caution: Gloo's catalogue has zero audio/video entries and those routes answer 404
 * (absent) rather than 405.
 *
 * The api enforces this at enqueue (422). It is mirrored here so the picker can explain
 * WHY an option is unavailable instead of silently omitting it.
 */
const PROVIDERS_BY_KIND: Record<SelectableKind, readonly AiProvider[]> = {
  image: ["gloo", "openrouter"],
  narration: ["openrouter"],
  music: ["openrouter"],
  video: ["openrouter"],
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
 * `connections === null` means the session bootstrap has not answered yet — NOT
 * "signed out". Rendering an unresolved state as a hard "not connected" with a `Link ▸`
 * would tell a connected user to go and connect. Same trap as `isAuthed === false`.
 */
export function providerOptionsFor(
  kind: SelectableKind,
  connections: ConnectionsState | null,
  catalogue: readonly AiModelInfo[],
): ProviderOption[] {
  return (["gloo", "openrouter"] as const).map<ProviderOption>((provider) => {
    const label = PROVIDER_LABELS[provider];

    if (!connections) {
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
    if (connections[provider]?.status !== "connected") {
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
