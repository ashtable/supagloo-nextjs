import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import type { AiModelInfo } from "../api/contracts";
import {
  DEFAULT_GENDER,
  DEFAULT_LANGUAGE_CODE,
  PREFERRED_VOICE_NAME,
  buildVoiceGroups,
  defaultSelection,
  effectiveVoiceId,
  languageLabel,
  parseVoiceId,
  preferredVoiceId,
  remapVoice,
  selectionFor,
  voiceLabel,
  voicesForModelId,
} from "./speech-voices";

/**
 * The narrator-voice vocabulary, sourced LIVE from the provider.
 *
 * The curated `ORPHEUS`/`GROK`/`OPENAI`/`FALLBACK` table this replaces was wrong for
 * every model it claimed to cover: there is no `openai/` entry in OpenRouter's speech
 * catalogue at all, so `FALLBACK = OPENAI` matched nothing real and EVERY live speech
 * model fell through to a list none of them declare. Measured against
 * `hexgrad/kokoro-82m` on 2026-07-30: 6 of the 8 offered ids alias silently onto Kokoro
 * voices (both "Alloy" and "Shimmer" onto American FEMALE ones — the user's actual bug
 * report) and 2 (`ash`, `sage`) hard-400 the whole generation.
 *
 * So the properties asserted here are about the RULES, never about which voices exist.
 * The vocabularies below are FIXTURES — evidence captured live — and `U-V28` is the
 * standing guard that they never migrate into the source.
 */

/** `hexgrad/kokoro-82m`'s 54 `supported_voices`, captured live 2026-07-30. TEST DATA. */
const KOKORO = [
  "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore",
  "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael",
  "am_onyx", "am_puck", "am_santa",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
  "ef_dora", "em_alex", "em_santa",
  "ff_siwis",
  "hf_alpha", "hf_beta", "hm_omega", "hm_psi",
  "if_sara", "im_nicola",
  "jf_alpha", "jf_gongitsune", "jf_nezumi", "jf_tebukuro", "jm_kumo",
  "pf_dora", "pm_alex", "pm_santa",
  "zf_xiaobei", "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi",
  "zm_yunjian", "zm_yunxi", "zm_yunxia", "zm_yunyang",
];

/** `canopylabs/orpheus-3b-0.1-ft` — ids that carry NO convention at all. TEST DATA. */
const OPAQUE = ["tara", "leah", "jess", "leo", "dan", "mia", "zac"];

const model = (id: string, voices: string[] | null): AiModelInfo => ({
  id,
  provider: "openrouter",
  label: id,
  kinds: ["narration"],
  pricing: null,
  voices,
});

