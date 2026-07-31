import { describe, expect, it } from "vitest";

import {
  estimateGenerationCost,
  estimateTokens,
  formatUsd,
  renderCostValue,
} from "./cost-estimate";
import type { AiModelInfo } from "../api/contracts";

/**
 * U-CE1..U-CE9 — item 3's cost estimate.
 *
 * The user asked to "know the cost of iterating BEFORE clicking the button". The design
 * has no drawing for this and no number anywhere except `$18.40 credit remaining` on the
 * profile page, so the shape is an invention. What is NOT negotiable is honesty, and
 * honesty here is hard for a specific reason: **the four kinds are priced four different
 * ways, and one of them is not priced at all.**
 *
 *   image · openrouter   `pricing.image` — $ per IMAGE, and we buy exactly one
 *   image · gloo         per-1k-TOKEN rates only; an image's token count is unknowable
 *                        before the run (the live probe saw input_tokens 1042 -> 14917
 *                        once `tradition` was set)
 *   narration / music    $ per INPUT token; we know the input (the script)
 *   video                nothing. `/api/v1/videos/models` publishes no price field.
 *
 * So the module returns THREE things rather than one number: a total (or null), a
 * published rate (or null), and a confidence. The UI renders each differently, and the
 * one rule that must never bend is that a number we cannot defend is never shown.
 */

const orImage = (perOutputImageToken?: number): AiModelInfo => ({
  id: "vendor/img",
  provider: "openrouter",
  label: "Vendor Image",
  kinds: ["image"],
  pricing:
    perOutputImageToken === undefined ? null : { perOutputImageToken },
  voices: null,
});

const glooImage: AiModelInfo = {
  id: "gloo-vendor-flux",
  provider: "gloo",
  label: "Vendor Flux",
  kinds: ["image"],
  pricing: { perOutputToken: 0.00000456 },
  voices: null,
};

const orSpeech: AiModelInfo = {
  id: "vendor/tts",
  provider: "openrouter",
  label: "Vendor TTS",
  kinds: ["narration", "music"],
  pricing: { perInputToken: 0.000004 },
  voices: null,
};

const orVideo: AiModelInfo = {
  id: "vendor/video",
  provider: "openrouter",
  label: "Vendor Video",
  kinds: ["video"],
  pricing: null,
  voices: null,
};

describe("estimateTokens", () => {
  it("U-CE1: ~4 characters per token, never below 1", () => {
    // The assumption is stated in the rendered basis line rather than hidden. 4 chars/token
    // is the standard rough figure for English; nothing here claims to be a tokenizer.
    expect(estimateTokens(0)).toBe(1);
    expect(estimateTokens(4)).toBe(1);
    expect(estimateTokens(5)).toBe(2);
    expect(estimateTokens(400)).toBe(100);
  });
});

describe("formatUsd", () => {
  it("U-CE2: scales precision to the magnitude and never renders a misleading $0.00", () => {
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(0.03)).toBe("$0.0300");
    expect(formatUsd(0.000412)).toBe("$0.0004");
    // A generation that costs a hundredth of a cent must not read as free. `$0.0000`
    // would; this says "smaller than the smallest amount we render".
    expect(formatUsd(0.00001)).toBe("<$0.0001");
    expect(formatUsd(0)).toBe("$0.0000");
  });
});

