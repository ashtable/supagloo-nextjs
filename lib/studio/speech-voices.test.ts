import { describe, it, expect } from "vitest";
import {
  VOICE_FILTERS,
  filterVoices,
  recommendedVoiceFor,
  remapVoice,
  voiceSetForModel,
  voicesForModel,
} from "./speech-voices";

/**
 * Feature 1 / figure 19b — the curated per-model voice catalogue.
 *
 * The properties asserted here are the ones the FEATURE depends on, not the contents of
 * the table (which is editorial and will change): every id is unique within its model,
 * every model recommends exactly one voice it actually has, and — the load-bearing one —
 * a remap ALWAYS returns a voice the target model can accept. Without that last property
 * switching the speech model would leave an unknown id on the manifest and the next
 * narration generation would be a hard provider 400, i.e. the feature would break the
 * exact thing it was added to fix.
 */

const MODELS = [
  "canopylabs/orpheus-3b",
  "openai/gpt-4o-mini-tts",
  "x-ai/grok-voice-tts-1.0",
  "some/model-nobody-curated",
  null,
];

describe("the catalogue's shape", () => {
  it("U-V10: every model offers at least one voice — the block is never empty", () => {
    for (const m of MODELS) {
      expect(voicesForModel(m).length, String(m)).toBeGreaterThan(0);
    }
  });

  it("U-V11: ids are unique within a model", () => {
    for (const m of MODELS) {
      const ids = voicesForModel(m).map((v) => v.id.toLowerCase());
      expect(new Set(ids).size, String(m)).toBe(ids.length);
    }
  });

  it("U-V12: every model recommends EXACTLY ONE voice, and it is one of its own", () => {
    // 19b badges exactly one row `RECOMMENDED`, and `remapVoice` falls back to it — a
    // recommendation the model does not have would be an unsendable default.
    //
    // Compared EXACTLY, not case-folded. The provider is sent this id verbatim, and the
    // table's own ids are the only thing establishing what "one of its own" means — so a
    // recommendation that differs only in case is a recommendation the module cannot find.
    // Case-folding here is what let `recommended: "rex"` sit against ids `Rex/Eve/Ara/…`
    // with all 18 tests green.
    for (const m of MODELS) {
      const rec = recommendedVoiceFor(m);
      const ids = voicesForModel(m).map((v) => v.id);
      expect(ids, String(m)).toContain(rec);
    }
  });

  it("U-V13: an unknown model degrades to a usable list rather than nothing", () => {
    expect(voicesForModel("some/model-nobody-curated").length).toBeGreaterThan(0);
    // …and to the voice this codebase has actually been sending all along, so an unknown
    // model is never WORSE than today's behaviour.
    expect(recommendedVoiceFor("some/model-nobody-curated")).toBe("alloy");
  });

  it("U-V14: figure 19a's voice COUNT is derived, and 19b's six rows are a subset of it", () => {
    // Flag F7: 19a asserts "8 voices for this model" while 19b specifies six. The eight
    // are the model's real vocabulary; the figure drew six of them. Nothing prints 8.
    const orpheus = voicesForModel("canopylabs/orpheus-3b");
    const drawn = ["Zac", "Tara", "Leo", "Mia", "Jess", "Dan"];
    const names = orpheus.map((v) => v.name);
    for (const n of drawn) expect(names, n).toContain(n);
    expect(orpheus.length).toBeGreaterThanOrEqual(drawn.length);
  });

  it("U-V15: model matching is case-insensitive and tolerant of vendor prefixes", () => {
    expect(voiceSetForModel("CanopyLabs/Orpheus-3B").family).toBe(
      voiceSetForModel("canopylabs/orpheus-3b").family,
    );
  });
});

