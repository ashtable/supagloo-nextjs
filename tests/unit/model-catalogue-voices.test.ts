import { describe, expect, it, vi } from "vitest";

import { fetchModelCatalogue } from "@/lib/studio/model-catalogue-data";
import { narrowNarrationModels } from "@/lib/api/ai-config";

/**
 * `supported_voices` on the way to the browser, and the narration-model narrowing.
 *
 * ## The strip points
 *
 * The api ALREADY fetches `GET /api/v1/models?output_modalities=speech` on every
 * catalogue read — the bytes carrying `supported_voices` are already in the process. The
 * field dies at exactly three places, each a plain `z.object` that forwards its own parse
 * output: the api's mapper, the api's Fastify RESPONSE serializer, and this repo's
 * hand-mirrored `contracts.ts`. Two of those are pinned in the api repo; this file pins
 * the third — the one no api test can see, because nextjs deliberately does not import
 * db-lib or the api's DTOs and every mirror here is a hand copy.
 *
 * ## The narrowing
 *
 * > "let's stick to only the hexgrad/kokoro-82m and zyphra/zonos-* narration models, with
 * >  the default being kokoro" … "actually, let's just do kokora" / "forget about the
 * >  zonos narration"
 *
 * A deliberate, user-chosen narrowing, and a stated exception to `design-delta.md:1143`
 * ("Model ids are never hardcoded"). The RULE below names no id: it offers whichever
 * narration model this deployment is configured to run — `resolveGenerationTarget`'s
 * answer, i.e. `SUPAGLOO_AI_MODEL_NARRATION` or the documented default in this same
 * module, which has been `hexgrad/kokoro-82m` since 2026-07-27. So the exception costs
 * zero NEW hardcoded ids and stays operator-overridable rather than frozen.
 */

const kokoro = {
  id: "hexgrad/kokoro-82m",
  provider: "openrouter",
  label: "hexgrad: Kokoro 82M",
  kinds: ["narration"],
  pricing: { perInputToken: 0.00000062 },
  voices: ["af_alloy", "am_adam", "bm_daniel"],
};

const otherSpeech = {
  id: "deepgram/aura-2",
  provider: "openrouter",
  label: "Deepgram: Aura 2",
  kinds: ["narration"],
  pricing: null,
  voices: ["aura-2-thalia-en"],
};

const music = {
  id: "google/lyria-3-clip-preview",
  provider: "openrouter",
  label: "Lyria",
  kinds: ["music"],
  pricing: null,
  voices: null,
};

const body = (models: unknown[]) => ({
  models,
  providers: { gloo: false, openrouter: true },
  defaults: {
    narration: { provider: "openrouter", model: "hexgrad/kokoro-82m" },
  },
});

const jsonFetch = (payload: unknown): typeof fetch =>
  vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;

describe("the browser-side strip point", () => {
  it("U-V63: `voices` survives the contracts mirror", () => {
    return fetchModelCatalogue({ fetchImpl: jsonFetch(body([kokoro, music])) }).then(
      (result) => {
        expect(result).not.toBeNull();
        expect(result!.models[0].voices).toEqual(["af_alloy", "am_adam", "bm_daniel"]);
        // `null` is the provider's own "no published vocabulary" state — 6 of 19 live
        // speech models answer exactly that — and it must stay distinguishable from an
        // empty array, which never occurs live.
        expect(result!.models[1].voices).toBeNull();
      },
    );
  });

  it("U-V64: an api that has not shipped the field yet degrades the FIELD, not the catalogue", async () => {
    // nextjs and the api release independently. A required `voices` against an older api
    // would fail the whole `safeParse`, `fetchModelCatalogue` turns that into `null`, and
    // the Inspector's entire model picker and cost row would vanish — a far worse outcome
    // than one absent field. Strict at the producer (the api's DTO), tolerant here.
    const withoutVoices: Record<string, unknown> = { ...kokoro };
    delete withoutVoices.voices;
    const result = await fetchModelCatalogue({
      fetchImpl: jsonFetch(body([withoutVoices])),
    });
    expect(result).not.toBeNull();
    expect(result!.models).toHaveLength(1);
    expect(result!.models[0].voices).toBeNull();
  });
});

describe("the narration-model narrowing", () => {
  it("U-V65: only the CONFIGURED narration model is offered; other kinds are untouched", async () => {
    const narrowed = narrowNarrationModels(
      [kokoro, otherSpeech, music],
      "hexgrad/kokoro-82m",
    );
    expect(narrowed.map((m) => m.id)).toEqual([
      "hexgrad/kokoro-82m",
      "google/lyria-3-clip-preview",
    ]);
    // The surviving entry keeps everything it had, `voices` included.
    expect(narrowed[0]).toEqual(kokoro);
  });

  it("U-V66: the rule names no id — pointing the config elsewhere moves the offer", async () => {
    // This is what makes the exception an exception rather than a new hardcoded id: the
    // narrowing is "whatever this deployment runs", not "kokoro".
    const narrowed = narrowNarrationModels([kokoro, otherSpeech], "deepgram/aura-2");
    expect(narrowed.map((m) => m.id)).toEqual(["deepgram/aura-2"]);
  });

  it("U-V67: a model serving narration AND another kind keeps its other kind", async () => {
    // Speech-catalogue entries carry exactly `["narration"]` today, but the rule is about
    // the KIND, not the entry — stripping the whole model would be a different rule that
    // happens to agree right now.
    const dual = { ...otherSpeech, kinds: ["narration", "music"] };
    const narrowed = narrowNarrationModels([dual], "hexgrad/kokoro-82m");
    expect(narrowed).toEqual([{ ...dual, kinds: ["music"] }]);
  });
});
