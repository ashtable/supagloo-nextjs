/**
 * Feature 1 / figure 19b — the curated per-model narrator-voice catalogue.
 *
 * ## Why a hardcoded table is the only option
 *
 * `narratorVoice.description` was written, validated, persisted to jsonb, committed to
 * git, round-tripped through five schema mirrors and snapshotted into the gallery — and
 * read by ZERO provider-facing code. Every project narrated in `"alloy"`. The reason is
 * structural, not an oversight: OpenRouter's speech endpoint takes a NAMED voice, its
 * request body is exactly `{model, input, voice, response_format}` (there is not even an
 * unused `instructions`/`style` field a descriptor could travel through), and **no
 * provider publishes a voice-enumeration API** — verified live 2026-07-29. OpenRouter's
 * own TTS guide says *"Available voices vary by model — check each model's page"*, and a
 * repo-wide grep for `voices|voice_list|available_voices` returns zero.
 *
 * So the choice is: ship a curated table, or leave the control inert. **Do not invent a
 * `GET /voices` endpoint** (design-delta §2.7.1 flag F6).
 *
 * ## Why it lives HERE, in nextjs, and nowhere else
 *
 * This is a UI catalogue: which voices to OFFER, with names and descriptors and a
 * recommendation. The machine value the user picks (`voiceId`) is persisted on the
 * manifest and sent on the generation request, so dbos is a pure pass-through
 * (`synthesize.ts` / `render/audio.ts` read the id and fall back to the provider default)
 * and needs no copy of this table. One table, in the one repo that reads it — no
 * duplication to drift, and no db-lib release gating the feature's visible half.
 *
 * ## Provenance, honestly
 *
 * The **ids** are facts: they are each model's documented voice vocabulary. The
 * **descriptors and facets are EDITORIAL** — a curated list is a curated list, and the
 * three-word descriptors for the Orpheus voices are transcribed verbatim from figure 19b.
 * Where a provider does not publish a gender for a voice, the facet is `"unknown"` rather
 * than guessed; the `Male`/`Female` filters simply do not claim it, and `All` always shows
 * everything.
 *
 * ## Lint
 *
 * This file is keyed by model id and that is deliberate. The `no-model-ids` invariant
 * (design-delta §7, lint-enforced by `dbos/src/providers/no-model-ids.test.ts`, which
 * scans `dbos/src/providers/*.ts` only) exists so nothing FREEZES A MODEL CHOICE into a
 * call path. Nothing here selects a model: this is a lookup FROM whichever model the
 * catalogue resolved, and an unknown model degrades to a generic list rather than
 * steering anyone toward a known one.
 */

export type VoiceGender = "male" | "female" | "unknown";

export interface SpeechVoice {
  /** The provider voice id — the ONLY value ever sent to a provider. */
  id: string;
  /** Display name (19b's rows: `Zac`, `Tara`, …). */
  name: string;
  /** 19b's three-word sub-line, e.g. `"deep · commanding · male"`. Editorial. */
  descriptor: string;
  gender: VoiceGender;
  /** Feeds 19b's `Dramatic` filter chip. Editorial. */
  dramatic: boolean;
}

export interface SpeechVoiceSet {
  /** Human label for the family, used only in comments/diagnostics. */
  family: string;
  /** Matched against the resolved model id, case-insensitively, as a substring. */
  match: readonly string[];
  /** The id 19b badges `RECOMMENDED`. Exactly one per set (pinned by a test). */
  recommended: string;
  voices: readonly SpeechVoice[];
}

/**
 * Canopy Labs Orpheus 3B — the model figure 19b draws (`orpheus-3b` in its header tag).
 *
 * Eight voices, which is where 19a's `"8 voices for this model"` and `"Show all 8 voices"`
 * come from; 19b draws six of them. The count is DERIVED from this list and never printed
 * as a literal (flag F7).
 *
 * The six descriptors 19b specifies are transcribed verbatim. `leah` and `zoe` — the two
 * the figure did not draw — get plain descriptors in the same register rather than
 * invented character.
 */
