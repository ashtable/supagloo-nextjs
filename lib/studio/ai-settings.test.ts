import { describe, expect, it } from "vitest";

import {
  FAITH_ALIGNMENTS,
  FAITH_ALIGNMENT_HELP,
  FAITH_ALIGNMENT_LABELS,
  SELECTABLE_KINDS,
  generationActionAvailability,
  kindAvailability,
  modelsFor,
  needsFaithAlignment,
  providerOptionsFor,
  resolveChoice,
  settingsAfterProviderChange,
} from "./ai-settings";
import type { AiGenerationSettings, AiModelInfo } from "../api/contracts";
import type { ProviderConnectivity } from "../api/ai-matrix";

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

/**
 * The connection input, RETYPED on 2026-07-31 (R4–R8 decision D4).
 *
 * It used to be the client's `ConnectionsState`. That state is a lie in two directions:
 * `applyConnectionsBase` never sets not-linked and the hydrate effect returns early on a
 * failed read, so it conflates "not connected" with "we could not ask"; and the
 * `?seed=authed-returning` mock seed pre-marks GitHub + OpenRouter connected regardless of
 * the database, which has already made a connect helper a silent no-op once.
 *
 * The Studio now reads `AiModelCatalogueResponse.providers` instead — server-derived,
 * already fetched, Zod-parsed, and explicitly documented (api `model-catalogue-service.ts`)
 * as answering "is the user CONNECTED", not "did the catalogue read succeed". `null` still
 * means UNKNOWN, and the reader that produces it (`fetchModelCatalogue`) returns null on
 * any failure and never throws — so "we could not ask" is structurally distinct here in a
 * way it never was for `ConnectionsState`.
 */
const connected = (
  overrides: Partial<ProviderConnectivity> = {},
): ProviderConnectivity => ({
  gloo: overrides.gloo !== false,
  openrouter: overrides.openrouter !== false,
});