describe("the vocabulary's shape", () => {
  it("U-V10: an UNPUBLISHED vocabulary offers no voices at all", () => {
    // MOVED. This case used to read "every model offers at least one voice — the block is
    // never empty", which was true only because the deleted FALLBACK invented a list for
    // every model it did not know. Live, 6 of 19 speech models publish
    // `supported_voices: null` (all `fish-audio/*`, both `minimax/*`) — so "never empty"
    // is a claim the provider directly contradicts. Offering nothing, and saying so, is
    // the only honest answer.
    for (const empty of [null, undefined, []]) {
      expect(buildVoiceGroups(empty)).toEqual([]);
      expect(defaultSelection(buildVoiceGroups(empty))).toBeNull();
      expect(effectiveVoiceId("am_adam", empty)).toBeNull();
    }
  });

  it("U-V11: every published id is carried VERBATIM, exactly once", () => {
    // The id is the only value the provider is ever sent. Case-folding or renaming it —
    // which the deleted table did while ALSO holding its own copy of the ids — is how a
    // recommendation of "rex" came to sit against an id of "Rex" with 18 tests green.
    const flat = buildVoiceGroups(KOKORO).flatMap((g) =>
      g.genders.flatMap((b) => b.voiceIds),
    );
    expect(new Set(flat).size).toBe(flat.length);
    expect([...flat].sort()).toEqual([...KOKORO].sort());
  });

  it("U-V12: the DEFAULT is derived, and is always one of the offered voices", () => {
    // MOVED. There is no `recommended` any more: no provider publishes a recommendation,
    // and the curated one was already wrong (it badged `alloy` for a model with no
    // `alloy`). What replaces it is a DERIVED default — English, male, alphabetically
    // first — which by construction cannot name a voice the model does not have.
    for (const vocab of [KOKORO, OPAQUE, ["ff_siwis"], ["zm_yunxi", "af_nova"]]) {
      const groups = buildVoiceGroups(vocab);
      const chosen = defaultSelection(groups);
      expect(chosen, JSON.stringify(vocab.slice(0, 3))).not.toBeNull();
      expect(vocab).toContain(chosen!.voiceId);
    }
  });

  it("U-V13: ids with NO derivable convention are still all offered", () => {
    // MOVED. This case used to pin "an unknown model degrades to a usable list rather
    // than nothing" — i.e. the FALLBACK, which handed the user OpenAI's names for a model
    // that has none of them. The property that actually matters survives, in an honest
    // form: when the id convention does not parse, LANGUAGE and GENDER say so rather than
    // guessing, and the VOICE dropdown still lists every id the provider returned, so the
    // model stays fully usable through one dropdown.
    const groups = buildVoiceGroups(OPAQUE);
    expect(groups).toHaveLength(1);
    expect(groups[0].languageCode).toBeNull();
    expect(groups[0].genders).toHaveLength(1);
    expect(groups[0].genders[0].gender).toBeNull();
    expect([...groups[0].genders[0].voiceIds].sort()).toEqual([...OPAQUE].sort());
    // "—" is this design system's established honest-unknown token (19a's
    // `Provider publishes no pricing.` + `—`). It is not a language and does not pretend
    // to be one.
    expect(groups[0].label).toBe("—");
    expect(groups[0].genders[0].label).toBe("—");
  });

  it("U-V14: the offered count is exactly what the provider published", () => {
    const count = buildVoiceGroups(KOKORO).reduce(
      (n, g) => n + g.genders.reduce((m, b) => m + b.voiceIds.length, 0),
      0,
    );
    expect(count).toBe(KOKORO.length);
    expect(count).toBe(54);
  });

  it("U-V15: the `[lang][gender]_name` convention parses, and the letter names a language", () => {
    // Parsing a NAMING CONVENTION is not hardcoding ids: it never asserts which voices
    // exist — the provider does — it only interprets the names it returned in order to
    // group them.
    expect(parseVoiceId("am_adam")).toEqual({
      languageCode: "a",
      gender: "male",
      name: "adam",
    });
    expect(parseVoiceId("ff_siwis")).toEqual({
      languageCode: "f",
      gender: "female",
      name: "siwis",
    });
    expect(languageLabel("a")).toBe("American English");
    expect(languageLabel("b")).toBe("British English");
    expect(languageLabel("f")).toBe("French");

    // And it does NOT fire on the other models' conventions, which is what keeps the
    // degradation in U-V13 reachable rather than decorative.
    for (const foreign of [
      "american_female",
      "en_paul_sad",
      "aura-2-thalia-en",
      "Zephyr",
      "conversational_a",
    ]) {
      expect(parseVoiceId(foreign), foreign).toBeNull();
    }

    expect(voiceLabel("am_adam")).toBe("Adam");
    expect(voiceLabel("zac")).toBe("zac"); // unparsed ⇒ shown exactly as published
  });
});

