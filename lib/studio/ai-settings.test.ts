import { describe, expect, it } from "vitest";

import {
  FAITH_ALIGNMENTS,
  SELECTABLE_KINDS,
  modelsFor,
  needsFaithAlignment,
  providerOptionsFor,
  resolveChoice,
  settingsAfterProviderChange,
} from "./ai-settings";
import type { AiGenerationSettings, AiModelInfo } from "../api/contracts";
import type { ConnectionsState } from "../connections/connections-model";

/**
 * U-AS5..U-AS8 — the pure rules behind the Inspector's provider/model selectors.
 *
 * Item 1 says each selector offers "Gloo AI" and "OpenRouter", OpenRouter only if set up,
 * and defaults to what the system uses today. Three separate facts decide whether an
 * option can be chosen, and the design says an unavailable option must be shown as
 * PRESENT-but-disabled with a plain-language reason (13a's Pattern B), never hidden:
 *
 *   1. is the provider CONNECTED? (`GET /v1/connections` — non-null means connected)
 *   2. does the compatibility matrix allow it for this kind?
 *   3. does the live catalogue actually have a model for it?
 *
 * (1) and (2) fail for genuinely different reasons and the user can act on only one of
 * them, so the reasons must be distinguishable — an unconnected OpenRouter gets a
 * `Link ▸` escape hatch, a Gloo-for-narration does not, because there is nothing the user
 * can do about Gloo not having speech models.
 */

const connected = (
  overrides: Partial<Record<"gloo" | "openrouter", boolean>> = {},
): ConnectionsState =>
  ({
    github: { provider: "github", status: "connected" },
    openrouter: {
      provider: "openrouter",
      status: overrides.openrouter === false ? "not-linked" : "connected",
    },
    gloo: {
      provider: "gloo",
      status: overrides.gloo === false ? "not-linked" : "connected",
    },
  }) as ConnectionsState;

const CATALOGUE: AiModelInfo[] = [
  {
    id: "vendor/img",
    provider: "openrouter",
    label: "Vendor Image",
    kinds: ["image"],
    pricing: { perImage: 0.03 },
  },
  {
    id: "gloo-vendor-flux",
    provider: "gloo",
    label: "Vendor Flux",
    kinds: ["image"],
    pricing: null,
  },
  {
    id: "vendor/tts",
    provider: "openrouter",
    label: "Vendor TTS",
    kinds: ["narration", "music"],
    pricing: { perInputToken: 0.000004 },
  },
];

const DEFAULTS = {
  image: { provider: "openrouter" as const, model: "vendor/img" },
  narration: { provider: "openrouter" as const, model: "vendor/tts" },
  music: { provider: "openrouter" as const, model: "vendor/tts" },
  video: { provider: "openrouter" as const, model: "vendor/video" },
};

describe("the vocabulary", () => {
  it("U-AS5a: exactly four selectable kinds, and the text kinds are NOT among them", () => {
    // Item 1 names image, narration and music; item 4 adds video. The text kinds have no
    // selector, so giving them one would invent a control the task did not ask for.
    expect([...SELECTABLE_KINDS]).toEqual(["image", "narration", "music", "video"]);
  });

  it("U-AS5b: exactly the four REAL faith alignments — no protestant, no orthodox", () => {
    // Gloo returns 200 for `protestant` and `orthodox` and silently degrades to neutral,
    // so an unreal option in this list would be an invisible failure, not a rejected one.
    expect([...FAITH_ALIGNMENTS].sort()).toEqual([
      "catholic",
      "evangelical",
      "mainline",
      "not_faith_specific",
    ]);
  });
});

describe("providerOptionsFor (U-AS7, U-AS8)", () => {
  it("U-AS7: both providers are selectable for `image` when both are connected", () => {
    const options = providerOptionsFor("image", connected(), CATALOGUE);
    expect(options.map((o) => o.provider)).toEqual(["gloo", "openrouter"]);
    expect(options.every((o) => o.available)).toBe(true);
    // The design's committed vocabulary — bare names, exactly as drawn on 10a/10b.
    expect(options.map((o) => o.label)).toEqual(["Gloo AI", "OpenRouter"]);
  });

  it("U-AS8a: an unconnected provider is PRESENT but unavailable, with a Link escape hatch", () => {
    const options = providerOptionsFor("image", connected({ openrouter: false }), CATALOGUE);
    const or = options.find((o) => o.provider === "openrouter")!;
    expect(or.available).toBe(false);
    expect(or.connectable).toBe(true);
    expect(or.reason).toMatch(/not connected/i);
    // Present, not filtered out: hiding it would leave the user with no way to discover
    // that the option exists at all (13a Pattern B).
    expect(options).toHaveLength(2);
  });

  it("U-AS8b: Gloo for narration/music/video is unavailable for a DIFFERENT, un-actionable reason", () => {
    const options = providerOptionsFor("narration", connected(), CATALOGUE);
    const gloo = options.find((o) => o.provider === "gloo")!;
    expect(gloo.available).toBe(false);
    // NOT connectable: the user is already connected, and there is nothing they can do —
    // Gloo has no speech models (its speech route answers 404, and its catalogue has zero
    // audio entries). Offering a `Link ▸` here would send them somewhere useless.
    expect(gloo.connectable).toBeFalsy();
    expect(gloo.reason).toMatch(/speech/i);

    expect(
      providerOptionsFor("video", connected(), CATALOGUE).find(
        (o) => o.provider === "gloo",
      )!.reason,
    ).toMatch(/video/i);
  });

  it("U-AS8c: connected + matrix-allowed but NO catalogue model is its own reason", () => {
    // A catalogue read that came back empty for one provider must not present a picker
    // that produces a generation with no model id.
    const gloo = providerOptionsFor("image", connected(), [CATALOGUE[0]]).find(
      (o) => o.provider === "gloo",
    )!;
    expect(gloo.available).toBe(false);
    expect(gloo.reason).toMatch(/no models/i);
  });

  it("U-AS8d: an UNRESOLVED session is not treated as signed-out", () => {
    // `isAuthed === false` also means "we have not asked yet"; the same trap applies to
    // connections, which arrive on the session bootstrap. A null connections state means
    // "unknown", and an unknown must not be rendered as a hard "not connected" with a
    // Link button the user does not need.
    const options = providerOptionsFor("image", null, CATALOGUE);
    expect(options.every((o) => o.available)).toBe(false);
    expect(options.every((o) => /loading|checking/i.test(o.reason ?? ""))).toBe(true);
    expect(options.every((o) => o.connectable !== true)).toBe(true);
  });
});

