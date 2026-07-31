"use client";

import { useStudio } from "./studio-context";
import {
  FAITH_ALIGNMENTS,
  FAITH_ALIGNMENT_HELP,
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

export interface AiSettingsPanelProps {
  /**
   * Figure 19a dissolves the single `GENERATION` section and redistributes it: SCENE IMAGE
   * + SCENE VIDEO under the visual prompt, the speech model under narration, the music
   * model under the music bed — *"each prompt is a card that owns its own model controls"*.
   *
   * The panel is rendered once per card with the kinds that belong to it, rather than
   * being rewritten three times. Every per-kind testid (`ai-kind-*`, `ai-provider-*`,
   * `ai-model-*`, `ai-cost-*`) is unchanged by construction, which is what keeps the
   * real-lane specs that drive them working across the move.
   *
   * Omitted ⇒ every selectable kind, i.e. exactly today's single-section behaviour.
   */
  kinds?: readonly SelectableKind[];
  /** The gold section label. `null` renders none — 19a's cards carry their own header. */
  heading?: string | null;
  /**
   * 19a moves FAITH ALIGNMENT inside the image block, *"because it only affects
   * Gloo-generated images, so it belongs where that choice is made"*. Exactly one mount
   * may claim it, or the studio would render the control several times.
   */
  includeFaithAlignment?: boolean;
  /** Set on exactly ONE mount so `ai-settings` stays a unique seam. */
  rootTestId?: string;
}

export default function AiSettingsPanel({
  kinds,
  heading = "GENERATION",
  includeFaithAlignment = true,
  rootTestId,
}: AiSettingsPanelProps = {}) {
  const { state, project, setAiProvider, setAiModel, setFaithAlignment } = useStudio();

  // Same gate as every other AI control: a REAL project only. The mock catalogue keeps
  // the byte-for-byte 13b inspector (mock-lane e2e specs assert its exact textContent),
  // and that lane's zero-egress guarantee depends on this section never mounting there.
  if (!project.manifest) return null;

  const catalogue = state.modelCatalogue;
  const models = catalogue?.models ?? [];
  const defaults = catalogue?.defaults ?? {};
  const settings = state.storyboard.aiSettings;

  /**
   * WHO IS CONNECTED — from the catalogue the api built, not from the session (D4).
   *
   * The panel used to read `useOptionalSession().connections`. Two things were wrong with
   * that, and both had already bitten this codebase:
   *
   *  · the client's `ConnectionsState` is seeded not-linked, `applyConnectionsBase` never
   *    sets not-linked, and the hydrate effect returns early on failure — so it cannot tell
   *    "not connected" from "we could not ask";
   *  · `?seed=authed-returning` pre-marks GitHub + OpenRouter connected regardless of the
   *    database.
   *
   * `state.modelCatalogue.providers` is server-derived truth for the same question, it is
   * already fetched and Zod-parsed, and `fetchModelCatalogue` resolves `null` on ANY failure
   * without throwing — so an unread catalogue is structurally `null` here, which every rule
   * below renders as "Checking…" rather than as "not connected".
   */
  const connected = catalogue?.providers ?? null;

  const shownKinds = kinds ?? SELECTABLE_KINDS;
  const showFaith = includeFaithAlignment && needsFaithAlignment(settings, defaults);

  return (
    <div
      {...(rootTestId ? { "data-testid": rootTestId } : {})}
      data-faith-visible={showFaith ? "true" : "false"}
    >
      {heading ? (
        <div style={{ marginBottom: 9 }}>
          <span style={GOLD_LABEL}>{heading}</span>
          {/* 13b's own scoping qualifier, reused rather than reinvented: these choices
              configure the project, not this scene. It stays even where 19a co-locates the
              selector inside a card tagged `this scene` — the pill scopes the PROMPT, and
              `AiGenerationSettingsSchema` is emphatic that model choice is project-level
              ("a per-scene choice would make the user re-pick a model 5–10 times … the
              reverse is a manifest migration"). */}
          <span
            style={{ fontFamily: SEMI, fontWeight: 600, fontSize: 10, color: "#a99b85" }}
          >
            {" · whole video"}
          </span>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {shownKinds.map((kind) => {
          const options = providerOptionsFor(kind, connected, models);
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

          // A kind with NO available provider cannot be configured at all — every choice
          // below it is inert. SCENE VIDEO is the live case: video is openrouter-only, so
          // with OpenRouter unlinked both buttons are unavailable, yet the model select and
          // the cost readout still rendered as ordinary live controls. Gating the whole
          // block on the providers keeps this general — it holds for any kind whose
          // providers all become unavailable, not just video — and the ProviderSwitch keeps
          // rendering its reason badge (and `Link ▸` when the reason is actionable), so the
          // section still explains itself rather than going quietly dead.
          const kindAvailable = options.some((option) => option.available);

          return (
            <div
              key={kind}
              data-testid={`ai-kind-${kind}`}
              data-available={kindAvailable ? "true" : "false"}
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
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
                disabled={!kindAvailable || available.length === 0}
                onChange={(e) => setAiModel(kind, e.target.value || null)}
                style={{
                  ...BOX,
                  opacity: !kindAvailable || available.length === 0 ? 0.5 : 1,
                }}
              >
                {/* The design's rule for an unmade choice: a dim placeholder, never a
                    silently-preselected first option. */}
                <option value="">
                  {!kindAvailable
                    ? "unavailable"
                    : available.length === 0
                      ? "no models available"
                      : "select model"}
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
                  says where it came from, and says so plainly when there is no number.

                  It WRAPS, and the label column has a floor. Flexbox shrinks before it
                  wraps, so with a `nowrap` value as wide as Gloo's
                  "$0.0050 / 1K output tokens" and a basis as long as Gloo's per-token
                  explanation, the left column was squeezed to about one word per line —
                  a column of single words beside the price. `minWidth` on the left column
                  means the value can no longer steal that space: it drops to its own
                  line instead. Short pairs (OpenRouter's "<$0.0001") still sit side by
                  side exactly as before, so the common case is unchanged. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  rowGap: 4,
                  gap: 8,
                  padding: "8px 11px",
                  border: "1px solid rgba(230,180,120,.12)",
                  borderRadius: 10,
                  background: "#0f0b07",
                  // Dimmed with the rest of the block when the kind cannot be configured:
                  // a crisp price for a generation you cannot run is a false promise.
                  opacity: kindAvailable ? 1 : 0.5,
                }}
              >
                <div style={{ minWidth: 148, flex: "1 1 auto" }}>
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
                    marginLeft: "auto",
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
            {/* Copy lives in `ai-settings.ts` beside the vocabulary rule that governs it
                and the scope note that justifies it — see FAITH_ALIGNMENT_HELP. */}
            <div style={{ marginTop: 5, fontSize: 10.5, color: "#a99b85", lineHeight: 1.35 }}>
              {FAITH_ALIGNMENT_HELP}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
