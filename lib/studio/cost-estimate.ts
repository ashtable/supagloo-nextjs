import type { AiModelInfo } from "../api/contracts";
import type { SelectableKind } from "./ai-settings";

/**
 * Item 3 — "show the estimated cost of running a prompt for the selected model, so the
 * user knows the cost of iterating BEFORE clicking the button".
 *
 * ── Why this returns three things instead of one number ─────────────────────────────
 *
 * The four selectable kinds are priced four different ways, and one of them is not priced
 * at all. All four facts were measured against the live hosts on 2026-07-28:
 *
 *   image · openrouter   `pricing.image` is $ per IMAGE, and a generation buys exactly
 *                        one. The estimate IS the price. No assumption.
 *   image · gloo         per-1k-TOKEN rates only. An image's token count is not knowable
 *                        before the run — the injected system prompt alone moved from
 *                        1042 to 14917 input tokens once a faith alignment was set, and
 *                        that is before whatever the model charges for the pixels.
 *   narration · music    $ per INPUT token, and we DO know the input: it is the script
 *                        the user is looking at. Estimated, over a stated assumption.
 *   video                nothing at all. `/api/v1/videos/models` publishes
 *                        `supported_durations` and a text-to-video/image-to-video
 *                        distinction, and no price field of any kind.
 *
 * A single "estimated cost" number over that spread would have to invent something for at
 * least two of the four. So the module returns a total (or null), a published RATE (or
 * null), and a CONFIDENCE, and the UI renders each differently:
 *
 *   measured  →  `$0.0300`                     this is what it costs
 *   assumed   →  `~$0.0004`                    this is roughly what it costs
 *   unpriced  →  `—` or `$0.0046 / 1K tokens`  we cannot total this, here is what we know
 *
 * The rule that must never bend: **a number we cannot defend is never shown.**
 */

export type CostConfidence = "measured" | "assumed" | "unpriced";

export interface CostRate {
  usd: number;
  /** The unit the rate is per, e.g. `"1K input tokens"`. Rendered verbatim. */
  per: string;
}

export interface CostEstimate {
  /** The per-run total, or `null` when one cannot honestly be computed. */
  usdPerRun: number | null;
  /** A published rate we can show even when the total is unknowable. */
  rate: CostRate | null;
  /** One sentence naming where the number came from — the stat row's sub-line. */
  basis: string;
  confidence: CostConfidence;
}

export interface CostWorkload {
  /** Characters of text this generation will send (the narration script, the music
   *  prompt). Absent when the caller has nothing concrete to measure. */
  characters?: number;
}

/** ~4 characters per token. A rough industry figure, not a tokenizer — which is exactly
 *  why every estimate built on it is reported as `assumed` and says so in its basis. */
export function estimateTokens(characters: number): number {
  return Math.max(1, Math.ceil(characters / 4));
}

/**
 * Format a dollar amount at a precision that matches its magnitude.
 *
 * The floor matters: a generation costing a hundredth of a cent must not render as
 * `$0.0000`, which reads as free. `<$0.0001` says "smaller than the smallest amount we
 * are willing to write down", which is true and is not a claim of zero.
 */
export function formatUsd(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.0001 || usd === 0) return `$${usd.toFixed(4)}`;
  return "<$0.0001";
}

const unpriced = (basis: string, rate: CostRate | null = null): CostEstimate => ({
  usdPerRun: null,
  rate,
  basis,
  confidence: "unpriced",
});

export interface EstimateArgs {
  kind: SelectableKind;
  model: AiModelInfo | null;
  workload?: CostWorkload;
}

export function estimateGenerationCost(args: EstimateArgs): CostEstimate {
  const { kind, model, workload } = args;

  // Checked FIRST, before anything looks at `model.pricing`. The rule is about the KIND:
  // OpenRouter publishes no video pricing, so a future catalogue change or a
  // mis-normalized field must not be able to turn "we cannot know this" into a confident
  // dollar amount on a screen the user is about to spend money from.
  if (kind === "video") {
    return unpriced("Video pricing is not published by the provider — cost unknown.");
  }

  if (!model) return unpriced("Select a model to see its cost.");
  if (!model.kinds.includes(kind)) {
    return unpriced("This model does not serve this kind of generation.");
  }
  const pricing = model.pricing;
  if (!pricing) return unpriced("This model publishes no pricing.");

  if (kind === "image") {
    if (model.provider === "openrouter") {
      const perImageToken = pricing.perOutputImageToken;
      if (perImageToken === undefined) {
        // The api already drops a zero (those "free" models 500 in practice) and a
        // negative (variable/auto-priced) rate, so absent here means "nothing to say" —
        // and `$0.00` would be recommending a model that cannot run. Live on 2026-07-31
        // this is the COMMON branch: 36 of 40 OpenRouter image models land here.
        return unpriced("This model publishes no generated-image price.");
      }
      // Per TOKEN, not per image — so this is Gloo's situation, and it gets Gloo's
      // answer. Until 2026-07-31 this branch multiplied `pricing.image` by one and
      // called the result `measured`; `pricing.image` is the image-INPUT rate, so the
      // number was ~5 orders of magnitude low with the module's strongest confidence
      // label on it. There is no total to compute: an image's output-token count depends
      // on the resolution the provider picks at generation time.
      return unpriced(
        "OpenRouter prices generated images per token, so the total depends on the " +
          "image the model decides to produce.",
        { usd: perImageToken * 1000, per: "1K output image tokens" },
      );
    }
    // Gloo. Prices per token, and an image's token count is not predictable — so show the
    // published rate and say plainly that the total depends on the prompt. This is the
    // honest form of the same information; a total here would be a guess dressed up.
    const perOutput = pricing.perOutputToken;
    if (perOutput === undefined) return unpriced("This model publishes no pricing.");
    return unpriced(
      "Gloo prices per token, so the total depends on the prompt and the faith alignment.",
      { usd: perOutput * 1000, per: "1K output tokens" },
    );
  }

  // narration / music — the speech catalogue prices on input tokens.
  const perInput = pricing.perInputToken;
  if (perInput === undefined) return unpriced("This model publishes no pricing.");

  const characters = workload?.characters;
  if (characters === undefined) {
    // No concrete input to measure. Showing a rate is honest; multiplying by an invented
    // script length would not be.
    return unpriced("Cost depends on the length of the text.", {
      usd: perInput * 1000,
      per: "1K input tokens",
    });
  }

  const tokens = estimateTokens(characters);
  return {
    usdPerRun: tokens * perInput,
    rate: null,
    basis: `${characters} characters ≈ ${tokens} tokens × ${formatUsd(perInput)}/token`,
    confidence: "assumed",
  };
}

/** The stat row's right-hand value. `~` is the visible difference between a measurement
 *  and an estimate; `—` is the visible difference between both and not knowing. */
export function renderCostValue(estimate: CostEstimate): string {
  if (estimate.usdPerRun !== null) {
    const formatted = formatUsd(estimate.usdPerRun);
    return estimate.confidence === "assumed" ? `~${formatted}` : formatted;
  }
  if (estimate.rate) return `${formatUsd(estimate.rate.usd)} / ${estimate.rate.per}`;
  return "—";
}
