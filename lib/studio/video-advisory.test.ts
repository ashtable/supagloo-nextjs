import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  VIDEO_ADVISORY,
  advisoryForScenes,
  advisoryQualifier,
  formatAdvisoryDuration,
  formatAdvisoryUsd,
} from "./video-advisory";
import { estimateGenerationCost } from "./cost-estimate";

/**
 * Figure 20b's advisory numbers — and the FENCE that keeps them out of the honest cost
 * module.
 *
 * `cost-estimate.ts` refuses to price video before it reads any pricing at all, and its
 * stated rule is *"a number we cannot defend is never shown."* 19a agrees with the code
 * (`"Provider publishes no pricing."` / `—`). 20b's magnitudes ship as a clearly-labelled,
 * dated observation for the warning dialog ONLY. The last two tests here are what stop a
 * later pass from "unifying" the two and quietly turning an anecdote into a price.
 */

describe("the advisory constant", () => {
  it("U-D1: carries its measurement date and what was measured", () => {
    // An undated estimate is a rumour, and one that does not say what produced it cannot
    // be challenged or re-derived.
    expect(VIDEO_ADVISORY.measuredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(VIDEO_ADVISORY.basis.length).toBeGreaterThan(0);
    expect(VIDEO_ADVISORY.costPerSceneUsd).toBeGreaterThan(0);
    expect(VIDEO_ADVISORY.secondsPerScene).toBeGreaterThan(0);
  });

  it("U-D2: the qualifier names the uncertainty AND the date, every time", () => {
    const q = advisoryQualifier();
    expect(q).toContain(VIDEO_ADVISORY.measuredOn);
    expect(q.toLowerCase()).toContain("no price");
    expect(q.toLowerCase()).toContain("may differ");
  });

  it("U-D3: the TIME figure is the one that was measured, not the one 20b drew", () => {
    // 20b draws "2–6 MIN". The single run we have took 8 min 5 s. Printing the drawn
    // range would understate the wait by more than 30% while claiming to be an estimate —
    // the design-delta rule is omit-or-correct rather than repeat a number no measurement
    // supports.
    expect(VIDEO_ADVISORY.secondsPerScene).toBe(485);
    expect(formatAdvisoryDuration(VIDEO_ADVISORY.secondsPerScene)).toBe("~8 min");
  });

  it("U-D4: formatting says ABOUT, never a false precision", () => {
    expect(formatAdvisoryUsd(0.5)).toBe("$0.50");
    expect(formatAdvisoryDuration(485)).toBe("~8 min");
    expect(formatAdvisoryDuration(45)).toBe("~45 sec");
    // One sample is not a stopwatch reading — nothing renders "8:05".
    expect(formatAdvisoryDuration(485)).not.toContain(":");
  });

  it("U-D5: the all-scenes projection is COMPUTED from the scene count", () => {
    // 20b's "$2.00" and "24 minutes" assume exactly four scenes and a per-scene time we
    // did not measure. The form is the figure's; the arithmetic is ours.
    expect(advisoryForScenes(4)).toEqual({ usd: 2, seconds: 4 * 485 });
    expect(advisoryForScenes(1).usd).toBe(0.5);
    expect(advisoryForScenes(0)).toEqual({ usd: 0, seconds: 0 });
  });
});

describe("THE FENCE — the advisory must never reach the honest cost module", () => {
  it("U-D6: cost-estimate.ts still refuses to price video", () => {
    const est = estimateGenerationCost({
      kind: "video",
      model: {
        id: "some/video-model",
        provider: "openrouter",
        label: "Some video model",
        kinds: ["video"],
        // Even handed a fully-priced model, video must stay unpriced: the rule is about
        // the KIND, so no catalogue change can flip it.
        pricing: { image: "0.01", prompt: "0.000001", completion: "0.000002" },
      } as never,
    });
    expect(est.confidence).toBe("unpriced");
    expect(est.usdPerRun).toBeNull();
  });

  it("U-D7: cost-estimate.ts does not so much as MENTION the advisory", () => {
    // A source-level lint, in the same spirit as `no-model-ids.test.ts`: the rule is about
    // the code, so a test that only checked behaviour would pass the moment someone
    // imported the constant "just for the basis line" and then wired it in later.
    const source = readFileSync(
      fileURLToPath(new URL("./cost-estimate.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toContain("video-advisory");
    expect(source).not.toContain("VIDEO_ADVISORY");
    expect(source).not.toContain("advisoryForScenes");
  });
});
