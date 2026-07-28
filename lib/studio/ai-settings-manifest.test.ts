import { describe, expect, it } from "vitest";

import { hydrateStoryboard, serializeManifest } from "./manifest-adapter";
import { ProjectManifestSchema, type ProjectManifest } from "../api/contracts";

/**
 * U-AS9/U-AS10/U-AS14 — the nextjs half of the four-mirror walk for `aiSettings`.
 *
 * The mirrors are: db-lib's schema, dbos's `canonicalizeManifest`, this repo's
 * hand-copied `contracts.ts`, and this adapter — **both directions**. Missing any of them
 * erases the field, and the erasure is silent: the setting appears to save, survives until
 * the next commit, and then reverts to the system default with nothing on screen to say
 * so. That exact bug already shipped once, to `narratorVoice.assetKey`.
 *
 * The invariant that catches all of it in one assertion is the round-trip identity:
 * `serializeManifest(hydrateStoryboard(m), m)` deep-equals `m`. It is asserted BOTH with
 * `aiSettings` present and with it absent, because the two failure modes are different —
 * dropping a value, versus materializing an `undefined` key that was never there.
 */

const BASE: ProjectManifest = {
  manifestVersion: 1,
  composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
  scenes: [
    {
      id: "s1",
      name: "wilderness · dawn",
      scriptText: "I am the voice of one",
      reference: "JOHN 1:23",
      translation: "KJV",
      visualPrompt: "sweeping empty wilderness at first light",
      durationSeconds: 5,
      captions: true,
    },
  ],
  narratorVoice: { description: "warm, weathered, resonant baritone" },
};

const WITH_SETTINGS: ProjectManifest = {
  ...BASE,
  aiSettings: {
    faithAlignment: "catholic",
    image: { provider: "gloo", model: "gloo-vendor-flux" },
    narration: { provider: "openrouter", model: "vendor/tts" },
  },
};

describe("aiSettings through the manifest adapter", () => {
  it("U-AS14: the hand-mirrored nextjs schema accepts what db-lib accepts", () => {
    // nextjs deliberately does not import db-lib (it hand-copies every wire type), so
    // drift between the two mirrors is invisible until a real manifest fails to parse in
    // a browser. This is the drift guard for the new block.
    const parsed = ProjectManifestSchema.safeParse(WITH_SETTINGS);
    expect(parsed.success, JSON.stringify(parsed)).toBe(true);

    // …and it rejects the values Gloo silently ignores, exactly as db-lib does.
    expect(
      ProjectManifestSchema.safeParse({
        ...BASE,
        aiSettings: { faithAlignment: "protestant" },
      }).success,
    ).toBe(false);
  });

  it("U-AS9: serialize ∘ hydrate is the identity WITH aiSettings present", () => {
    const sb = hydrateStoryboard(WITH_SETTINGS);
    expect(serializeManifest(sb, WITH_SETTINGS)).toEqual(WITH_SETTINGS);
  });

  it("U-AS10: …and with it ABSENT, absence stays absence", () => {
    const sb = hydrateStoryboard(BASE);
    const out = serializeManifest(sb, BASE);
    expect(out).toEqual(BASE);
    // Not merely deep-equal: the KEY must not exist. A materialized `undefined` would
    // serialize into the committed file as a spurious diff on every save.
    expect("aiSettings" in out).toBe(false);
  });

  it("U-AS9b: an EDITED setting is written back, not preserved from the base", () => {
    // The half the identity test cannot see. `serializeManifest` is a MERGE over the
    // source manifest, so a field that is only ever copied from `base` would round-trip
    // perfectly and still make the control inert.
    const sb = hydrateStoryboard(BASE);
    const edited = {
      ...sb,
      aiSettings: { image: { provider: "gloo" as const }, faithAlignment: "mainline" as const },
    };
    const out = serializeManifest(edited, BASE);
    expect(out.aiSettings).toEqual({
      image: { provider: "gloo" },
      faithAlignment: "mainline",
    });
    expect(ProjectManifestSchema.safeParse(out).success).toBe(true);
  });

  it("U-AS9c: clearing every setting removes the block rather than leaving an empty object", () => {
    const sb = hydrateStoryboard(WITH_SETTINGS);
    const cleared = { ...sb, aiSettings: {} };
    const out = serializeManifest(cleared, WITH_SETTINGS);
    expect("aiSettings" in out).toBe(false);
  });
});