describe("remapping when the speech model changes", () => {
  const VOCABULARIES: Array<string[] | null> = [
    KOKORO,
    OPAQUE,
    ["american_female", "american_male", "british_female"],
    ["Zephyr", "Puck"],
    [],
    null,
  ];

  it("U-V16: THE INVARIANT — the result is ALWAYS null or a voice the target accepts", () => {
    // The load-bearing property, preserved verbatim in MEANING from the curated table's
    // era. Without it, changing the speech model would leave an id the new model has
    // never heard of on the manifest and the next narration generation would be a hard
    // provider 400 — the feature breaking the exact thing it was added to fix.
    //
    // What CHANGED is only the shape of the answer: the old rule always returned some id
    // (falling back to a "recommended" one) because it had editorial name/gender/dramatic
    // metadata to match on. That metadata is gone — the provider publishes bare strings —
    // so the honest answer when nothing matches is NOTHING. `regenerateNarration` omits
    // an absent voiceId and `effectiveVoiceId` then supplies the target's own derived
    // default, so a cleared voice is never an unsendable one.
    const candidates = [
      ...KOKORO,
      ...OPAQUE,
      "american_male",
      "Zephyr",
      "alloy",
      "shimmer",
      "AM_ADAM",
      "",
    ];
    for (const to of VOCABULARIES) {
      for (const current of candidates) {
        const result = remapVoice(current, to);
        if (result === null) continue;
        expect(to ?? [], `${current} -> ${JSON.stringify(to)}`).toContain(result);
      }
    }
  });

  it("U-V17: an id the target still lists survives the change untouched", () => {
    expect(remapVoice("am_adam", KOKORO)).toBe("am_adam");
    expect(remapVoice("zac", OPAQUE)).toBe("zac");
  });

  it("U-V18: an id the target does NOT list is CLEARED, never passed through", () => {
    // This is the whole of bug 2 in one assertion: `alloy` and `shimmer` are not Kokoro
    // voices. They reached the provider anyway, aliased onto American FEMALE Kokoro
    // voices, and the user heard one narrator for two different picks.
    expect(remapVoice("alloy", KOKORO)).toBeNull();
    expect(remapVoice("shimmer", KOKORO)).toBeNull();
    expect(remapVoice("am_adam", OPAQUE)).toBeNull();
    // Exactly, not case-folded — the provider is sent this string verbatim.
    expect(remapVoice("AM_ADAM", KOKORO)).toBeNull();
  });

  it("U-V19: no chosen voice stays no chosen voice — never a guess", () => {
    for (const to of VOCABULARIES) {
      expect(remapVoice(undefined, to)).toBeNull();
      expect(remapVoice(null, to)).toBeNull();
      expect(remapVoice("", to)).toBeNull();
    }
  });
});

describe("the three cascading dropdowns", () => {
  it("U-V20: GENDER is populated from what EXISTS for that language, not a fixed pair", () => {
    // Kokoro publishes one French voice and it is female. A fixed [male, female] pair
    // would offer a male French narrator that does not exist, and picking it would either
    // send nothing or send a voice from another language.
    const groups = buildVoiceGroups(KOKORO);
    const french = groups.find((g) => g.languageCode === "f")!;
    expect(french.genders.map((b) => b.gender)).toEqual(["female"]);

    const american = groups.find((g) => g.languageCode === "a")!;
    // Male first — the specified default — then female.
    expect(american.genders.map((b) => b.gender)).toEqual(["male", "female"]);
    expect(american.genders[0].voiceIds).toHaveLength(9);
    expect(american.genders[1].voiceIds).toHaveLength(11);
  });

  it("U-V21: the defaults are English, male, and the PREFERRED name when it exists", () => {
    // REWRITTEN 2026-07-31 (R9b). The claim used to be "alphabetically first", which for
    // Kokoro is `am_adam`. The user asked for Michael, and the module's own doctrine —
    // "every fallback is to what EXISTS rather than to a constant" — is honoured by
    // resolving a NAME against the live vocabulary rather than naming an id. `U-V72`/`U-V73`
    // hold both arms of that rule; this case holds the composed default.
    expect(DEFAULT_LANGUAGE_CODE).toBe("a");
    expect(DEFAULT_GENDER).toBe("male");
    expect(defaultSelection(buildVoiceGroups(KOKORO))).toEqual({
      languageCode: "a",
      gender: "male",
      voiceId: "am_michael",
    });
  });

  it("U-V22: the LANGUAGE default falls back when there is no American English", () => {
    const noAmerican = KOKORO.filter((v) => !v.startsWith("a"));
    const chosen = defaultSelection(buildVoiceGroups(noAmerican))!;
    expect(chosen.languageCode).not.toBeNull();
    expect(noAmerican).toContain(chosen.voiceId);
  });

  it("U-V23: the GENDER default falls back when that language has no male voice", () => {
    // French, again: the cascade must land on a real voice rather than an empty bucket.
    expect(defaultSelection(buildVoiceGroups(["ff_siwis"]))).toEqual({
      languageCode: "f",
      gender: "female",
      voiceId: "ff_siwis",
    });
  });

  it("U-V24: voices sort alphabetically inside their bucket", () => {
    const american = buildVoiceGroups(KOKORO).find((g) => g.languageCode === "a")!;
    expect(american.genders[0].voiceIds[0]).toBe("am_adam");
    expect(american.genders[0].voiceIds).toEqual(
      [...american.genders[0].voiceIds].sort(),
    );
  });

  it("U-V25: `selectionFor` locates a persisted id's own language and gender", () => {
    expect(selectionFor(buildVoiceGroups(KOKORO), "zm_yunxi")).toEqual({
      languageCode: "z",
      gender: "male",
      voiceId: "zm_yunxi",
    });
    expect(selectionFor(buildVoiceGroups(KOKORO), "alloy")).toBeNull();
  });
});

