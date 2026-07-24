import { describe, expect, it } from "vitest";

import { resolveGenerationTarget, DEFAULT_GENERATION_MODELS } from "./ai-config";

/**
 * Task #35 — the BFF-side provider/model resolver. The studio client never picks a
 * provider or model; it posts `{kind, projectId?, sceneId?, input}` and the BFF
 * enriches with `{provider, model}` via this pure resolver (server-side, env-
 * overridable, not in the client bundle). Provider defaults to openrouter for every
 * kind (valid across the whole matrix); model comes from `SUPAGLOO_AI_MODEL_<KIND>`
 * with a documented last-known-good fallback.
 */
describe("resolveGenerationTarget", () => {
  it("defaults provider to openrouter and model to the per-kind fallback", () => {
    for (const kind of [
      "storyboard",
      "script",
      "image",
      "narration",
      "music",
      "video",
    ] as const) {
      const t = resolveGenerationTarget(kind, {});
      expect(t.provider).toBe("openrouter");
      expect(t.model).toBe(DEFAULT_GENERATION_MODELS[kind]);
      expect(t.model.length).toBeGreaterThan(0);
    }
  });

  it("lets SUPAGLOO_AI_MODEL_<KIND> override the model per kind", () => {
    const t = resolveGenerationTarget("image", {
      SUPAGLOO_AI_MODEL_IMAGE: "some/custom-image-model",
    });
    expect(t.model).toBe("some/custom-image-model");
    // an override for another kind does not leak
    expect(resolveGenerationTarget("music", {
      SUPAGLOO_AI_MODEL_IMAGE: "some/custom-image-model",
    }).model).toBe(DEFAULT_GENERATION_MODELS.music);
  });

  it("lets SUPAGLOO_AI_PROVIDER_<KIND> override the provider (e.g. gloo for text)", () => {
    const t = resolveGenerationTarget("storyboard", {
      SUPAGLOO_AI_PROVIDER_STORYBOARD: "gloo",
    });
    expect(t.provider).toBe("gloo");
  });

  it("ignores an empty-string env value (falls back to the default)", () => {
    const t = resolveGenerationTarget("script", {
      SUPAGLOO_AI_MODEL_SCRIPT: "",
      SUPAGLOO_AI_PROVIDER_SCRIPT: "",
    });
    expect(t.provider).toBe("openrouter");
    expect(t.model).toBe(DEFAULT_GENERATION_MODELS.script);
  });
});
