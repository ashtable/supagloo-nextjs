"use client";

import { useState } from "react";
import {
  buildVoiceGroups,
  effectiveVoiceId,
  selectionFor,
  voiceLabel,
  type VoiceGender,
  type VoiceGroup,
} from "@/lib/studio/speech-voices";

/**
 * The narrator-voice picker — three cascading dropdowns over the LIVE provider vocabulary.
 *
 * ## What this replaces, and on whose instruction
 *
 * Figure 19b drew a filterable row list: a `🔍 Filter voices…` box, four
 * `All / Male / Female / Dramatic` chips, a three-word descriptor under each name, and a
 * `RECOMMENDED` badge. All of it is gone, on a direct user directive:
 *
 *   > "lets use 3 dropdown lists for the voice picker: language (default to English),
 *   >  gender (default to male), voice (default to the alphabetically sorted first
 *   >  american/english male voice)"
 *   > "no need for any other filter chips for the voice picker"
 *
 * The `RECOMMENDED` badge went with them, and that is Step 6's call rather than the
 * user's: no provider publishes a recommendation, so it was a property of the curated
 * table — and it was already wrong, badging a voice the resolved model does not have.
 *
 * ## Where the rows come from now
 *
 * `voices` is the provider's own `supported_voices` for the resolved narration model,
 * carried live through the api's speech-catalogue read. This component asserts nothing
 * about which voices exist; `lib/studio/speech-voices.ts` only GROUPS what arrived, and
 * says so wherever the id convention publishes no language or gender.
 *
 * ## The two honest-empty states, which are not the same state
 *
 *  - **`modelId === null`** — the catalogue has not landed yet. Until `MODELS_LOADED`,
 *    `resolveChoice("narration", …)` resolves no model at all. The shipped picker
 *    accepted a pick in that window against a fallback list resolved for NO model, so a
 *    choice made there meant nothing.
 *  - **`voices` empty** — the model published no vocabulary. Six of the nineteen live
 *    speech models answer exactly that. Offering nothing is the true statement; offering
 *    another model's list is what caused the bug this run fixes.
 *
 * ## Still not built, deliberately
 *
 * 19b's per-row `♪ ▶ / ❙❙` audio preview (it needs sample assets and provider spend per
 * voice per model) and its `PACE 0.92×` slider (there is no parameter to send it to —
 * `media-client.test.ts` pins the speech body to exactly
 * `{model, input, voice, response_format}`). `U-V50` is a negative test so a later pass
 * does not "restore" them from the figure.
 */

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const MONO = "ui-monospace, Menlo, monospace";

/** `ai-settings-panel.tsx`'s BOX — the studio's established select shape. These three
 *  dropdowns sit directly under that panel's PROVIDER/MODEL selects, so they are the same
 *  control and must look like it. */
const BOX: React.CSSProperties = {
  width: "100%",
  height: 34,
  border: "1px solid rgba(230,180,120,.24)",
  borderRadius: 9,
  background: "#0f0b07",
  padding: "0 10px",
  color: "#f1e7d6",
  fontSize: 12.5,
  fontWeight: 600,
  outline: "none",
  appearance: "none",
};

const FIELD_LABEL: React.CSSProperties = {
  fontFamily: SEMI,
  fontWeight: 700,
  fontSize: 9.5,
  letterSpacing: ".16em",
  color: "var(--ws-dim)",
};

/** The bucket a voice should land in when the LANGUAGE changes: the gender the user is
 *  already on if the new language has it, else that language's own first bucket. */
function bucketFor(group: VoiceGroup, gender: VoiceGender | null) {
  return group.genders.find((b) => b.gender === gender) ?? group.genders[0];
}