describe("estimateGenerationCost — image", () => {
  it("U-CE3: OpenRouter image shows the published RATE and refuses a total — same as Gloo", () => {
    // ── This case USED TO ASSERT A MEASURED TOTAL, and that was wrong (2026-07-31) ──
    //
    // It read `pricing.perImage` and asserted `confidence: "measured"`, `usdPerRun`, and
    // a basis containing "per image". Every one of those was downstream of the api
    // mapping OpenRouter's `pricing.image` as "$ per generated image". It is not: it is
    // the rate for an image supplied as INPUT, byte-identical to `pricing.prompt` on the
    // whole live Gemini family. The studio was rendering "$0.0000003 per image × 1 image"
    // for Nano Banana — five orders of magnitude under its real ~$0.039 — with the
    // strongest confidence label the module has.
    //
    // The replacement is DELIBERATELY WEAKER, and that is the correction rather than a
    // concession. The honest field is `image_output`, which is per TOKEN, and an image's
    // token count depends on the resolution the provider picks at generation time — so
    // there is no total to compute. This is exactly Gloo's situation (U-CE5), and it now
    // gets exactly Gloo's answer. Losing the only `measured` image cost is the price of
    // not inventing one; the module's own rule is that a number we cannot defend is never
    // shown, and that total could not be defended.
    const est = estimateGenerationCost({ kind: "image", model: orImage(0.00006) });
    expect(est.confidence).toBe("unpriced");
    expect(est.usdPerRun).toBeNull();
    // The rate SURVIVES — showing nothing would hide real, published information.
    // Per-token → per-1K is binary floating point, so compare with a tolerance.
    expect(est.rate?.per).toBe("1K output image tokens");
    expect(est.rate?.usd).toBeCloseTo(0.06, 10);
    // …and the basis must say why there is no total, not merely omit one.
    expect(est.basis.toLowerCase()).toContain("token");
  });

  it("U-CE3b: the rate is NEVER multiplied into a per-run total, whatever the workload", () => {
    // The anti-regression for the bug above, and it has to be workload-bearing: the
    // narration/music branch legitimately DOES multiply a per-token rate by a measured
    // character count, so "image, but with a workload attached" is the exact shape a
    // future refactor would fold into that branch and reintroduce a fabricated total.
    const est = estimateGenerationCost({
      kind: "image",
      model: orImage(0.00006),
      workload: { characters: 4000 },
    });
    expect(est.usdPerRun).toBeNull();
    expect(est.confidence).toBe("unpriced");
  });

  it("U-CE4: a MISSING generated-image rate is unpriced, never zero", () => {
    // The api already drops a zero `image_output` (those "free" models 500 in practice)
    // and a negative one (variable/auto-priced). By the time it reaches here, absent means
    // "we have nothing to say", and saying "$0.00" would be recommending a broken model.
    // Live on 2026-07-31 this is the COMMON case, not the edge: 36 of 40 OpenRouter image
    // entries publish no usable generated-image rate at all.
    const est = estimateGenerationCost({ kind: "image", model: orImage(undefined) });
    expect(est.confidence).toBe("unpriced");
    expect(est.usdPerRun).toBeNull();
    expect(est.rate).toBeNull();
  });

  it("U-CE5: Gloo image shows the published RATE and refuses to guess a total", () => {
    // Gloo prices per token and an image's token count is not knowable in advance —
    // the injected system prompt alone moved from 1042 to 14917 input tokens when a
    // faith alignment was set. Showing the rate is the honest form of the same
    // information; showing a total would be a fabrication dressed as an estimate.
    const est = estimateGenerationCost({ kind: "image", model: glooImage });
    expect(est.usdPerRun).toBeNull();
    expect(est.confidence).toBe("unpriced");
    // Compared with a tolerance: per-token -> per-1K is binary floating point, so exact
    // equality would pin IEEE-754 rounding rather than the rule.
    expect(est.rate?.per).toBe("1K output tokens");
    expect(est.rate?.usd).toBeCloseTo(0.00456, 10);
    expect(est.basis.toLowerCase()).toContain("prompt");
  });
});

