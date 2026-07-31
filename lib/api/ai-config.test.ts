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
/** The intended default provider per kind — the R8 baseline (2026-07-31).
 *
 *  `image` and `storyboard` are gloo: faith-aligned generation is the product's reason to
 *  exist, so the two kinds that decide what the video LOOKS like and what it SAYS run on
 *  the aligned provider. `storyboard` MOVED here from openrouter under R8; `image` has been
 *  gloo since 2026-07-28. `narration`/`music`/`video` are openrouter-ONLY in the matrix.
 *  `script` stays on openrouter ("everything else"). */
const EXPECTED_DEFAULT_PROVIDER = {
  storyboard: "gloo",
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

// ── R4 / R6 / R8 (2026-07-31): the ONE connection-aware resolver ───────────────
//
// R4 ("no Gloo ⇒ image on OpenRouter's newest Nano Banana"), R6 ("no OpenRouter ⇒ image
// stays on Gloo") and R8 ("both connected ⇒ Gloo for image + storyboard, OpenRouter for
// everything else") are NOT three special cases. They are one function of
// `(kind, env, connections)` with a documented precedence:
//
//   explicit manifest choice   (client-side, `resolveChoice` — not this module)
//   → connection-aware repair  (a provider we KNOW is unconnected is never chosen when a
//                               matrix-compatible connected one exists — a VETO, which is
//                               why it outranks the env override: an operator default that
//                               cannot run is not a default, it is a guaranteed error)
//   → deployment env override  (chooses among the VIABLE options)
//   → hard fallback            (the R8 baseline maps below)
//
// The table is written as literal ids ON PURPOSE. Reading the expectation out of the
// implementation's own constant would make this test agree with any value the constant
// happens to hold; every id below was re-verified against the live catalogues on
// 2026-07-31 (`GET openrouter.ai/api/v1/models`, `GET platform.ai.gloo.com/platform/v2/models`).

type Connectivity = { gloo: boolean; openrouter: boolean };

const BOTH: Connectivity = { gloo: true, openrouter: true };
const GLOO_ONLY: Connectivity = { gloo: true, openrouter: false };
const OR_ONLY: Connectivity = { gloo: false, openrouter: true };
const NEITHER: Connectivity = { gloo: false, openrouter: false };

/** Live-verified 2026-07-31. */
const GLOO_TEXT = "gloo-google-gemini-2.5-flash";
const GLOO_IMAGE = "gloo-google-gemini-2.5-flash-image";
const OR_TEXT = "google/gemma-4-26b-a4b-it:free";
/** "Google: Nano Banana 2 (Gemini 3.1 Flash Image)" — R4's target, per user direction. */
const OR_IMAGE = "google/gemini-3.1-flash-image";
const OR_NARRATION = "hexgrad/kokoro-82m";
const OR_MUSIC = "google/lyria-3-clip-preview";
const OR_VIDEO = "x-ai/grok-imagine-video";

const g = (model: string) => ({ provider: "gloo", model });
const o = (model: string) => ({ provider: "openrouter", model });

/**
 * THE TABLE. Six kinds × four connectivity states, with `env = {}`.
 *
 * Reading it: the `both` column IS R8. The `orOnly` column is R4 (image flips to
 * OpenRouter). The `glooOnly` column is R6 (image does NOT flip away from Gloo) plus the
 * text kinds repairing onto Gloo. The `neither` column is the both-missing decision — keep
 * the PREFERRED provider rather than inventing one, and let the api's 409 refuse honestly.
 */
const TARGET_TABLE = {
  storyboard: {
    both: g(GLOO_TEXT), // ← R8's only behavioural change: was openrouter
    glooOnly: g(GLOO_TEXT),
    orOnly: o(OR_TEXT),
    neither: g(GLOO_TEXT),
  },
  script: {
    both: o(OR_TEXT),
    glooOnly: g(GLOO_TEXT),
    orOnly: o(OR_TEXT),
    neither: o(OR_TEXT),
  },
  image: {
    both: g(GLOO_IMAGE), // R8
    glooOnly: g(GLOO_IMAGE), // R6
    orOnly: o(OR_IMAGE), // R4
    neither: g(GLOO_IMAGE),
  },
  // The three openrouter-ONLY kinds in `AI_PROVIDERS_BY_KIND`: there is no second provider
  // to repair onto, so connectivity cannot move them. What connectivity DOES do for them is
  // handled entirely by the UI disable (R7) and the api's 409.
  narration: {
    both: o(OR_NARRATION),
    glooOnly: o(OR_NARRATION),
    orOnly: o(OR_NARRATION),
    neither: o(OR_NARRATION),
  },
  music: {
    both: o(OR_MUSIC),
    glooOnly: o(OR_MUSIC),
    orOnly: o(OR_MUSIC),
    neither: o(OR_MUSIC),
  },
  video: {
    both: o(OR_VIDEO),
    glooOnly: o(OR_VIDEO),
    orOnly: o(OR_VIDEO),
    neither: o(OR_VIDEO),
  },
} as const;

const CONNECTIVITY_COLUMNS = [
  ["both", BOTH],
  ["glooOnly", GLOO_ONLY],
  ["orOnly", OR_ONLY],
  ["neither", NEITHER],
] as const;

describe("resolveGenerationTarget — the connection-aware resolver (R4/R6/R8)", () => {
  it("U-DT1: resolves the whole (kind × connectivity) table", () => {
    const actual: Record<string, Record<string, unknown>> = {};
    const expected: Record<string, Record<string, unknown>> = {};
    for (const kind of ALL_KINDS) {
      actual[kind] = {};
      expected[kind] = {};
      for (const [column, connected] of CONNECTIVITY_COLUMNS) {
        actual[kind][column] = resolveGenerationTarget(kind, {}, connected);
        expected[kind][column] = TARGET_TABLE[kind][column];
      }
    }
    // One assertion over the whole grid so a failure names every cell that moved, not the
    // first one.
    expect(actual).toEqual(expected);
  });

  it("U-DT2: the table covers EXACTLY the six generation kinds", () => {
    // The point of the table is that a seventh kind cannot be added without someone making
    // a connection-aware decision for it. This is the assertion that forces that.
    expect(Object.keys(TARGET_TABLE).sort()).toEqual([...ALL_KINDS].sort());
  });

  it("U-DT3: UNKNOWN connectivity resolves exactly like the connection-blind default", () => {
    // `null` means "we could not ask" — a failed `/api/connections` read, or the pre-answer
    // window. It must never be read as "not connected": doing so would silently move a
    // connected user's defaults on every network blip. It must also never blank the answer.
    for (const kind of ALL_KINDS) {
      const unknown = resolveGenerationTarget(kind, {}, null);
      const blind = resolveGenerationTarget(kind, {});
      expect(`${kind}:${JSON.stringify(unknown)}`).toBe(
        `${kind}:${JSON.stringify(blind)}`,
      );
      expect(unknown.model.length).toBeGreaterThan(0);
    }
  });

  it("U-DT4: R8 — both connected puts image + storyboard on Gloo and the rest on OpenRouter", () => {
    const byKind = Object.fromEntries(
      ALL_KINDS.map((k) => [k, resolveGenerationTarget(k, {}, BOTH).provider]),
    );
    expect(byKind).toEqual({
      storyboard: "gloo",
      image: "gloo",
      script: "openrouter",
      narration: "openrouter",
      music: "openrouter",
      video: "openrouter",
    });
  });

  it("U-DT5: R4 — no Gloo puts image on OpenRouter's newest Nano Banana", () => {
    expect(resolveGenerationTarget("image", {}, OR_ONLY)).toEqual({
      provider: "openrouter",
      model: OR_IMAGE,
    });
  });

  it("U-DT6: R6 — no OpenRouter keeps image on Gloo's default image model", () => {
    expect(resolveGenerationTarget("image", {}, GLOO_ONLY)).toEqual({
      provider: "gloo",
      model: GLOO_IMAGE,
    });
  });

  it("U-DT7: neither connected keeps the PREFERRED provider (the api refuses, we do not guess)", () => {
    // The both-missing decision. Inventing a provider here would send a generation to a
    // service the user has never connected and fail deep inside DBOS; keeping the preferred
    // one means the UI shows a coherent selection and `POST /v1/ai/generations` answers a
    // 409 the user can act on.
    expect(resolveGenerationTarget("image", {}, NEITHER).provider).toBe("gloo");
    expect(resolveGenerationTarget("storyboard", {}, NEITHER).provider).toBe("gloo");
    expect(resolveGenerationTarget("script", {}, NEITHER).provider).toBe("openrouter");
  });

  it("U-DT8: every resolved provider is matrix-compatible for its kind, in every state", () => {
    // The repair must never route a kind onto a provider the api's 422 would reject.
    const MATRIX: Record<string, readonly string[]> = {
      storyboard: ["gloo", "openrouter"],
      script: ["gloo", "openrouter"],
      image: ["gloo", "openrouter"],
      narration: ["openrouter"],
      music: ["openrouter"],
      video: ["openrouter"],
    };
    const bad: string[] = [];
    for (const kind of ALL_KINDS) {
      for (const [column, connected] of CONNECTIVITY_COLUMNS) {
        const { provider } = resolveGenerationTarget(kind, {}, connected);
        if (!MATRIX[kind].includes(provider)) bad.push(`${kind}/${column} → ${provider}`);
      }
      const unknown = resolveGenerationTarget(kind, {}, null);
      if (!MATRIX[kind].includes(unknown.provider)) {
        bad.push(`${kind}/unknown → ${unknown.provider}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("U-DT9: SUPAGLOO_AI_PROVIDER_<KIND> sets the preference — and is still repaired when unconnected", () => {
    const env = { SUPAGLOO_AI_PROVIDER_SCRIPT: "gloo" };
    // Viable: the operator's choice stands.
    expect(resolveGenerationTarget("script", env, BOTH).provider).toBe("gloo");
    // Not viable: the veto wins. An operator default that cannot run is not a default.
    expect(resolveGenerationTarget("script", env, OR_ONLY).provider).toBe("openrouter");
    // Nothing connected: nothing to repair onto, so the operator's preference is kept.
    expect(resolveGenerationTarget("script", env, NEITHER).provider).toBe("gloo");
  });

  it("U-DT10: SUPAGLOO_AI_MODEL_<KIND> binds to the PREFERRED provider — it never leaks across a repair", () => {
    // The failure this exists to prevent: an operator pins the image model to a Gloo id, a
    // user with no Gloo connection gets repaired onto OpenRouter, and we post a `gloo-…` id
    // to OpenRouter. That is an unknown-model 400 that reads like a broken provider —
    // exactly what `app/api/ai/generations/route.ts` already warns about for the
    // half-specified client override.
    const env = { SUPAGLOO_AI_MODEL_IMAGE: "gloo-operator-pinned-image" };
    expect(resolveGenerationTarget("image", env, BOTH)).toEqual({
      provider: "gloo",
      model: "gloo-operator-pinned-image",
    });
    expect(resolveGenerationTarget("image", env, OR_ONLY)).toEqual({
      provider: "openrouter",
      model: OR_IMAGE,
    });
  });

  it("U-DT11: SUPAGLOO_AI_MODEL_<KIND>_<PROVIDER> overrides exactly one slot", () => {
    const env = {
      SUPAGLOO_AI_MODEL_IMAGE_OPENROUTER: "vendor/custom-image",
      SUPAGLOO_AI_MODEL_IMAGE_GLOO: "gloo-custom-image",
    };
    expect(resolveGenerationTarget("image", env, OR_ONLY).model).toBe(
      "vendor/custom-image",
    );
    expect(resolveGenerationTarget("image", env, GLOO_ONLY).model).toBe(
      "gloo-custom-image",
    );
    // A slot override for another kind does not leak.
    expect(resolveGenerationTarget("video", env, BOTH).model).toBe(OR_VIDEO);
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
