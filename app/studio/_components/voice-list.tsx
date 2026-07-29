"use client";

import { useState } from "react";
import styles from "../studio.module.css";
import {
  VOICE_FILTERS,
  filterVoices,
  recommendedVoiceFor,
  voicesForModel,
  type VoiceFilter,
} from "@/lib/studio/speech-voices";

/**
 * Figure 19b — the curated narrator-voice list that replaces the free-text descriptor.
 *
 * ## What is transcribed and what is not
 *
 * TRANSCRIBED from 19b: the filter field, the four `All / Male / Female / Dramatic` chips
 * as a single-select radio group, the row geometry (avatar · name · sub-line), the rust
 * border + tint for the selected row, and the `RECOMMENDED` badge. Geometry is taken
 * literally; **colour is translated** to the studio's Wilderness tokens — 19a/19b/20a/20b
 * are a THIRD dark palette, consistently a few units off Wilderness (`#17120f` vs
 * `--ws-bg #16110d`, `#c0392b` vs `--ws-rust #c6552b`, `#d9a05b` vs `--ws-amber #e6a43b`),
 * and the house rule at `scripture-picker.tsx:56` is take the geometry, translate the
 * colour.
 *
 * NOT BUILT, deliberately (settled decision D3, and independently flagged in the design
 * review):
 *   - the `♪ ▶ / ❙❙` per-row audio PREVIEW. It needs sample assets that do not exist, a
 *     place to store them, and provider spend per voice per model.
 *   - the `PACE 0.92×` slider. `RequestSpeechArgs` is `{modelId, input, voice?}` and
 *     `media-client.test.ts` pins the request body to `{model, input, voice,
 *     response_format}` with an explicit assertion that no other field is carried. There
 *     is no parameter to send it to and no manifest field to keep it in. (The figure's own
 *     HTML comment mentions a pitch control; that is undesigned and is not built either.)
 *
 * 19a's "8 voices for this model" is DERIVED from the catalogue here, never printed as a
 * literal — the figure asserts 8 and specifies 6, so the number has to come from the data.
 */

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const MONO = "ui-monospace, Menlo, monospace";

const CHIP_LABEL: Record<VoiceFilter, string> = {
  all: "All",
  male: "Male",
  female: "Female",
  dramatic: "Dramatic",
};

export default function VoiceList({
  modelId,
  selectedVoiceId,
  onSelect,
}: {
  /** The RESOLVED speech model — the voices come from it, which is why 19a orders the
   *  narration card provider → model → voice. */
  modelId: string | null;
  selectedVoiceId: string | undefined;
  onSelect: (voiceId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<VoiceFilter>("all");

  const all = voicesForModel(modelId);
  const recommended = recommendedVoiceFor(modelId);
  const shown = filterVoices(all, filter, search);
  // The effective selection: an unset project shows the recommendation as selected rather
  // than nothing, because that IS what the generation will use.
  const selected = selectedVoiceId ?? recommended;

  return (
    <div data-testid="voice-list" data-voice-count={all.length}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            fontFamily: SEMI,
            fontWeight: 700,
            fontSize: 9.5,
            letterSpacing: ".16em",
            color: "var(--ws-dim)",
          }}
        >
          {"VOICE"}
        </span>
        <span style={{ fontSize: 10, color: "var(--ws-dim-2)" }}>
          {`${all.length} voices for this model`}
        </span>
      </div>

      <input
        data-testid="voice-filter"
        aria-label="Filter voices"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Filter voices…"
        style={{
          width: "100%",
          height: 36,
          border: "1px solid rgba(230,180,120,.18)",
          borderRadius: 9,
          background: "#0f0b07",
          padding: "0 11px",
          fontSize: 12.5,
          color: "#e8dcc6",
          outline: "none",
        }}
      />

      {/* Single-select, a radio group rather than checkboxes — 19b draws exactly one chip
          active and the others plain. */}
      <div
        role="radiogroup"
        aria-label="Voice category"
        style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}
      >
        {VOICE_FILTERS.map((f) => {
          const active = f === filter;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`voice-chip-${f}`}
              data-active={active ? "true" : "false"}
              onClick={() => setFilter(f)}
              className={styles.hoverable}
              style={{
                padding: "5px 11px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: active ? 700 : 600,
                color: active ? "#fff" : "var(--ws-dim)",
                background: active ? "var(--ws-rust)" : "transparent",
                border: active ? "none" : "1px solid rgba(230,180,120,.18)",
              }}
            >
              {CHIP_LABEL[f]}
            </button>
          );
        })}
      </div>

      <div
        style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}
      >
        {shown.map((voice) => {
          const isSelected = voice.id === selected;
          return (
            <button
              key={voice.id}
              type="button"
              data-testid={`voice-row-${voice.id}`}
              data-selected={isSelected ? "true" : "false"}
              aria-pressed={isSelected}
              onClick={() => onSelect(voice.id)}
              className={styles.hoverable}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                // Selection is marked TWICE — border/fill and weight — never colour alone
                // (design-system rule 7).
                border: isSelected
                  ? "1.5px solid var(--ws-rust)"
                  : "1px solid rgba(230,180,120,.14)",
                background: isSelected ? "rgba(198,85,43,.10)" : "transparent",
                color: "#f1e7d6",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  flex: "none",
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  color: isSelected ? "#fff" : "var(--ws-dim)",
                  background: isSelected
                    ? "linear-gradient(150deg,var(--ws-amber),#6d3b26)"
                    : "rgba(230,180,120,.10)",
                }}
              >
                {"♪"}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      fontWeight: isSelected ? 700 : 600,
                      fontSize: 13,
                      color: isSelected ? "#f1e7d6" : "#e8dcc6",
                    }}
                  >
                    {voice.name}
                  </span>
                  {voice.id === recommended ? (
                    <span
                      data-testid="voice-recommended"
                      style={{
                        fontWeight: 600,
                        fontSize: 10,
                        color: "var(--ws-amber)",
                        border: "1px solid rgba(230,164,59,.4)",
                        borderRadius: 20,
                        padding: "1px 7px",
                      }}
                    >
                      {"RECOMMENDED"}
                    </span>
                  ) : null}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--ws-dim)",
                    marginTop: 1,
                  }}
                >
                  {voice.descriptor}
                </span>
              </span>
            </button>
          );
        })}
        {shown.length === 0 ? (
          <span
            data-testid="voice-none"
            style={{ fontSize: 11.5, color: "var(--ws-dim)", padding: "8px 2px" }}
          >
            {"No voices match that filter."}
          </span>
        ) : null}
      </div>

      {/* 19b prints the model id as an at-a-glance context tag. The FULL id, not the
          figure's hand-shortened "orpheus-3b" — shortening per model is a rule nobody can
          apply consistently, and the id is what a support conversation needs. */}
      {modelId ? (
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
      ) : null}
    </div>
  );
}
