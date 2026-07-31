import type { AiModelInfo } from "../api/contracts";

/**
 * The narrator-voice vocabulary — sourced LIVE from the provider, never asserted here.
 *
 * ## What this file used to be, and why that was wrong
 *
 * It held a curated per-model table: three families (`ORPHEUS` / `GROK` / `OPENAI`) plus a
 * `FALLBACK` for anything unmatched, each with hand-written names, descriptors, genders
 * and a `recommended` id. Its own header argued that a hardcoded table was "the only
 * option" because "no provider publishes a voice-enumeration API".
 *
 * **That claim was false, and the table was wrong for every model it claimed to cover.**
 * Verified live 2026-07-30: `GET /api/v1/models?output_modalities=speech` carries a
 * top-level `supported_voices` array on every entry, and it answers unauthenticated. There
 * is no `openai/` model in that catalogue at all — so `FALLBACK = OPENAI` matched nothing
 * real and *every* live speech model fell through to a list none of them declare. Measured
 * against `hexgrad/kokoro-82m`: six of the eight offered ids alias silently onto Kokoro
 * voices (both "Alloy" and "Shimmer" onto American FEMALE ones — hence the report of one
 * narrator for two different picks) and two hard-400 the whole generation.
 *
 * The user's instruction, verbatim:
 *
 *   > "we should not hardcode the IDs of anything from the openrouter API (where we're
 *   >  getting the narration generation). instead, we should always query the openrouter
 *   >  API to figure out which voices exist for the selected narration model when
 *   >  rendering the studio inspector ui"
 *
 * This is the same principle already enforced for scripture: which books a translation has
 * is YouVersion's fact to state, not a canon we hardcode.
 *
 * ## What this file is now
 *
 * Pure rules over `readonly string[] | null` — the vocabulary the api forwarded from the
 * provider. **It names no voice id**, and `U-V28` scans this source to keep it that way.
 *
 * ## Parsing a convention is not hardcoding ids
 *
 * `supported_voices` entries are plain strings for all 13 voice-bearing models; there is
 * no structured language or gender metadata anywhere on the catalogue (`architecture`,
 * `supported_parameters` and `default_parameters` were all checked). So LANGUAGE and
 * GENDER can only come from interpreting the names the provider returned.
 *
 * That is a different act from asserting which voices exist. We never claim a voice is
 * there; we group the ones the provider said are there. When the convention does not
 * match, the grouping says so rather than guessing, and the VOICE list still carries every
 * id — so a model with opaque names stays fully usable through one dropdown.
 */

export type VoiceGender = "male" | "female";

export interface ParsedVoiceId {
  /** The provider's own language letter — its token, not our label. */
  languageCode: string;
  gender: VoiceGender;
  /** The part after the underscore, used only as a display label. */
  name: string;
}

/**
 * `[lang][gender]_name` — the convention the narration model uses for all of its voices.
 *
 * Deliberately STRICT, and verified not to fire on any other model's convention:
 * `american_female` (Zonos), `en_paul_sad` (Voxtral), `aura-2-thalia-en` (Deepgram),
 * `Zephyr` (Gemini), `conversational_a` (Sesame) and the bare Orpheus/Grok names all
 * return `null`. A loose parse would invent a language for names that carry none, which is
 * the same class of lie as the deleted table.
 */
const CONVENTIONAL_ID = /^([a-z])([fm])_(.+)$/;

export function parseVoiceId(id: string): ParsedVoiceId | null {
  const m = CONVENTIONAL_ID.exec(id);
  if (!m) return null;
  return {
    languageCode: m[1],
    gender: m[2] === "m" ? "male" : "female",
    name: m[3],
  };
}

/**
 * The provider's language letter → a human name.
 *
 * Convention INTERPRETATION, the same permitted class as the parse above: it never asserts
 * which voices exist, it only names the groups the provider's own ids fall into. An
 * unrecognised letter is shown as the letter itself, upper-cased — the raw provider token
 * is the honest thing to display when we cannot name it.
 */
const LANGUAGE_LABELS: Record<string, string> = {
  a: "American English",
  b: "British English",
  e: "Spanish",
  f: "French",
  h: "Hindi",
  i: "Italian",
  j: "Japanese",
  p: "Portuguese",
  z: "Chinese",
};

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

export const GENDER_LABELS: Record<VoiceGender, string> = {
  male: "Male",
  female: "Female",
};

/**
 * The honest-unknown token, borrowed from this design system's existing vocabulary for it
 * (19a's `Provider publishes no pricing.` + `—`). It is not a language and does not
 * pretend to be one.
 */
export const UNKNOWN_LABEL = "—";

/** A voice's display name: the part after the convention's prefix, or the id verbatim. */
export function voiceLabel(id: string): string {
  const parsed = parseVoiceId(id);
  if (!parsed) return id;
  return parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
}