const ORPHEUS: SpeechVoiceSet = {
  family: "Orpheus",
  match: ["orpheus"],
  recommended: "zac",
  voices: [
    { id: "zac", name: "Zac", descriptor: "deep · commanding · male", gender: "male", dramatic: true },
    { id: "tara", name: "Tara", descriptor: "warm · measured · female", gender: "female", dramatic: false },
    { id: "leo", name: "Leo", descriptor: "gravelly · weathered · male", gender: "male", dramatic: true },
    { id: "mia", name: "Mia", descriptor: "bright · hopeful · female", gender: "female", dramatic: false },
    { id: "jess", name: "Jess", descriptor: "soft · intimate · female", gender: "female", dramatic: false },
    { id: "dan", name: "Dan", descriptor: "steady · plainspoken · male", gender: "male", dramatic: false },
    { id: "leah", name: "Leah", descriptor: "clear · even · female", gender: "female", dramatic: false },
    { id: "zoe", name: "Zoe", descriptor: "light · quick · female", gender: "female", dramatic: false },
  ],
};

/**
 * OpenAI's TTS voices (`openai/gpt-4o-mini-tts` and siblings). `alloy` is the value this
 * codebase already shipped as `DEFAULT_NARRATION_VOICE`, so it stays the recommendation —
 * changing the default narrator of every existing project is not this feature's job.
 *
 * OpenAI publishes the NAMES but not a gender per voice. The four whose perceived gender
 * is not clearly documented are `"unknown"` rather than guessed: a filter that quietly
 * mislabels a voice is worse than one that returns fewer rows.
 */
const OPENAI: SpeechVoiceSet = {
  family: "OpenAI",
  match: ["openai/"],
  recommended: "alloy",
  voices: [
    { id: "alloy", name: "Alloy", descriptor: "balanced · neutral · versatile", gender: "unknown", dramatic: false },
    { id: "onyx", name: "Onyx", descriptor: "deep · authoritative · male", gender: "male", dramatic: true },
    { id: "echo", name: "Echo", descriptor: "even · articulate · male", gender: "male", dramatic: false },
    { id: "fable", name: "Fable", descriptor: "expressive · storytelling", gender: "unknown", dramatic: true },
    { id: "nova", name: "Nova", descriptor: "bright · energetic · female", gender: "female", dramatic: false },
    { id: "shimmer", name: "Shimmer", descriptor: "gentle · airy · female", gender: "female", dramatic: false },
    { id: "ash", name: "Ash", descriptor: "measured · grounded", gender: "unknown", dramatic: false },
    { id: "sage", name: "Sage", descriptor: "calm · reflective", gender: "unknown", dramatic: false },
  ],
};

/** xAI's Grok voice model. The five names verified live 2026-07-29 (brief §2.2). Their
 *  perceived genders are not published, so only the descriptors are claimed. */
const GROK: SpeechVoiceSet = {
  family: "Grok",
  match: ["grok-voice", "x-ai/"],
  recommended: "rex",
  voices: [
    { id: "Rex", name: "Rex", descriptor: "firm · declarative", gender: "unknown", dramatic: true },
    { id: "Eve", name: "Eve", descriptor: "warm · conversational", gender: "unknown", dramatic: false },
    { id: "Ara", name: "Ara", descriptor: "clear · composed", gender: "unknown", dramatic: false },
    { id: "Sal", name: "Sal", descriptor: "relaxed · easy", gender: "unknown", dramatic: false },
    { id: "Leo", name: "Leo", descriptor: "steady · assured", gender: "unknown", dramatic: false },
  ],
};

/**
 * The fallback for a speech model this table does not know.
 *
 * It is OpenAI's set because `alloy` is what every provider-facing call in this codebase
 * has actually been sending, and because "the voice we were already using" is the only
 * option that cannot make an unknown model WORSE than it is today. An unknown model with
 * an unknown vocabulary would otherwise have to offer nothing at all, which would make the
 * inspector's voice block look broken.
 */
const FALLBACK = OPENAI;