describe("what is actually sent", () => {
  it("U-V26: a valid persisted id wins, an invalid one resolves to the derived default", () => {
    // ONE rule for what the picker reads as selected AND what the request carries. The
    // shipped `selected = selectedVoiceId ?? recommended` was a control that told the user
    // a voice was chosen while the request carried nothing — and `recommended` was a voice
    // the model did not have. Sharing one function makes disagreeing impossible.
    expect(effectiveVoiceId("zm_yunxi", KOKORO)).toBe("zm_yunxi");
    // The DERIVED default moved to Michael under R9b — and it moved HERE too, which is the
    // point: the picker's display and the outgoing request share one function, so they
    // cannot disagree about which voice "no explicit choice" means.
    expect(effectiveVoiceId("alloy", KOKORO)).toBe("am_michael");
    expect(effectiveVoiceId(undefined, KOKORO)).toBe("am_michael");
    expect(effectiveVoiceId("am_adam", null)).toBeNull();
  });

  it("U-V27: voices come from the CATALOGUE ENTRY for the resolved model, or nowhere", () => {
    const catalogue = [model("hexgrad/kokoro-82m", [...KOKORO]), model("other/tts", null)];
    expect(voicesForModelId("hexgrad/kokoro-82m", catalogue)).toEqual([...KOKORO]);
    expect(voicesForModelId("other/tts", catalogue)).toBeNull();
    // Not in the catalogue, and the pre-catalogue null state: both are "we have no
    // vocabulary to offer", never a borrowed one.
    expect(voicesForModelId("not/listed", catalogue)).toBeNull();
    expect(voicesForModelId(null, catalogue)).toBeNull();
    expect(voicesForModelId("hexgrad/kokoro-82m", [])).toBeNull();
  });
});

/**
 * R9(b) — "default the voice to American English · Male · Michael".
 *
 * ## Why this is a NAME and not an id
 *
 * The obvious implementation is `DEFAULT_VOICE_ID = "am_michael"`. That is the exact shape
 * of the bug this module was rewritten to remove: a curated table that ASSERTED which
 * voices a model has, and was wrong for every model it covered. The module's own doctrine
 * is quoted in its docblock — *"Every fallback is to what EXISTS rather than to a
 * constant"* — and `U-V28` is the standing guard that keeps it true.
 *
 * So the preference is expressed the way `PREFERRED_TRANSLATION_ABBREVIATION = "ASV"`
 * already is in `scripture-picker.ts`: a name looked up in whatever the live vocabulary
 * returned, with a documented fallback to today's behaviour when it is absent. Six of the
 * nineteen live speech models publish no vocabulary at all and most of the rest use a
 * different naming convention entirely, so "Michael is absent" is the COMMON case, not an
 * edge one.
 */