export interface VoiceGenderGroup {
  /** `null` when the id convention published no gender. */
  gender: VoiceGender | null;
  label: string;
  /** Alphabetically sorted, so "the first American male voice" is well-defined. */
  voiceIds: string[];
}

export interface VoiceGroup {
  /** `null` when the id convention published no language. */
  languageCode: string | null;
  label: string;
  genders: VoiceGenderGroup[];
}

/** Male first — the specified default — then female, then the unparsed bucket. */
const GENDER_ORDER: Array<VoiceGender | null> = ["male", "female", null];

/**
 * Group a provider vocabulary into the LANGUAGE → GENDER → VOICE cascade.
 *
 * Every published id lands in exactly one bucket, verbatim. Ids whose convention does not
 * parse collect in a single `languageCode: null` group with a `gender: null` bucket, which
 * is what keeps an opaque-id model fully usable rather than empty.
 *
 * `null`/`undefined`/`[]` all yield NO groups. That is not a degenerate case to paper
 * over: 6 of the 19 live speech models publish `supported_voices: null`, and offering
 * nothing — while saying so — is the only honest answer for them.
 */
export function buildVoiceGroups(
  voices: readonly string[] | null | undefined,
): VoiceGroup[] {
  if (!voices || voices.length === 0) return [];

  const byLanguage = new Map<string | null, Map<VoiceGender | null, string[]>>();
  for (const id of voices) {
    const parsed = parseVoiceId(id);
    const languageCode = parsed?.languageCode ?? null;
    const gender = parsed?.gender ?? null;
    let genders = byLanguage.get(languageCode);
    if (!genders) {
      genders = new Map();
      byLanguage.set(languageCode, genders);
    }
    const bucket = genders.get(gender);
    if (bucket) bucket.push(id);
    else genders.set(gender, [id]);
  }

  const groups: VoiceGroup[] = [];
  for (const [languageCode, genders] of byLanguage) {
    const buckets: VoiceGenderGroup[] = [];
    for (const gender of GENDER_ORDER) {
      const voiceIds = genders.get(gender);
      if (!voiceIds) continue;
      buckets.push({
        gender,
        label: gender ? GENDER_LABELS[gender] : UNKNOWN_LABEL,
        voiceIds: [...voiceIds].sort(),
      });
    }
    groups.push({
      languageCode,
      label: languageCode ? languageLabel(languageCode) : UNKNOWN_LABEL,
      genders: buckets,
    });
  }

  // Named languages alphabetically by the LABEL the user reads; the unparsed group last,
  // because it is a residue rather than a language.
  return groups.sort((a, b) => {
    if (a.languageCode === null) return 1;
    if (b.languageCode === null) return -1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * The user's specified defaults:
 *
 *   > "language (default to English), gender (default to male), voice (default to the
 *   >  alphabetically sorted first american/english male voice)"
 *
 * …superseded for the VOICE on 2026-07-31 (R9b): *"default the voice to American English ·
 * Male · Michael"*, honouring this module's own doctrine — prefer what EXISTS. See
 * {@link PREFERRED_VOICE_NAME}.
 *
 * The constants below are the provider's own language letter for American English and a
 * facet of its own ids — neither is a voice id, and neither asserts that any particular
 * voice exists. All three fall back to whatever the selected vocabulary actually has.
 */
export const DEFAULT_LANGUAGE_CODE = "a";
export const DEFAULT_GENDER: VoiceGender = "male";

/**
 * The narrator we PREFER, by display NAME — never by id.
 *
 * The user asked for the default voice to be American English / male / "Michael". The
 * obvious implementation is a `DEFAULT_VOICE_ID` constant, and it is exactly the mistake
 * this module was rewritten to remove: a curated table that ASSERTED which voices a model
 * has, and was wrong for every model it claimed to cover.
 *
 * So this is the `PREFERRED_TRANSLATION_ABBREVIATION = "ASV"` pattern from
 * `scripture-picker.ts` — a name resolved against whatever the live vocabulary actually
 * returned, with a documented fallback to what exists. A name is a preference; an id would
 * be a claim. `U-V76` proves the distinction rather than assuming it: this string is not
 * shaped like a provider voice id, so the standing `U-V28` guard still passes.
 *
 * Most models will not have it — 6 of the 19 live speech models publish no vocabulary at
 * all and the rest use different naming conventions — so the fallback arm is the common
 * case, not an edge one.
 */
export const PREFERRED_VOICE_NAME = "Michael";

/**
 * The voice to use from an already-narrowed bucket: the preferred NAME if this vocabulary
 * has it, else the first — today's exact behaviour, unchanged.
 *
 * ONE rule, used by `defaultSelection` AND by the picker's language and gender cascades.
 * Each of those three used to take `voiceIds[0]` independently; if only the default learned
 * the preference, the very first accent round-trip would silently drop the user back onto
 * the alphabetically-first voice and the picker would disagree with its own default.
 *
 * Matched through {@link voiceLabel}, case-insensitively, so the rule reads the provider's
 * own display name rather than assuming an id FORMAT — a model that names the same voice
 * differently still resolves, and one that does not simply falls through.
 */
export function preferredVoiceId(
  voiceIds: readonly string[] | null | undefined,
): string | null {
  if (!voiceIds || voiceIds.length === 0) return null;
  const preferred = voiceIds.find(
    (id) => voiceLabel(id).toLowerCase() === PREFERRED_VOICE_NAME.toLowerCase(),
  );
  return preferred ?? voiceIds[0]!;
}

export interface VoiceSelection {
  languageCode: string | null;
  gender: VoiceGender | null;
  voiceId: string;
}

/**
 * Where the three dropdowns land when nothing has been chosen.
 *
 * Every fallback is to what EXISTS rather than to a constant — the narration model has no
 * French male voice, so a cascade that assumed a fixed `[male, female]` pair would offer a
 * narrator that is not there. `null` when the vocabulary is empty: there is nothing to
 * default to, and saying so beats inventing.
 */
export function defaultSelection(
  groups: readonly VoiceGroup[],
): VoiceSelection | null {
  const group =
    groups.find((g) => g.languageCode === DEFAULT_LANGUAGE_CODE) ?? groups[0];
  if (!group) return null;
  const bucket =
    group.genders.find((b) => b.gender === DEFAULT_GENDER) ?? group.genders[0];
  const voiceId = preferredVoiceId(bucket?.voiceIds);
  if (!bucket || !voiceId) return null;
  return { languageCode: group.languageCode, gender: bucket.gender, voiceId };
}

/** Which language/gender a persisted id belongs to, or `null` if this vocabulary has no
 *  such id — which is exactly the state every pre-existing manifest is in. */
export function selectionFor(
  groups: readonly VoiceGroup[],
  voiceId: string,
): VoiceSelection | null {
  for (const group of groups) {
    for (const bucket of group.genders) {
      if (bucket.voiceIds.includes(voiceId)) {
        return { languageCode: group.languageCode, gender: bucket.gender, voiceId };
      }
    }
  }
  return null;
}

/**
 * THE INVARIANT: the result is always `null`, or a voice the target model accepts.
 *
 * This is what makes persisting a provider voice id safe. Without it, switching the speech
 * model would leave an id the new model has never heard of on the manifest, and the next
 * narration generation would be a hard provider 400 — or, worse and what actually
 * happened, would silently alias onto an unrelated voice.
 *
 * The old rule had four descending "nearest match" steps (same id → same display NAME →
 * same gender AND dramatic flag → same gender) and always returned SOMETHING, falling back
 * to a `recommended` id. Every step after the first read editorial metadata that no
 * provider publishes, so all four are gone. What is left is the only step that was ever
 * grounded in a provider fact — and when it does not match, the honest answer is NOTHING.
 *
 * Clearing is safe because it is never the end of the story: `regenerateNarration` sends
 * {@link effectiveVoiceId}, which supplies the target's own derived default. Compared
 * EXACTLY, never case-folded: this string is sent to the provider verbatim, and an id that
 * differs only in case is an id the provider does not have.
 */
export function remapVoice(
  currentVoiceId: string | null | undefined,
  toVoices: readonly string[] | null | undefined,
): string | null {
  if (!currentVoiceId) return null;
  return toVoices?.includes(currentVoiceId) ? currentVoiceId : null;
}

/**
 * What the generation will ACTUALLY narrate in — one rule, shared by the picker's
 * displayed selection and the outgoing request.
 *
 * The shipped picker read `selected = selectedVoiceId ?? recommended` for display while
 * omitting `voiceId` from the request whenever nothing had been picked. Two answers to one
 * question, and only one of them audible: the UI showed a voice as chosen and the provider
 * used its own. Sharing this function makes disagreeing impossible.
 *
 * It deliberately does NOT write to the manifest. A default frozen into a file committed
 * to the user's repo stops being a default — the deployment could never move it again.
 */
export function effectiveVoiceId(
  selectedVoiceId: string | null | undefined,
  voices: readonly string[] | null | undefined,
): string | null {
  const kept = remapVoice(selectedVoiceId, voices);
  if (kept) return kept;
  return defaultSelection(buildVoiceGroups(voices))?.voiceId ?? null;
}

/**
 * The vocabulary for a resolved speech model, straight off the live catalogue entry.
 *
 * All four "we cannot offer a vocabulary" states collapse to `null` on purpose: no model
 * resolved yet (the pre-`MODELS_LOADED` window), a model that is not in the catalogue, a
 * model that published nothing, and an empty catalogue. Borrowing another model's list —
 * which is precisely what the deleted `FALLBACK` did — is the one thing that must not
 * happen.
 */
export function voicesForModelId(
  modelId: string | null | undefined,
  models: readonly AiModelInfo[],
): readonly string[] | null {
  if (!modelId) return null;
  return models.find((m) => m.id === modelId)?.voices ?? null;
}
