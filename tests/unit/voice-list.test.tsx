// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byTestId, mount, queryTestId, selectOption } from "./support/render";

/**
 * The narrator-voice picker — three cascading dropdowns over the LIVE provider
 * vocabulary.
 *
 * This replaces figure 19b's curated row list, on a direct user directive:
 *
 *   > "lets use 3 dropdown lists for the voice picker: language (default to English),
 *   >  gender (default to male), voice (default to the alphabetically sorted first
 *   >  american/english male voice)"
 *   > "no need for any other filter chips for the voice picker"
 *
 * So the search box, the four `All / Male / Female / Dramatic` chips, the three-word
 * descriptors and the `RECOMMENDED` badge are all GONE — the last because no provider
 * publishes a recommendation and the curated one was already wrong (it badged `alloy` for
 * a model whose vocabulary has no `alloy`).
 *
 * The pure grouping/default/remap logic lives in `lib/studio/speech-voices.test.ts`; this
 * file asserts only what needs a mounted tree: the CASCADE, the two honest-empty states,
 * and the controls that are deliberately absent.
 */

import VoiceList from "@/app/studio/_components/voice-list";

/** Kokoro's live vocabulary, trimmed to the groups these cases exercise. TEST DATA. */
const VOICES = [
  "af_alloy", "af_nova", "af_sky",
  "am_adam", "am_echo", "am_onyx",
  "bf_alice", "bm_daniel", "bm_george",
  "ff_siwis",
];

let mounted: { container: HTMLElement; unmount: () => void } | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

async function list(
  props: Partial<{
    modelId: string | null;
    voices: string[] | null;
    selectedVoiceId: string | undefined;
    onSelect: (id: string) => void;
  }> = {},
) {
  mounted = await mount(
    <VoiceList
      modelId={props.modelId === undefined ? "hexgrad/kokoro-82m" : props.modelId}
      voices={props.voices === undefined ? VOICES : props.voices}
      selectedVoiceId={props.selectedVoiceId}
      onSelect={props.onSelect ?? (() => {})}
    />,
  );
  return mounted.container;
}

const optionsOf = (c: HTMLElement, testId: string) =>
  [...byTestId(c, testId).querySelectorAll("option")].map((o) => o.value);

const valueOf = (c: HTMLElement, testId: string) =>
  (byTestId(c, testId) as HTMLSelectElement).value;

