import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

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

// ── Task #57 (item 2): make the override-vs-fallback path OBSERVABLE ───────────
describe("resolveGenerationTarget — override/fallback logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits a distinguishable 'fallback' log line for the model when no override is set", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    resolveGenerationTarget("image", {});
    const lines = info.mock.calls.map((c) => String(c[0]));
    // one line clearly names the MODEL path as a built-in fallback + the kind + value
    const modelLine = lines.find((l) => /\bmodel\b/i.test(l));
    expect(modelLine).toBeDefined();
    expect(modelLine).toMatch(/fallback/i);
    expect(modelLine).toContain("image");
    expect(modelLine).toContain(DEFAULT_GENERATION_MODELS.image);
    expect(modelLine).not.toMatch(/override/i);
  });

  it("emits a distinguishable 'override' log line for the model when SUPAGLOO_AI_MODEL_<KIND> wins", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    resolveGenerationTarget("image", { SUPAGLOO_AI_MODEL_IMAGE: "some/custom-image-model" });
    const lines = info.mock.calls.map((c) => String(c[0]));
    const modelLine = lines.find((l) => /\bmodel\b/i.test(l));
    expect(modelLine).toBeDefined();
    expect(modelLine).toMatch(/override/i);
    expect(modelLine).toContain("image");
    expect(modelLine).toContain("some/custom-image-model");
    expect(modelLine).not.toMatch(/fallback/i);
  });

  it("uses a single greppable prefix on every line", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    resolveGenerationTarget("music", {});
    expect(info).toHaveBeenCalled();
    for (const call of info.mock.calls) {
      expect(String(call[0])).toContain("[supagloo:ai-config]");
    }
  });
});

// ── Task #57 (item 2): the override vars are DOCUMENTED in .env.example ────────
describe(".env.example documents the AI model/provider overrides", () => {
  const env = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");

  it("lists every SUPAGLOO_AI_MODEL_<KIND> var", () => {
    for (const kind of ["STORYBOARD", "SCRIPT", "IMAGE", "NARRATION", "MUSIC", "VIDEO"]) {
      expect(env).toContain(`SUPAGLOO_AI_MODEL_${kind}`);
    }
  });

  it("also lists the SUPAGLOO_AI_PROVIDER_<KIND> override", () => {
    expect(env).toContain("SUPAGLOO_AI_PROVIDER_");
  });
});
