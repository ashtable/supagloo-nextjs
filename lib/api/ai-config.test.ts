import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveGenerationTarget, DEFAULT_GENERATION_MODELS } from "./ai-config";

/**
 * Task #35 — the BFF-side provider/model resolver. The studio client never picks a
 * provider or model; it posts `{kind, projectId?, sceneId?, input}` and the BFF
 * enriches with `{provider, model}` via this pure resolver (server-side, env-
 * overridable, not in the client bundle). Provider defaults per kind — openrouter
 * everywhere except `image`, which defaults to gloo — and the model comes from
 * `SUPAGLOO_AI_MODEL_<KIND>` with a documented last-known-good fallback.
 */
/** The intended default provider per kind. `image` is gloo (faith-aligned generation is
 *  the product's reason to exist, and Gloo has image-capable models since 2026-07-28);
 *  narration/music/video are openrouter-ONLY in the matrix; text kinds allow gloo but
 *  stay on openrouter. */
const EXPECTED_DEFAULT_PROVIDER = {
  storyboard: "openrouter",
  script: "openrouter",
  image: "gloo",
  narration: "openrouter",
  music: "openrouter",
  video: "openrouter",
} as const;

const ALL_KINDS = [
  "storyboard",
  "script",
  "image",
  "narration",
  "music",
  "video",
] as const;

describe("resolveGenerationTarget", () => {
  it("defaults each kind to its intended provider and per-kind model", () => {
    for (const kind of ALL_KINDS) {
      const t = resolveGenerationTarget(kind, {});
      expect(`${kind}:${t.provider}`).toBe(`${kind}:${EXPECTED_DEFAULT_PROVIDER[kind]}`);
      expect(t.model).toBe(DEFAULT_GENERATION_MODELS[kind]);
      expect(t.model.length).toBeGreaterThan(0);
    }
  });

  it("pairs every default model with an id from its default provider's namespace", () => {
    // The failure this exists to catch: moving a kind's default PROVIDER without moving
    // its default MODEL (or vice versa). The pair is posted to
    // `POST /v1/ai/generations` together, where the api enforces the compatibility matrix
    // and answers 422 — so a mismatch is not a subtle degradation, it is every generation
    // of that kind failing at enqueue. Gloo ids are `gloo-`-prefixed; OpenRouter ids are
    // `vendor/model`.
    for (const kind of ALL_KINDS) {
      const { provider, model } = resolveGenerationTarget(kind, {});
      if (provider === "gloo") {
        expect(`${kind}:${model}`).toMatch(/^[a-z]+:gloo-/);
      } else {
        expect(`${kind}:${model}`).toMatch(/^[a-z]+:[^/]+\/.+/);
        expect(model.startsWith("gloo-")).toBe(false);
      }
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