describe("modelsFor", () => {
  it("returns only models of that provider that can serve that kind", () => {
    expect(modelsFor("image", "openrouter", CATALOGUE).map((m) => m.id)).toEqual([
      "vendor/img",
    ]);
    expect(modelsFor("image", "gloo", CATALOGUE).map((m) => m.id)).toEqual([
      "gloo-vendor-flux",
    ]);
    expect(modelsFor("narration", "gloo", CATALOGUE)).toEqual([]);
  });
});

describe("resolveChoice (U-AS5, U-AS6)", () => {
  it("U-AS5: with no manifest choice, the answer is the SYSTEM default", () => {
    // "Each defaults to whatever the system currently uses today" — which is
    // `resolveGenerationTarget(kind)`, resolved server-side and published by the BFF
    // alongside the catalogue. It is deliberately NOT written into the manifest until the
    // user actually changes something: a default frozen into a file committed to the
    // user's repo stops being a default.
    expect(resolveChoice("image", undefined, DEFAULTS, CATALOGUE)).toEqual({
      provider: "openrouter",
      model: "vendor/img",
    });
  });

  it("U-AS6: a manifest choice WINS over the system default", () => {
    const settings: AiGenerationSettings = {
      image: { provider: "gloo", model: "gloo-vendor-flux" },
    };
    expect(resolveChoice("image", settings, DEFAULTS, CATALOGUE)).toEqual({
      provider: "gloo",
      model: "gloo-vendor-flux",
    });
  });

  it("U-AS6b: a provider-only choice resolves a model from the catalogue", () => {
    // "Use Gloo, whatever model" is a legitimate persisted state (D-A) — the manifest may
    // carry a provider with no model. The picker still has to show something selected.
    const settings: AiGenerationSettings = { image: { provider: "gloo" } };
    expect(resolveChoice("image", settings, DEFAULTS, CATALOGUE)).toEqual({
      provider: "gloo",
      model: "gloo-vendor-flux",
    });
  });

  it("U-AS6c: a persisted model that has left the catalogue is kept, not silently swapped", () => {
    // A model can be retired upstream between two studio sessions. Silently substituting
    // a different one would change what the project generates with no indication; keeping
    // the id lets the picker show it as the current (if unlisted) value and lets the
    // provider be the one to reject it.
    const settings: AiGenerationSettings = {
      image: { provider: "openrouter", model: "vendor/retired" },
    };
    expect(resolveChoice("image", settings, DEFAULTS, CATALOGUE)).toEqual({
      provider: "openrouter",
      model: "vendor/retired",
    });
  });
});

describe("needsFaithAlignment / settingsAfterProviderChange (U-SV2)", () => {
  it("faith alignment is shown only while at least one kind runs on Gloo", () => {
    // Item 2: "not shown for OpenRouter". Since only `image` can be on Gloo, that is the
    // only thing that can make it relevant.
    expect(needsFaithAlignment(undefined, DEFAULTS)).toBe(false);
    expect(needsFaithAlignment({ image: { provider: "gloo" } }, DEFAULTS)).toBe(true);
    expect(needsFaithAlignment({ image: { provider: "openrouter" } }, DEFAULTS)).toBe(
      false,
    );
  });

  it("it is also shown when the SYSTEM DEFAULT is Gloo and the user has chosen nothing", () => {
    const glooDefaults = { ...DEFAULTS, image: { provider: "gloo" as const, model: "x" } };
    expect(needsFaithAlignment(undefined, glooDefaults)).toBe(true);
  });

  it("U-SV2: moving the last Gloo kind away CLEARS faithAlignment", () => {
    // Otherwise the manifest keeps a faith alignment that nothing reads, it survives into
    // the user's committed repo, and it silently comes back into force the moment they
    // switch back — a setting that reappears without being re-chosen.
    const before: AiGenerationSettings = {
      faithAlignment: "catholic",
      image: { provider: "gloo", model: "gloo-vendor-flux" },
    };
    const after = settingsAfterProviderChange(before, "image", "openrouter", DEFAULTS);
    expect(after.image?.provider).toBe("openrouter");
    expect(after.faithAlignment).toBeUndefined();
  });

  it("U-SV2b: a provider change also drops the now-wrong model id", () => {
    // A Gloo model id sent to OpenRouter is a 400 minutes later. The picker re-resolves a
    // default for the new provider rather than carrying the old id across.
    const before: AiGenerationSettings = {
      image: { provider: "gloo", model: "gloo-vendor-flux" },
    };
    expect(
      settingsAfterProviderChange(before, "image", "openrouter", DEFAULTS).image?.model,
    ).toBeUndefined();
  });
});