describe("the preferred voice NAME (R9b)", () => {
  it("U-V72: with the live Kokoro vocabulary, the American male default is Michael", () => {
    // The user's screenshot showed `VOICE: Michael` — which is what they had picked by
    // hand, because the derived default was `am_adam` (alphabetically first).
    const american = buildVoiceGroups(KOKORO).find((g) => g.languageCode === "a")!;
    const male = american.genders.find((b) => b.gender === "male")!;
    expect(preferredVoiceId(male.voiceIds)).toBe("am_michael");
    // …and it is genuinely NOT the alphabetically-first one, so the assertion above cannot
    // be satisfied by leaving the old rule in place.
    expect(male.voiceIds[0]).toBe("am_adam");
  });

  it("U-V73: a bucket with no Michael keeps today's first-in-bucket behaviour", () => {
    // The other arm, and the one that matters most in production. `bm_*` (British male) has
    // no Michael; neither does any non-Kokoro model. The rule must degrade to what exists,
    // never invent an id and never crash.
    const british = buildVoiceGroups(KOKORO).find((g) => g.languageCode === "b")!;
    const male = british.genders.find((b) => b.gender === "male")!;
    expect(male.voiceIds).not.toContain("bm_michael");
    expect(preferredVoiceId(male.voiceIds)).toBe(male.voiceIds[0]);
  });

  it("U-V74: the match is on the DISPLAY NAME, case-insensitively — never on a literal id", () => {
    // The same voice under three plausible provider conventions. If the rule were an id
    // comparison, only the first would resolve; the module would then be asserting a
    // provider's id format, which is the class of claim it exists to avoid making.
    expect(preferredVoiceId(["am_adam", "am_michael"])).toBe("am_michael");
    expect(preferredVoiceId(["xm_aaron", "xm_MICHAEL"])).toBe("xm_MICHAEL");
    expect(preferredVoiceId(["am_adam", "am_michaela"])).toBe("am_adam"); // prefix ≠ match
    // And `voiceLabel` is the seam it goes through, so the two cannot drift apart.
    expect(voiceLabel("am_michael")).toBe(PREFERRED_VOICE_NAME);
  });

  it("U-V75: an empty or opaque vocabulary is completely unchanged", () => {
    // Opaque ids (`tara`, `leah`, …) do not parse, so they all collect in one unparsed
    // bucket whose first entry is the answer — exactly as before this rule existed.
    expect(preferredVoiceId([])).toBeNull();
    expect(preferredVoiceId(OPAQUE)).toBe(OPAQUE[0]);
    for (const empty of [null, undefined, []]) {
      expect(defaultSelection(buildVoiceGroups(empty))).toBeNull();
    }
    const opaque = defaultSelection(buildVoiceGroups(OPAQUE))!;
    expect(opaque.voiceId).toBe([...OPAQUE].sort()[0]);
  });

  it("U-V76: the preference survives U-V28 — it is a NAME, and the module still names no id", () => {
    // The exception is PROVEN rather than assumed. `U-V28` scans the shipping source for
    // kokoro-shaped ids and for the deleted table's curated names; this asserts that the new
    // constant is neither, and that it really is present in the source (so the guard is
    // being tested against something rather than against nothing).
    expect(PREFERRED_VOICE_NAME).not.toMatch(/\b[a-z][fm]_[a-z]{2,}\b/);
    expect(
      ["alloy", "onyx", "echo", "fable", "nova", "shimmer", "ash", "sage",
       "tara", "jess", "zac", "orpheus", "grok"],
    ).not.toContain(PREFERRED_VOICE_NAME.toLowerCase());

    const source = readFileSync(resolve(__dirname, "speech-voices.ts"), "utf8");
    expect(source).toContain(`"${PREFERRED_VOICE_NAME}"`);
  });
});

describe("the standing guard", () => {
  it("U-V28: the module names NO voice id — the vocabulary is the provider's to state", () => {
    // The whole bug was a curated table asserting which voices a model has. This test is
    // what stops it coming back in a third form. It scans the SHIPPING source, not this
    // file: the fixtures above are evidence, and evidence belongs in a test.
    //
    // COMMENTS ARE STRIPPED FIRST, and that is the rule rather than a convenience. The
    // invariant is about what the module ASSERTS at runtime; the header's account of the
    // deleted `ORPHEUS`/`GROK`/`OPENAI` table — including the two ids whose collision was
    // the reported symptom — is the documentation that stops the table coming back, so a
    // guard that forbade naming them would delete its own explanation.
    const source = readFileSync(resolve(__dirname, "speech-voices.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const offenders: string[] = [];
    const kokoroShape = source.match(/\b[a-z][fm]_[a-z]{2,}\b/);
    if (kokoroShape) offenders.push(`kokoro-shaped id "${kokoroShape[0]}"`);
    for (const id of [
      "alloy", "onyx", "echo", "fable", "nova", "shimmer", "ash", "sage",
      "tara", "jess", "zac", "orpheus", "grok",
    ]) {
      if (new RegExp(`["'\`]${id}["'\`]`, "i").test(source)) {
        offenders.push(`curated voice id "${id}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