export default function VoiceList({
  modelId,
  voices,
  selectedVoiceId,
  onSelect,
}: {
  /** The RESOLVED speech model. `null` until the catalogue lands — 19a orders the
   *  narration card provider → model → voice "because the voice options come FROM the
   *  model", and before a model resolves there are no options to come from. */
  modelId: string | null;
  /** The provider's `supported_voices` for {@link modelId}; `null` when it published none. */
  voices: readonly string[] | null;
  selectedVoiceId: string | undefined;
  onSelect: (voiceId: string) => void;
}) {
  /**
   * The in-session pick, held here because the parent may not have committed it yet.
   *
   * It is dropped automatically once it is no longer a voice THIS vocabulary offers —
   * which is exactly what happens when the narration model changes underneath the picker.
   * So there is no stale-selection effect to write and no dependency array to get wrong:
   * the vocabulary itself invalidates it.
   */
  const [pending, setPending] = useState<string | null>(null);

  const groups = buildVoiceGroups(voices);
  const resolved = effectiveVoiceId(selectedVoiceId, voices);
  const current = pending && voices?.includes(pending) ? pending : resolved;

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={FIELD_LABEL}>{"VOICE"}</span>
      {voices && voices.length > 0 ? (
        <span style={{ fontSize: 10, color: "var(--ws-dim-2)" }}>
          {`${voices.length} voices for this model`}
        </span>
      ) : null}
    </div>
  );

  const empty = (message: string) => (
    <div data-testid="voice-list" data-voice-count={voices?.length ?? 0}>
      {header}
      <div
        data-testid="voice-empty"
        style={{ fontSize: 11.5, color: "var(--ws-dim)", padding: "4px 2px" }}
      >
        {message}
      </div>
    </div>
  );

  // Order matters: no resolved model is a DIFFERENT statement from a model with no
  // voices, and collapsing them would tell a user whose catalogue is still in flight that
  // their model has no narrators.
  if (!modelId) return empty("Loading voices…");
  if (groups.length === 0 || !current) {
    return empty("This model publishes no selectable voices.");
  }

  const selection = selectionFor(groups, current);
  const group =
    groups.find((g) => g.languageCode === selection?.languageCode) ?? groups[0];
  const bucket = bucketFor(group, selection?.gender ?? null);

  const report = (voiceId: string) => {
    setPending(voiceId);
    onSelect(voiceId);
  };

  /** Every cascade step reports the voice it RESOLVED to, not just the leaf select — the
   *  parent persists a voice id, so a language change that reported nothing would leave a
   *  voice from the previous language on the manifest. */
  const pickLanguage = (code: string) => {
    const next = groups.find((g) => (g.languageCode ?? "") === code);
    const nextBucket = next && bucketFor(next, bucket?.gender ?? null);
    if (nextBucket?.voiceIds[0]) report(nextBucket.voiceIds[0]);
  };

  const pickGender = (value: string) => {
    const next = group.genders.find((b) => (b.gender ?? "") === value);
    if (next?.voiceIds[0]) report(next.voiceIds[0]);
  };

  return (
    <div data-testid="voice-list" data-voice-count={voices?.length ?? 0}>
      {header}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={FIELD_LABEL}>{"LANGUAGE"}</span>
          <select
            data-testid="voice-language"
            aria-label="Narrator language"
            value={group.languageCode ?? ""}
            onChange={(e) => pickLanguage(e.target.value)}
            style={BOX}
          >
            {groups.map((g) => (
              <option key={g.languageCode ?? "unknown"} value={g.languageCode ?? ""}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={FIELD_LABEL}>{"GENDER"}</span>
          {/* Populated from what THIS language has, never from a fixed pair: the narration
              model publishes no French male voice, and offering one would be a control
              whose pick cannot be honoured. */}
          <select
            data-testid="voice-gender"
            aria-label="Narrator gender"
            value={bucket?.gender ?? ""}
            onChange={(e) => pickGender(e.target.value)}
            style={BOX}
          >
            {group.genders.map((b) => (
              <option key={b.gender ?? "unknown"} value={b.gender ?? ""}>
                {b.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={FIELD_LABEL}>{"VOICE"}</span>
          <select
            data-testid="voice-select"
            aria-label="Narrator voice"
            value={current}
            onChange={(e) => report(e.target.value)}
            style={BOX}
          >
            {(bucket?.voiceIds ?? []).map((id) => (
              <option key={id} value={id}>
                {voiceLabel(id)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 19b prints the model id as an at-a-glance context tag. The FULL id, not the
          figure's hand-shortened "orpheus-3b" — shortening per model is a rule nobody can
          apply consistently, and the id is what a support conversation needs. */}
      <div
        data-testid="voice-model-tag"
        style={{
          marginTop: 8,
          fontFamily: MONO,
          fontSize: 10.5,
          color: "var(--ws-dim-2)",
        }}
      >
        {modelId}
      </div>
    </div>
  );
}