const CATALOGUE: AiModelInfo[] = [
  {
    id: "vendor/img",
    provider: "openrouter",
    label: "Vendor Image",
    kinds: ["image"],
    pricing: { perOutputImageToken: 0.00006 },
    voices: null,
  },
  {
    id: "gloo-vendor-flux",
    provider: "gloo",
    label: "Vendor Flux",
    kinds: ["image"],
    pricing: null,
    voices: null,
  },
  {
    id: "vendor/tts",
    provider: "openrouter",
    label: "Vendor TTS",
    kinds: ["narration", "music"],
    pricing: { perInputToken: 0.000004 },
    voices: null,
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

  it("U-AS8b2: with OpenRouter unlinked, SCENE VIDEO has NO available provider at all", () => {
    // The two reasons compose into a third fact the panel acts on. Video is
    // openrouter-ONLY (Gloo's catalogue has zero video entries and its video route 404s),
    // so with OpenRouter unlinked BOTH options are unavailable and the kind cannot be
    // configured by any means. `ai-settings-panel.tsx` derives `kindAvailable` from
    // exactly this and disables the model select and dims the cost readout — otherwise
    // the section offered a live model picker and a crisp price for a generation that
    // could not be run.
    const options = providerOptionsFor("video", connected({ openrouter: false }), CATALOGUE);
    expect(options.some((o) => o.available)).toBe(false);

    // …and it still EXPLAINS itself: OpenRouter's half stays actionable (`Link ▸`),
    // Gloo's does not. A dead section with no reason would be the worse bug.
    const or = options.find((o) => o.provider === "openrouter")!;
    expect(or.connectable).toBe(true);
    expect(options.find((o) => o.provider === "gloo")!.connectable).toBeFalsy();

    // Contrast: image survives losing OpenRouter, because Gloo can serve it. The gate
    // must be per-kind, never "OpenRouter is down, disable the panel".
    expect(
      providerOptionsFor("image", connected({ openrouter: false }), CATALOGUE).some(
        (o) => o.available,
      ),
    ).toBe(true);
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

/**
 * R5 / R7 / D2 / D3 — "can this kind be GENERATED at all right now?"
 *
 * ## Why this is a different question from `providerOptionsFor`
 *
 * `providerOptionsFor` answers "which provider TABS can be clicked", and it requires the
 * live catalogue to hold a model for that provider. `kindAvailability` answers "should the
 * ↻ / ▶ ACTION button be live", and it is deliberately connection-only:
 *
 *   · it must work for `storyboard`, which has no selector and therefore no catalogue
 *     entries at all (`narrowToSelectableKinds` drops it in the api) — a catalogue-aware
 *     rule would report `✦ Generate storyboard` as permanently dead;
 *   · a momentarily thin catalogue is not a reason to refuse to generate; an unconnected
 *     provider is, because the api will 409 it.
 *
 * They must not CONTRADICT each other, which is what `U-KA7` holds.
 */
describe("kindAvailability — R5/R7's honest disable", () => {
  it("U-KA1: narration is disabled when OpenRouter is not connected, and says so", () => {
    // R7. Gloo publishes zero speech models, so there is no fallback to reroute onto —
    // narration is simply unavailable, and the reason must name the provider the user
    // would have to connect.
    const v = kindAvailability("narration", connected({ openrouter: false }), CATALOGUE);
    expect(v.enabled).toBe(false);
    expect(v.reason).toMatch(/openrouter/i);
    expect(v.reason).toMatch(/not connected/i);
  });

  it("U-KA2: VIDEO is disabled on the same axis — R7 omits it, the matrix does not", () => {
    // THE DECISION THE USER DID NOT SPECIFY. R7 names image + music + narration. But
    // `AI_PROVIDERS_BY_KIND` makes `video` openrouter-ONLY too, so with no OpenRouter the
    // per-scene `▶ Generate video` control is exactly as unusable as music and narration.
    // Leaving it live ships a button that cannot succeed — the precise dishonesty R5/R7
    // exist to remove.
    const video = kindAvailability("video", connected({ openrouter: false }), CATALOGUE);
    const music = kindAvailability("music", connected({ openrouter: false }), CATALOGUE);
    expect(video.enabled).toBe(false);
    expect(video.reason).toBe(music.reason); // same axis, same words
  });

  it("U-KA3: image SURVIVES losing Gloo — R7's 'they can still do image generation'", () => {
    // The control against over-disabling. Image is the one media kind with two providers,
    // so losing either one must leave it live.
    expect(kindAvailability("image", connected({ gloo: false }), CATALOGUE).enabled).toBe(
      true,
    );
    expect(
      kindAvailability("image", connected({ openrouter: false }), CATALOGUE).enabled,
    ).toBe(true);
  });

  it("U-KA4: with NEITHER provider connected every kind is disabled, with a general reason", () => {
    // D3 — an existing project can still be OPENED with no connections (R3 only blocks
    // creation). Nothing may be generated, and the reason cannot name one provider,
    // because either would do.
    const none: ProviderConnectivity = { gloo: false, openrouter: false };
    for (const kind of ["storyboard", "script", "image", "narration", "music", "video"] as const) {
      const v = kindAvailability(kind, none, CATALOGUE);
      expect(v.enabled, `${kind} must be disabled with nothing connected`).toBe(false);
      expect(v.reason, `${kind} must state a reason`).toBeTruthy();
    }
    expect(kindAvailability("image", none, CATALOGUE).reason).toMatch(
      /no model provider/i,
    );
  });

  it("U-KA5: UNKNOWN connectivity reads 'Checking…', never 'not connected'", () => {
    // Same trap as `isAuthed === false`: a failed or in-flight read is not an answer about
    // the user's data. Telling a connected user to go and connect is the bug this prevents,
    // and it has shipped once already.
    const v = kindAvailability("narration", null, CATALOGUE);
    expect(v.enabled).toBe(false);
    expect(v.reason).toMatch(/checking/i);
    expect(v.reason).not.toMatch(/not connected/i);
  });

  it("U-KA6: it answers for STORYBOARD, which has no selector and no catalogue entries", () => {
    // `✦ Generate storyboard` is the first-time generation entry point and the only path
    // R8's storyboard flip travels. The catalogue below holds no storyboard model at all —
    // exactly like production, where the api narrows the catalogue to the selectable kinds.
    expect(kindAvailability("storyboard", connected(), CATALOGUE).enabled).toBe(true);
    expect(
      kindAvailability("storyboard", connected({ gloo: false }), CATALOGUE).enabled,
    ).toBe(true); // repairs onto OpenRouter
    expect(
      kindAvailability("storyboard", { gloo: false, openrouter: false }, CATALOGUE).enabled,
    ).toBe(false);
  });

  it("U-KA8: an ACTION button treats UNKNOWN as permissive, while the picker still says 'Checking…'", () => {
    // The one place the picker rule and the button rule deliberately part company, and it
    // is a decision rather than an oversight.
    //
    // A picker with no catalogue has nothing to offer — choosing a provider whose models we
    // do not have would create a generation with no model id. A generate button with no
    // catalogue is FINE: it runs on the committed manifest settings plus the BFF's own
    // defaults and never reads the catalogue. `U-V69`/`U-V70`/`U-V71` are the standing
    // proof — a committed voice id and a committed narration model generate correctly both
    // while the read is in flight and after it has FAILED, which is a capability won by
    // fixing a real shipped bug.
    //
    // Refusing here would treat "we could not ask" as "the answer is no" and would take
    // that working capability away for a whole session from anyone whose `GET
    // /api/ai/models` blipped. The api's `409 provider_not_connected` is the backstop, so
    // being permissive costs a clear error instead of a dead button.
    for (const kind of ["storyboard", "image", "narration", "music", "video"] as const) {
      expect(kindAvailability(kind, null, CATALOGUE).enabled, `${kind} picker`).toBe(
        false,
      );
      expect(
        generationActionAvailability(kind, null, CATALOGUE).enabled,
        `${kind} action`,
      ).toBe(true);
    }
    // …and with connectivity KNOWN the two answer identically, so this is a null-only
    // divergence rather than a second rule.
    const states: ProviderConnectivity[] = [
      { gloo: true, openrouter: true },
      { gloo: true, openrouter: false },
      { gloo: false, openrouter: true },
      { gloo: false, openrouter: false },
    ];
    for (const kind of ["storyboard", "image", "narration", "music", "video"] as const) {
      for (const state of states) {
        expect(
          generationActionAvailability(kind, state, CATALOGUE),
          `${kind} @ ${JSON.stringify(state)}`,
        ).toEqual(kindAvailability(kind, state, CATALOGUE));
      }
    }
  });

  it("U-KA7: it never contradicts providerOptionsFor for the four selectable kinds", () => {
    // The two rules answer different questions, so they may DIFFER — a connected provider
    // with an empty catalogue is generatable-in-principle but not selectable. What they may
    // never do is disagree in the direction that matters: if a provider tab is clickable,
    // the action button must not be dead.
    const states: Array<ProviderConnectivity | null> = [
      connected(),
      connected({ gloo: false }),
      connected({ openrouter: false }),
      { gloo: false, openrouter: false },
      null,
    ];
    const contradictions: string[] = [];
    for (const kind of SELECTABLE_KINDS) {
      for (const state of states) {
        const anySelectable = providerOptionsFor(kind, state, CATALOGUE).some(
          (o) => o.available,
        );
        if (anySelectable && !kindAvailability(kind, state, CATALOGUE).enabled) {
          contradictions.push(`${kind} @ ${JSON.stringify(state)}`);
        }
      }
    }
    expect(contradictions).toEqual([]);
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

describe("faith-alignment vocabulary and scope (U-FA3)", () => {
  // The design commits to ONE user-facing word for this idea: `faith-aligned`. It is the
  // term 10a/10b and the onboarding wizard already use, and `ai-settings.ts` states the
  // rule in its own JSDoc — "never 'denomination' and never 'tradition'". A JSDoc is not
  // a gate, and both shipped strings broke it. These two tests make the rule executable
  // on every string this module publishes to the screen.
  //
  // NOTE the deliberate limit: this is about USER-FACING copy only. `tradition` is Gloo's
  // actual wire field name and must keep being called that in code and comments.
  const FORBIDDEN = ["tradition", "denomination"];

  it("U-FA3a: no user-facing label uses a forbidden word", () => {
    for (const [value, label] of Object.entries(FAITH_ALIGNMENT_LABELS)) {
      for (const word of FORBIDDEN) {
        expect(label.toLowerCase(), `${value} → "${label}"`).not.toContain(word);
      }
    }
  });

  it("U-FA3b: the help text is honest about SCOPE — Gloo image generation only", () => {
    for (const word of FORBIDDEN) {
      expect(FAITH_ALIGNMENT_HELP.toLowerCase()).not.toContain(word);
    }
    // The substantive half. `faithAlignment` reaches exactly one call site —
    // `studio-context.tsx`'s `rerollVisual`, guarded by `provider === "gloo"` — so it
    // steers Gloo IMAGE generation and nothing else. It does not reach narration, music or
    // video (Gloo serves none of them), and it does not reach the storyboard/script text
    // kinds, which have no selector and whose `CallLlmStructuredArgs` carries no
    // pass-through for it. Copy that implies otherwise promises steering the product does
    // not perform, and Gloo's silent 200-on-garbage means the user would never find out.
    expect(FAITH_ALIGNMENT_HELP.toLowerCase()).toContain("image");
  });
});