describe("estimateGenerationCost — narration and music", () => {
  it("U-CE6: priced from the ACTUAL script length, and flagged as an assumption", () => {
    const est = estimateGenerationCost({
      kind: "narration",
      model: orSpeech,
      workload: { characters: 400 },
    });
    expect(est.confidence).toBe("assumed");
    // 400 chars -> ~100 tokens -> 100 * $0.000004
    expect(est.usdPerRun).toBeCloseTo(0.0004, 10);
    expect(est.basis).toContain("400 characters");
    expect(est.basis).toContain("100 tokens");
  });

  it("U-CE6b: with no workload we show the RATE, not a total over an invented length", () => {
    const est = estimateGenerationCost({ kind: "music", model: orSpeech });
    expect(est.usdPerRun).toBeNull();
    expect(est.rate?.per).toBe("1K input tokens");
    expect(est.rate?.usd).toBeCloseTo(0.004, 10);
  });

  it("U-CE6c: an unpriced speech model is unpriced", () => {
    const est = estimateGenerationCost({
      kind: "narration",
      model: { ...orSpeech, pricing: null },
      workload: { characters: 400 },
    });
    expect(est.confidence).toBe("unpriced");
    expect(est.usdPerRun).toBeNull();
  });
});

describe("estimateGenerationCost — video", () => {
  it("U-CE7: video is ALWAYS unpriced — OpenRouter publishes no video pricing", () => {
    const est = estimateGenerationCost({ kind: "video", model: orVideo });
    expect(est.usdPerRun).toBeNull();
    expect(est.rate).toBeNull();
    expect(est.confidence).toBe("unpriced");
    expect(est.basis.toLowerCase()).toContain("not published");
  });

  it("U-CE7b: video stays unpriced EVEN IF a pricing block somehow arrives", () => {
    // The load-bearing half. A future catalogue change, or a mis-normalized field, must
    // not be able to turn "we cannot know this" into a confident dollar amount on screen.
    // The rule is about the KIND, not about what happens to be in the object.
    const est = estimateGenerationCost({
      kind: "video",
      model: { ...orVideo, pricing: { perOutputImageToken: 0.5, perInputToken: 0.1 } },
      workload: { characters: 400 },
    });
    expect(est.usdPerRun).toBeNull();
    expect(est.rate).toBeNull();
    expect(est.confidence).toBe("unpriced");
  });
});

describe("estimateGenerationCost — degenerate inputs", () => {
  it("U-CE8: no model selected yet is unpriced with a reason, not a crash or a zero", () => {
    const est = estimateGenerationCost({ kind: "image", model: null });
    expect(est.usdPerRun).toBeNull();
    expect(est.confidence).toBe("unpriced");
    expect(est.basis.length).toBeGreaterThan(0);
  });

  it("U-CE8b: a model that cannot serve the kind is unpriced", () => {
    // Selecting a speech model for `image` is not reachable through the UI, but the
    // manifest is a file a user can hand-edit, so it IS reachable through the data.
    const est = estimateGenerationCost({ kind: "image", model: orSpeech });
    expect(est.usdPerRun).toBeNull();
    expect(est.confidence).toBe("unpriced");
  });
});

describe("renderCostValue", () => {
  it("U-CE9: an assumption is hedged with ~, a measurement is not, unknown is an em dash", () => {
    // The visible difference between "this is what it costs" and "this is roughly what it
    // costs" and "we do not know" — the whole point of carrying a confidence.
    expect(
      renderCostValue({
        usdPerRun: 0.03,
        rate: null,
        basis: "",
        confidence: "measured",
      }),
    ).toBe("$0.0300");
    expect(
      renderCostValue({
        usdPerRun: 0.0004,
        rate: null,
        basis: "",
        confidence: "assumed",
      }),
    ).toBe("~$0.0004");
    expect(
      renderCostValue({ usdPerRun: null, rate: null, basis: "", confidence: "unpriced" }),
    ).toBe("—");
    // A rate with no total still shows the rate rather than an em dash — it is real
    // published information, just not a per-run total.
    expect(
      renderCostValue({
        usdPerRun: null,
        rate: { usd: 0.00456, per: "1K output tokens" },
        basis: "",
        confidence: "unpriced",
      }),
    ).toBe("$0.0046 / 1K output tokens");
  });
});