describe("VoiceList", () => {
  it("U-V40: renders LANGUAGE → GENDER → VOICE and derives the count", async () => {
    const c = await list();
    const el = byTestId(c, "voice-list");
    expect(Number(el.getAttribute("data-voice-count"))).toBe(VOICES.length);
    expect(el.textContent).toContain(`${VOICES.length} voices for this model`);
    for (const id of ["voice-language", "voice-gender", "voice-select"]) {
      expect(queryTestId(c, id), id).not.toBeNull();
    }
  });

  it("U-V41: the search box, the four chips, the descriptors and RECOMMENDED are GONE", async () => {
    // MOVED. This case used to assert "exactly one row carries the RECOMMENDED badge".
    // The badge had no provider backing (it was a property of the deleted curated table),
    // and the user cut the chips and the search box by name. A negative test, because the
    // failure mode is a later pass "restoring" them from figure 19b.
    const c = await list();
    expect(queryTestId(c, "voice-filter")).toBeNull();
    expect(queryTestId(c, "voice-recommended")).toBeNull();
    for (const chip of ["all", "male", "female", "dramatic"]) {
      expect(queryTestId(c, `voice-chip-${chip}`), chip).toBeNull();
    }
    expect(c.textContent).not.toContain("RECOMMENDED");
    expect(c.textContent).not.toContain("Dramatic");
  });

  it("U-V42: the defaults are American English, male, alphabetically first", async () => {
    const c = await list({ selectedVoiceId: undefined });
    expect(valueOf(c, "voice-language")).toBe("a");
    expect(valueOf(c, "voice-gender")).toBe("male");
    expect(valueOf(c, "voice-select")).toBe("am_adam");
  });

  it("U-V43: changing LANGUAGE re-populates GENDER from what that language HAS", async () => {
    // The cascade is genuine, not decorative: Kokoro publishes exactly one French voice
    // and it is female. A fixed [male, female] pair would offer a French male narrator
    // that does not exist.
    const c = await list();
    expect(optionsOf(c, "voice-gender")).toEqual(["male", "female"]);

    await selectOption(byTestId(c, "voice-language"), "f");
    expect(optionsOf(c, "voice-gender")).toEqual(["female"]);
    expect(valueOf(c, "voice-gender")).toBe("female");
    expect(optionsOf(c, "voice-select")).toEqual(["ff_siwis"]);
  });

  it("U-V44: changing GENDER re-populates VOICE with that bucket only", async () => {
    const c = await list();
    expect(optionsOf(c, "voice-select")).toEqual(["am_adam", "am_echo", "am_onyx"]);

    await selectOption(byTestId(c, "voice-gender"), "female");
    expect(optionsOf(c, "voice-select")).toEqual(["af_alloy", "af_nova", "af_sky"]);
  });

  it("U-V45: every cascade step reports the resolved PROVIDER voice id upward", async () => {
    // The parent persists `voiceId` and the request carries it, so a language or gender
    // change that silently left the old id behind would send a voice from the wrong
    // language. Each level reports the voice it resolved to, not just the leaf select.
    const onSelect = vi.fn();
    const c = await list({ onSelect });

    await selectOption(byTestId(c, "voice-select"), "am_onyx");
    expect(onSelect).toHaveBeenLastCalledWith("am_onyx");

    await selectOption(byTestId(c, "voice-gender"), "female");
    expect(onSelect).toHaveBeenLastCalledWith("af_alloy");

    // A language change CARRIES the chosen gender when the new language has it — "male"
    // is the default for an unmade choice, not an answer that outlives the user's. Falling
    // back to male here would silently undo a deliberate pick one control away.
    await selectOption(byTestId(c, "voice-language"), "b");
    expect(onSelect).toHaveBeenLastCalledWith("bf_alice");
  });

  it("U-V46: a vocabulary the provider did not publish offers NOTHING, and says so", async () => {
    // MOVED. This case used to be "with no chosen voice the RECOMMENDED one reads as
    // selected". Live, 6 of 19 speech models publish `supported_voices: null`; the old
    // behaviour for that state was to show OpenAI's eight names, none of which any live
    // model has.
    const c = await list({ voices: null });
    expect(queryTestId(c, "voice-select")).toBeNull();
    expect(byTestId(c, "voice-empty").textContent).toContain(
      "publishes no selectable voices",
    );
  });

  it("U-V47: a persisted id selects its OWN language and gender on mount", async () => {
    const c = await list({ selectedVoiceId: "bm_george" });
    expect(valueOf(c, "voice-language")).toBe("b");
    expect(valueOf(c, "voice-gender")).toBe("male");
    expect(valueOf(c, "voice-select")).toBe("bm_george");
  });

  it("U-V48: a persisted id the model does NOT have falls back to the derived default", async () => {
    // Every manifest committed before this change carries one of the eight OpenAI ids.
    // `alloy` is not a Kokoro voice; showing it as the selection would tell the user their
    // project narrates in a voice that does not exist on the model it will run on.
    const c = await list({ selectedVoiceId: "alloy" });
    expect(optionsOf(c, "voice-select")).not.toContain("alloy");
    expect(valueOf(c, "voice-select")).toBe("am_adam");
  });

  it("U-V49: before the catalogue lands, the picker offers nothing and says why", async () => {
    // MOVED. This case used to be "an UNKNOWN model still offers a usable list" — the
    // deleted FALLBACK. `modelId === null` is the real pre-catalogue state
    // (`resolveChoice` returns `{provider:"openrouter", model:null}` until MODELS_LOADED),
    // and accepting a pick against a list resolved for NO model is how a choice made
    // during that window ended up meaning nothing.
    const c = await list({ modelId: null, voices: null });
    expect(queryTestId(c, "voice-select")).toBeNull();
    expect(queryTestId(c, "voice-model-tag")).toBeNull();
    expect(byTestId(c, "voice-empty").textContent).toContain("Loading");
  });

  it("U-V50: NO audio preview and NO pace control are rendered (settled scope)", async () => {
    // A negative test on purpose. 19b draws a per-row ♪▶/❙❙ preview and a PACE slider;
    // neither ships — the preview needs sample assets and provider spend that do not
    // exist, and PACE has no backing parameter at all (`RequestSpeechArgs` is
    // {modelId, input, voice?}, and `media-client.test.ts` pins the request body).
    const c = await list();
    expect(c.textContent).not.toContain("PACE");
    expect(c.textContent).not.toContain("❙❙");
    expect(c.querySelector('input[type="range"]')).toBeNull();
    expect(c.textContent).not.toContain("▶");
  });

  it("U-V51: the model tag prints the FULL id", async () => {
    const c = await list();
    expect(byTestId(c, "voice-model-tag").textContent).toBe("hexgrad/kokoro-82m");
  });
});
