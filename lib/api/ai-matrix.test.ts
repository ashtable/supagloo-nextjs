import { describe, expect, it } from "vitest";

import {
  AI_PROVIDERS_BY_KIND,
  providersForKind,
  type AiProviderName,
  type GenerationKindName,
} from "./ai-matrix";
import { DEFAULT_MODEL_BY_KIND_PROVIDER } from "./ai-config";

/**
 * The kind→provider compatibility matrix, hand-mirrored from db-lib's
 * `AI_PROVIDERS_BY_KIND` (`supagloo-database-lib/src/workflows.ts`). This repo deliberately
 * does not import db-lib; every wire contract here is a hand copy.
 *
 * ## Why it moved into its own module (2026-07-31)
 *
 * There were two partial copies: `lib/studio/ai-settings.ts:93-98` covered only the four
 * SELECTABLE kinds (the ones with a UI selector), and nothing covered `storyboard`/`script`
 * at all. R4/R6/R8's connection-aware resolver needs all six — it is the only code path
 * that resolves `storyboard`, because storyboard has no selector and therefore never
 * appears in the catalogue's published `defaults`.
 *
 * One rule, one module, applied at each boundary (memory
 * `one-rule-one-module-many-boundaries`): the resolver reads it to decide what a kind may
 * be repaired ONTO, and the picker reads it to explain why a provider is greyed out.
 */

const ALL_KINDS: GenerationKindName[] = [
  "storyboard",
  "script",
  "image",
  "narration",
  "music",
  "video",
];

const ALL_PROVIDERS: AiProviderName[] = ["gloo", "openrouter"];

describe("the hand-mirrored compatibility matrix", () => {
  it("U-DT13: covers EXACTLY the six generation kinds", () => {
    // A kind missing here is a kind the resolver cannot repair and the picker cannot
    // explain — it would silently fall through to whatever the default map happened to say.
    expect(Object.keys(AI_PROVIDERS_BY_KIND).sort()).toEqual([...ALL_KINDS].sort());
  });

  it("U-DT14: every kind lists at least one provider, all drawn from the two we support", () => {
    const bad: string[] = [];
    for (const kind of ALL_KINDS) {
      const providers = providersForKind(kind);
      if (providers.length === 0) bad.push(`${kind}: empty`);
      for (const p of providers) {
        if (!ALL_PROVIDERS.includes(p)) bad.push(`${kind}: unknown provider ${p}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("U-DT15: mirrors db-lib's measured truth — Gloo serves text + image, and nothing else", () => {
    // Verified live 2026-07-31 against `GET platform.ai.gloo.com/platform/v2/models`: 107
    // models, 11 image-capable, ZERO declaring speech / music / video output. So
    // narration/music/video being openrouter-only is a measured fact, not caution — which
    // is exactly why R7 disables them rather than rerouting them.
    expect(providersForKind("storyboard")).toEqual(
      expect.arrayContaining(["gloo", "openrouter"]),
    );
    expect(providersForKind("script")).toEqual(
      expect.arrayContaining(["gloo", "openrouter"]),
    );
    expect(providersForKind("image")).toEqual(
      expect.arrayContaining(["gloo", "openrouter"]),
    );
    for (const kind of ["narration", "music", "video"] as const) {
      expect(providersForKind(kind), `${kind} must be openrouter-only`).toEqual([
        "openrouter",
      ]);
    }
  });
});

describe("the per-(kind, provider) default model map", () => {
  it("U-DT12: every matrix-permitted (kind, provider) pair has a non-empty default model", () => {
    // The hole this closes: the connection-aware repair moves a kind onto a provider, and
    // the map has no id for that slot — so the BFF posts `undefined` as the model and the
    // request 400s structurally. Every pair the matrix permits is a pair the repair can
    // produce, so every one of them needs an answer.
    const missing: string[] = [];
    for (const kind of ALL_KINDS) {
      for (const provider of providersForKind(kind)) {
        const model = DEFAULT_MODEL_BY_KIND_PROVIDER[kind]?.[provider];
        if (typeof model !== "string" || model.length === 0) {
          missing.push(`${kind}/${provider}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("U-DT16: no slot holds an id from the OTHER provider's namespace", () => {
    // Gloo ids are `gloo-`-prefixed; OpenRouter ids are `vendor/model`. A cross-namespace
    // entry is an unknown-model 400 at the provider, minutes and dollars later.
    const wrong: string[] = [];
    for (const kind of ALL_KINDS) {
      for (const provider of providersForKind(kind)) {
        const model = DEFAULT_MODEL_BY_KIND_PROVIDER[kind]?.[provider] ?? "";
        if (provider === "gloo" && !model.startsWith("gloo-")) {
          wrong.push(`${kind}/gloo → ${model}`);
        }
        if (provider === "openrouter" && (model.startsWith("gloo-") || !model.includes("/"))) {
          wrong.push(`${kind}/openrouter → ${model}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("U-DT17: declares no slot for a pair the matrix forbids", () => {
    // Offering a `narration/gloo` model would be a standing invitation to route around the
    // matrix — and Gloo publishes zero speech models, so the id could only be invented.
    const forbidden: string[] = [];
    for (const kind of ALL_KINDS) {
      const permitted = providersForKind(kind);
      for (const provider of ALL_PROVIDERS) {
        if (permitted.includes(provider)) continue;
        if (DEFAULT_MODEL_BY_KIND_PROVIDER[kind]?.[provider] !== undefined) {
          forbidden.push(`${kind}/${provider}`);
        }
      }
    }
    expect(forbidden).toEqual([]);
  });
});
