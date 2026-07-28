"use client";

import { useStudio } from "./studio-context";
import { useOptionalSession } from "@/app/_components/session-provider";
import {
  FAITH_ALIGNMENTS,
  FAITH_ALIGNMENT_LABELS,
  SELECTABLE_KINDS,
  modelsFor,
  needsFaithAlignment,
  providerOptionsFor,
  resolveChoice,
  type ProviderOption,
  type SelectableKind,
} from "@/lib/studio/ai-settings";
import {
  estimateGenerationCost,
  renderCostValue,
} from "@/lib/studio/cost-estimate";
import type { AiProvider, FaithAlignment } from "@/lib/api/contracts";

/**
 * The Inspector's `GENERATION · whole video` section — genesis-1 items 1, 2 and 3.
 *
 * ── This is an EXTENSION, not a transcription ──────────────────────────────────────
 * `docs/design-delta.md` §2.7.1 records inspector screen `13b` as TRANSCRIBED, and `13b`
 * has exactly five sections, no gear, no tabs and no overflow menu. A search of every
 * studio turn found zero provider/model pickers, zero occurrences of
 * catholic/tradition/denomination, and zero occurrences of cost/price/estimate. So the
 * SECTION itself, the faith-alignment control and the cost readout are inventions.
 *
 * What is composed from drawn precedent rather than invented:
 *   · the `· whole video` scope qualifier — 13b's own answer to "a project-wide setting
 *     inside a scene panel", on NARRATOR VOICE. Reused rather than replaced with a new
 *     scoping mechanism.
 *   · the GOLD section label — the design's rule that gold marks an AI-driven section.
 *   · the segmented switch for 2–3 exclusive word options — 13a's `flex:1` full-width
 *     variant, which is what lets an unavailable provider stay VISIBLE.
 *   · present-but-disabled = `opacity:.5` + a neutral gray reason badge + plain language
 *     (13a's repo list, "Pattern B"), with 10a's `Link ▸` escape hatch ("Pattern A") only
 *     where linking is what the user actually needs to do.
 *   · the stat row (title + sub left, value right) for the read-only cost — 13b's
 *     `Duration` row.
 *   · the bare names `Gloo AI` / `OpenRouter`, the design's committed vocabulary.
 *
 * ── Colour ─────────────────────────────────────────────────────────────────────────
 * `13b` is drawn in the site `--sg-*` skin; the SHIPPED studio is the t5 "Wilderness"
 * palette. 13b is used here for structure, section order, label vocabulary and control
 * SHAPE — never for colour. Every value below is the shipped one, and the select copies
 * `scripture-picker.tsx`'s `Field` literally.
 */

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const MONO = "ui-monospace, Menlo, monospace";

const LABEL: React.CSSProperties = {
  fontFamily: SEMI,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: ".16em",
  color: "#a99b85",
  marginBottom: 5,
};
const GOLD_LABEL: React.CSSProperties = { ...LABEL, color: "#e6a43b" };

/** `scripture-picker.tsx`'s BOX, verbatim — the literal precedent for a studio select. */
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

const KIND_LABELS: Record<SelectableKind, string> = {
  image: "SCENE IMAGE",
  narration: "NARRATION",
  music: "MUSIC",
  video: "SCENE VIDEO",
};

/** The design's disabled-state badge: neutral gray, 700/10px, never red — red is
 *  reserved for "not linked", which is a different (actionable) condition. */