const VOICE_SETS: readonly SpeechVoiceSet[] = [ORPHEUS, GROK, OPENAI];

/** The voice set for a resolved speech model id. Never empty. */
export function voiceSetForModel(modelId: string | null | undefined): SpeechVoiceSet {
  if (!modelId) return FALLBACK;
  const needle = modelId.toLowerCase();
  return (
    VOICE_SETS.find((set) => set.match.some((m) => needle.includes(m))) ?? FALLBACK
  );
}

/** The voices to offer for a model. 19a's "N voices for this model" counts THIS. */
export function voicesForModel(
  modelId: string | null | undefined,
): readonly SpeechVoice[] {
  return voiceSetForModel(modelId).voices;
}

/** The id 19b badges `RECOMMENDED`, and the fallback when a remap finds no match. */
export function recommendedVoiceFor(modelId: string | null | undefined): string {
  return voiceSetForModel(modelId).recommended;
}

/**
 * 19b's stated rule, verbatim: *"Change the speech model and the voices swap; the
 * previously chosen voice maps to the nearest match or falls back to the recommended
 * one."*
 *
 * This is the whole reason the id can be persisted safely. Without it, switching the
 * speech model would leave a voice id the new model has never heard of on the manifest,
 * and the next narration generation would be a hard provider 400 — the feature would
 * break the thing it was added to fix.
 *
 * "Nearest match", in descending order of confidence:
 *   1. the SAME id, if the new model happens to have it (case-insensitively — `Leo`
 *      exists in both the Grok and Orpheus vocabularies);
 *   2. the same display NAME;
 *   3. the same gender AND dramatic flag;
 *   4. the same gender;
 *   5. the new model's recommended voice.
 *
 * Deliberately never returns a voice from the OLD model: the whole point is that the
 * result is always sendable to the NEW one.
 */
export function remapVoice(
  currentVoiceId: string | null | undefined,
  fromModelId: string | null | undefined,
  toModelId: string | null | undefined,
): string {
  const target = voiceSetForModel(toModelId);
  if (!currentVoiceId) return target.recommended;

  const sameId = target.voices.find(
    (v) => v.id.toLowerCase() === currentVoiceId.toLowerCase(),
  );
  if (sameId) return sameId.id;

  const current = voicesForModel(fromModelId).find(
    (v) => v.id.toLowerCase() === currentVoiceId.toLowerCase(),
  );
  if (!current) return target.recommended;

  const sameName = target.voices.find(
    (v) => v.name.toLowerCase() === current.name.toLowerCase(),
  );
  if (sameName) return sameName.id;

  if (current.gender !== "unknown") {
    const exact = target.voices.find(
      (v) => v.gender === current.gender && v.dramatic === current.dramatic,
    );
    if (exact) return exact.id;
    const byGender = target.voices.find((v) => v.gender === current.gender);
    if (byGender) return byGender.id;
  }

  return target.recommended;
}

/** 19b's four filter chips. Single-select (a radio group, not checkboxes). */
export type VoiceFilter = "all" | "male" | "female" | "dramatic";
export const VOICE_FILTERS: readonly VoiceFilter[] = [
  "all",
  "male",
  "female",
  "dramatic",
];

/**
 * 19b's `🔍 Filter voices…` box + the active chip, applied together.
 *
 * They are independent, always-visible controls in the figure, so they COMPOSE rather
 * than override each other. The search matches the name and the descriptor, because the
 * descriptor is where the words a user would actually type ("deep", "warm", "female")
 * live.
 */
export function filterVoices(
  voices: readonly SpeechVoice[],
  filter: VoiceFilter,
  search: string,
): readonly SpeechVoice[] {
  const q = search.trim().toLowerCase();
  return voices.filter((v) => {
    if (filter === "male" && v.gender !== "male") return false;
    if (filter === "female" && v.gender !== "female") return false;
    if (filter === "dramatic" && !v.dramatic) return false;
    if (!q) return true;
    return (
      v.name.toLowerCase().includes(q) || v.descriptor.toLowerCase().includes(q)
    );
  });
}