describe("remapVoice — 19b's stated rule", () => {
  it("U-V16: THE INVARIANT — the result is ALWAYS a voice the target model accepts", () => {
    // Swept over every (voice, from, to) pair in the table rather than three examples: a
    // test that claims a class has to drive the class, and this is the property that keeps
    // a model change from producing an unsendable manifest.
    // Compared EXACTLY — see U-V12. The id is what goes on the wire, so "a voice the
    // target model accepts" is an exact-string claim about this table, not a case-folded
    // one; folding it made the invariant unable to see a mis-cased `recommended`.
    for (const from of MODELS) {
      for (const to of MODELS) {
        const targetIds = voicesForModel(to).map((v) => v.id);
        for (const voice of voicesForModel(from)) {
          const mapped = remapVoice(voice.id, from, to);
          expect(
            targetIds,
            `${voice.id}: ${String(from)} → ${String(to)}`,
          ).toContain(mapped);
        }
      }
    }
  });

  it("U-V17: staying on the same model keeps the exact voice", () => {
    for (const m of MODELS) {
      for (const voice of voicesForModel(m)) {
        expect(remapVoice(voice.id, m, m)).toBe(voice.id);
      }
    }
  });

  it("U-V18: a shared id survives the switch (Leo exists in two vocabularies)", () => {
    expect(remapVoice("Leo", "x-ai/grok-voice-tts-1.0", "canopylabs/orpheus-3b")).toBe(
      "leo",
    );
  });

  it("U-V19: no chosen voice yet → the target's recommendation", () => {
    expect(remapVoice(null, null, "canopylabs/orpheus-3b")).toBe("zac");
    expect(remapVoice(undefined, null, "openai/gpt-4o-mini-tts")).toBe("alloy");
    expect(remapVoice("", null, "openai/gpt-4o-mini-tts")).toBe("alloy");
  });

  it("U-V20: an id from NEITHER model falls back rather than being passed through", () => {
    // The dangerous case: a manifest written by an older build, or hand-edited. Passing it
    // through would put an unknown voice on the wire.
    const mapped = remapVoice("not-a-real-voice", "openai/gpt-4o-mini-tts", "canopylabs/orpheus-3b");
    expect(voicesForModel("canopylabs/orpheus-3b").map((v) => v.id)).toContain(mapped);
  });

  it("U-V21: gender is preserved when the target can honour it", () => {
    // "nearest match" has to mean something: a user who picked a male narrator should not
    // silently get a female one because the recommendation happens to be one.
    const mapped = remapVoice("onyx", "openai/gpt-4o-mini-tts", "canopylabs/orpheus-3b");
    const voice = voicesForModel("canopylabs/orpheus-3b").find((v) => v.id === mapped);
    expect(voice?.gender).toBe("male");
  });
});

describe("filterVoices — 19b's search box + chips", () => {
  const orpheus = voicesForModel("canopylabs/orpheus-3b");

  it("U-V22: `all` with no search returns everything", () => {
    expect(filterVoices(orpheus, "all", "")).toHaveLength(orpheus.length);
  });

  it("U-V23: the chips are a single-select radio group over the four values", () => {
    expect([...VOICE_FILTERS]).toEqual(["all", "male", "female", "dramatic"]);
  });

  it("U-V24: male/female never claim a voice whose gender is not published", () => {
    // The honesty rule: a filter that mislabels a voice is worse than one that returns
    // fewer rows. Every OpenAI voice with `unknown` gender must be absent from both.
    const openai = voicesForModel("openai/gpt-4o-mini-tts");
    const unknowns = openai.filter((v) => v.gender === "unknown").map((v) => v.id);
    expect(unknowns.length).toBeGreaterThan(0);
    for (const chip of ["male", "female"] as const) {
      const ids = filterVoices(openai, chip, "").map((v) => v.id);
      for (const u of unknowns) expect(ids, `${chip}/${u}`).not.toContain(u);
    }
  });

  it("U-V25: the search box matches the DESCRIPTOR, not just the name", () => {
    // "deep", "warm", "female" are the words a user actually types, and they live in the
    // sub-line rather than in the name.
    expect(filterVoices(orpheus, "all", "gravelly").map((v) => v.name)).toEqual([
      "Leo",
    ]);
    expect(filterVoices(orpheus, "all", "Zac").map((v) => v.name)).toEqual(["Zac"]);
  });

  it("U-V26: the chip and the search COMPOSE — 19b draws them as independent controls", () => {
    const out = filterVoices(orpheus, "female", "bright");
    expect(out.map((v) => v.name)).toEqual(["Mia"]);
  });

  it("U-V27: search is case- and whitespace-insensitive, and no match is an empty list", () => {
    expect(filterVoices(orpheus, "all", "  ZAC  ").map((v) => v.name)).toEqual(["Zac"]);
    expect(filterVoices(orpheus, "all", "zzzz")).toEqual([]);
  });
});