function ReasonBadge({ testid, reason }: { testid: string; reason: string }) {
  return (
    <span
      data-testid={testid}
      style={{
        fontFamily: SEMI,
        fontWeight: 700,
        fontSize: 10,
        letterSpacing: ".06em",
        color: "#a99b85",
        background: "rgba(230,180,120,.10)",
        borderRadius: 6,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {reason}
    </span>
  );
}

/** One kind's provider switch: BOTH providers always rendered, the unavailable one at
 *  `opacity:.5` with its reason beside it. Hiding it would leave the user unable to
 *  discover that the option exists at all — the whole point of 13a's Pattern B. */
function ProviderSwitch({
  kind,
  options,
  selected,
  onSelect,
}: {
  kind: SelectableKind;
  options: ProviderOption[];
  selected: AiProvider;
  onSelect: (provider: AiProvider) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {options.map((option) => {
          const isSelected = option.available && option.provider === selected;
          return (
            <button
              key={option.provider}
              type="button"
              data-testid={`ai-provider-${kind}-${option.provider}`}
              data-available={option.available ? "true" : "false"}
              data-selected={isSelected ? "true" : "false"}
              disabled={!option.available}
              aria-pressed={isSelected}
              onClick={() => onSelect(option.provider)}
              style={{
                flex: 1,
                height: 30,
                borderRadius: 8,
                fontFamily: SEMI,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: ".06em",
                color: isSelected ? "#f1e7d6" : "#a99b85",
                background: isSelected ? "rgba(198,85,43,.16)" : "#0f0b07",
                border: isSelected
                  ? "1.5px solid #c6552b"
                  : "1px solid rgba(230,180,120,.24)",
                opacity: option.available ? 1 : 0.5,
                cursor: option.available ? "pointer" : "not-allowed",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {options
        .filter((o) => !o.available && o.reason)
        .map((o) => (
          <div
            key={o.provider}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <ReasonBadge
              testid={`ai-provider-reason-${kind}-${o.provider}`}
              reason={`${o.label} — ${o.reason}`}
            />
            {/* Pattern A's escape hatch, and ONLY where linking is the fix. There is
                nothing useful to link for "Gloo has no speech models". */}
            {o.connectable ? (
              <a
                data-testid={`ai-link-${o.provider}`}
                href="/profile"
                style={{ fontSize: 11, fontWeight: 700, color: "#e6a43b" }}
              >
                {"Link ▸"}
              </a>
            ) : null}
          </div>
        ))}
    </div>
  );
}

export default function AiSettingsPanel() {
  const { state, project, setAiProvider, setAiModel, setFaithAlignment } = useStudio();
  // The NON-throwing read. This panel already models "the session is not known yet" and
  // renders it as "Checking…" with every provider disabled — and that is the right answer
  // for "no provider in the tree" too. Crashing the whole editor over a settings panel
  // would be a worse failure than showing that state.
  const session = useOptionalSession();

  // Same gate as every other AI control: a REAL project only. The mock catalogue keeps
  // the byte-for-byte 13b inspector (mock-lane e2e specs assert its exact textContent),
  // and that lane's zero-egress guarantee depends on this section never mounting there.
  if (!project.manifest) return null;

  const catalogue = state.modelCatalogue;
  const models = catalogue?.models ?? [];
  const defaults = catalogue?.defaults ?? {};
  const settings = state.storyboard.aiSettings;

  // `isAuthed === false` also means "we have not asked yet"; the same is true of the
  // connections that ride the session bootstrap. Passing `null` while unresolved makes
  // every provider read "Checking…" rather than telling a connected user to go connect.
  const resolvedConnections =
    session && session.sessionResolved ? session.connections : null;

  const showFaith = needsFaithAlignment(settings, defaults);

  return (
    <div data-testid="ai-settings" data-faith-visible={showFaith ? "true" : "false"}>
      <div style={{ marginBottom: 9 }}>
        <span style={GOLD_LABEL}>{"GENERATION"}</span>
        {/* 13b's own scoping qualifier, reused rather than reinvented: these choices
            configure the project, not this scene. */}
        <span
          style={{ fontFamily: SEMI, fontWeight: 600, fontSize: 10, color: "#a99b85" }}
        >
          {" · whole video"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {SELECTABLE_KINDS.map((kind) => {
          const options = providerOptionsFor(kind, resolvedConnections, models);
          const choice = resolveChoice(kind, settings, defaults, models);
          const available = modelsFor(kind, choice.provider, models);
          const selectedModel =
            available.find((m) => m.id === choice.model) ??
            models.find((m) => m.id === choice.model) ??
            null;

          // The only workload we can MEASURE: narration reads the scripts, music reads
          // the style prompt. Image and video have no token-countable input, so they get
          // no workload and the estimator degrades accordingly rather than guessing.
          const characters =
            kind === "narration"
              ? state.storyboard.scenes.reduce((n, s) => n + s.script.length, 0)
              : kind === "music"
                ? state.storyboard.musicMood.length
                : undefined;

          const estimate = estimateGenerationCost({
            kind,
            model: selectedModel,
            ...(characters !== undefined ? { workload: { characters } } : {}),
          });

          return (
            <div key={kind} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={LABEL}>{KIND_LABELS[kind]}</div>

              <ProviderSwitch
                kind={kind}
                options={options}
                selected={choice.provider}
                onSelect={(provider) => setAiProvider(kind, provider)}
              />

              <select
                data-testid={`ai-model-${kind}`}
                aria-label={`${KIND_LABELS[kind]} model`}
                value={choice.model ?? ""}
                disabled={available.length === 0}
                onChange={(e) => setAiModel(kind, e.target.value || null)}
                style={{ ...BOX, opacity: available.length === 0 ? 0.5 : 1 }}
              >
                {/* The design's rule for an unmade choice: a dim placeholder, never a
                    silently-preselected first option. */}
                <option value="">
                  {available.length === 0 ? "no models available" : "select model"}
                </option>
                {available.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                {/* A persisted model that has left the catalogue stays selectable so the
                    picker shows what the project is ACTUALLY set to, rather than silently
                    appearing to be set to something else. */}
                {choice.model && !available.some((m) => m.id === choice.model) ? (
                  <option value={choice.model}>{`${choice.model} (unlisted)`}</option>
                ) : null}
              </select>

              {/* 13b's stat-row shape — the natural form for a read-only readout. The
                  sub-line carries the BASIS, which is what keeps the number honest: it
                  says where it came from, and says so plainly when there is no number. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "8px 11px",
                  border: "1px solid rgba(230,180,120,.12)",
                  borderRadius: 10,
                  background: "#0f0b07",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: "#f1e7d6" }}>
                    {"Est. cost"}
                  </div>
                  <div
                    data-testid={`ai-cost-basis-${kind}`}
                    style={{ fontSize: 10.5, color: "#a99b85", lineHeight: 1.35 }}
                  >
                    {estimate.basis}
                  </div>
                </div>
                <span
                  data-testid={`ai-cost-${kind}`}
                  data-confidence={estimate.confidence}
                  style={{
                    fontFamily: MONO,
                    fontWeight: 700,
                    fontSize: 12.5,
                    color: estimate.usdPerRun === null ? "#a99b85" : "#f1e7d6",
                    whiteSpace: "nowrap",
                  }}
                >
                  {renderCostValue(estimate)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Item 2 — shown ONLY while something runs on Gloo. "Not shown for OpenRouter"
            is the task's own wording, and it is also the truth: `tradition` is a Gloo
            request field with no OpenRouter equivalent. */}
        {showFaith ? (
          <div>
            <div style={LABEL}>{"FAITH ALIGNMENT"}</div>
            <select
              data-testid="faith-alignment"
              aria-label="Faith alignment"
              value={settings?.faithAlignment ?? ""}
              onChange={(e) =>
                setFaithAlignment((e.target.value || null) as FaithAlignment | null)
              }
              style={BOX}
            >
              <option value="">{"select alignment"}</option>
              {FAITH_ALIGNMENTS.map((value) => (
                <option key={value} value={value}>
                  {FAITH_ALIGNMENT_LABELS[value]}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 5, fontSize: 10.5, color: "#a99b85", lineHeight: 1.35 }}>
              {
                "Steers Gloo's faith-aligned models. Only these four traditions are supported."
              }
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
