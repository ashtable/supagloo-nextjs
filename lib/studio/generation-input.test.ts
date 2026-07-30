import { describe, expect, it } from "vitest";

import { scriptGenerationInput, storyboardGenerationInput } from "./generation-input";
import { hydrateStoryboard } from "./manifest-adapter";
import type { ProjectManifest } from "../api/contracts";
import type { Scene } from "./storyboard";

/**
 * The two generation inputs the studio POSTs, as PURE functions.
 *
 * These are extracted from `studio-context.tsx` deliberately: what was broken was never
 * the React wiring, it was WHICH VALUES the request carried, and that is a pure question.
 * A jsdom mount driving a mocked `createGeneration` would prove the same thing far more
 * expensively and far less legibly (and the real click path is covered end to end by
 * `tests/e2e/studio-wizard-scripture-carry.e2e.ts`).
 *
 * ── The two defects pinned here ─────────────────────────────────────────────────────
 *
 * **(1) The reported bug.** `generateStoryboard` read `manifest.scenes[0]` — undefined on a
 * freshly-scaffolded project — so it sent `{brief}` with no `scripture` at all. The
 * workflow's `fetchScripturePassage` step is presence-gated, so it was skipped entirely,
 * while the system prompt still said "Break the passage into an ordered sequence" and
 * `StoryboardSceneSchema` REQUIRES a per-scene `reference` + `translation`. The model had to
 * emit something, and its canonical something is Genesis 1 / ASV. There is no hardcoded
 * default anywhere in the four repos — the fix is the INPUT.
 *
 * **(2) A defect already live in production.** The passage endpoint requires a USFM id.
 * Measured live 2026-07-30: `GET /v1/bibles/111/passages/Psalm%2023` → **404**
 * `{"message":"Bible passage Psalm23 for version 111 not found"}`, which dbos raises as a
 * permanent, uncaught `YouVersionPassageNotFoundError`. The old `sceneScriptureContext` fed
 * `ManifestScene.reference` — a HUMAN string — straight into that fetch, so every "rewrite
 * this line" against a real project failed the whole generation. Both call sites now send
 * `manifest.scripture.passageId`, the provider-issued USFM.
 */

const BASE: ProjectManifest = {
  manifestVersion: 1,
  composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
  narratorVoice: { description: "warm baritone" },
  scenes: [],
};

const scened = (over: Partial<ProjectManifest> = {}): ProjectManifest => ({
  ...BASE,
  scenes: [
    {
      id: "s1",
      name: "The Shepherd",
      scriptText: "The LORD is my shepherd; I shall not want.",
      reference: "Psalm 23:1",
      translation: "NIV11",
      visualPrompt: "a still hillside at dawn",
      durationSeconds: 4,
      captions: true,
    },
  ],
  ...over,
});

const PASSAGE = {
  reference: "Psalms 23",
  translation: "NIV11",
  language: "en",
  passageId: "PSA.23",
} as const;

const scene = (over: Partial<Scene> = {}): Scene => ({
  id: "s1",
  index: 1,
  durationSeconds: 4,
  visualLabel: "The Shepherd",
  visualPrompt: "a still hillside at dawn",
  script: "The LORD is my shepherd; I shall not want.",
  onScreenText: "text",
  reference: "Psalm 23:1",
  translation: "NIV11",
  ...over,
});

describe("storyboardGenerationInput — the first-time 'generate storyboard' request", () => {
  it("U-GI1: sends the provider-issued USFM as `scripture.reference`, NOT the human string", () => {
    const manifest: ProjectManifest = { ...BASE, scripture: { ...PASSAGE } };
    const input = storyboardGenerationInput(manifest, hydrateStoryboard(manifest), "test-1");

    expect(input.scripture).toEqual({
      reference: "PSA.23",
      translation: "NIV11",
      language: "en",
    });
    // The exact value that 404s upstream must not be what travels.
    expect(input.scripture!.reference).not.toBe(PASSAGE.reference);
  });

  it("U-GI2: the brief names the PASSAGE, not the project — a fresh scaffold has no scenes", () => {
    // This is the degradation the user saw: with `scenes: []` the old brief read
    // "Plan a short scripture-video storyboard for test-1."
    const manifest: ProjectManifest = { ...BASE, scripture: { ...PASSAGE } };
    const input = storyboardGenerationInput(manifest, hydrateStoryboard(manifest), "test-1");

    expect(input.brief).toContain("Psalms 23");
    expect(input.brief).toContain("NIV11");
    expect(input.brief).not.toContain("test-1");
  });

  it("U-GI3: NO passageId means NO scripture block — and the brief still names the reference", () => {
    // §9-Q10 forbids silent substitution, and a human reference in `scripture.reference`
    // is a guaranteed permanent 404 that fails the whole generation. So the block is
    // omitted and the reference travels as prose, where a human string belongs.
    const manifest: ProjectManifest = {
      ...BASE,
      scripture: { reference: "Psalms 23", translation: "NIV11" },
    };
    const input = storyboardGenerationInput(manifest, hydrateStoryboard(manifest), "test-1");

    expect(input.scripture).toBeUndefined();
    expect("scripture" in input).toBe(false);
    expect(input.brief).toContain("Psalms 23");
  });

  it("U-GI4: nothing to name at all falls back to the project name and invents nothing", () => {
    // A project scaffolded with the wizard's SKIP control: `scenes: []`, no endCard, no
    // scripture. There is genuinely nothing to say about a passage, so the brief says
    // nothing about one — a topic-only generation is honest; a guessed reference is not.
    const input = storyboardGenerationInput(BASE, hydrateStoryboard(BASE), "test-1");
    expect(input.scripture).toBeUndefined();
    expect(input.brief).toContain("test-1");
  });

  it("U-GI4c: with scenes but no project passage, the scene reference is preferred to the name", () => {
    const input = storyboardGenerationInput(scened(), hydrateStoryboard(scened()), "test-1");
    expect(input.scripture).toBeUndefined();
    expect(input.brief).toContain("Psalm 23:1");
    expect(input.brief).not.toContain("test-1");
  });

  it("U-GI4b: with no project passage, an existing storyboard reference is preferred to the name", () => {
    // A project scaffolded before the wizard collected passages still has scene references;
    // they are the best thing available for the brief, and they never reach the fetch.
    const manifest = scened({ endCard: { headline: "Psalm 23" } });
    const input = storyboardGenerationInput(manifest, hydrateStoryboard(manifest), "test-1");
    expect(input.brief).toContain("Psalm 23");
    expect(input.brief).not.toContain("test-1");
  });

  it("U-GI7: the stored BCP-47 tag is preferred over the schema's 'eng' default", () => {
    // The picker's tags are BCP-47 (`"en"`). `sceneScriptureContext` used to hardcode
    // `"eng"`, which silently re-resolved a non-English project against English.
    const arabic: ProjectManifest = {
      ...BASE,
      scripture: { ...PASSAGE, language: "ar" },
    };
    expect(
      storyboardGenerationInput(arabic, hydrateStoryboard(arabic), "x").scripture!.language,
    ).toBe("ar");

    const noTag: ProjectManifest = {
      ...BASE,
      scripture: { reference: "Psalms 23", translation: "NIV11", passageId: "PSA.23" },
    };
    expect(
      storyboardGenerationInput(noTag, hydrateStoryboard(noTag), "x").scripture!.language,
    ).toBe("eng");
  });
});

describe("scriptGenerationInput — 'rewrite this line' (the already-live 404)", () => {
  it("U-GI5: sends the same provider-issued USFM, so the passage fetch can succeed at all", () => {
    const manifest = scened({ scripture: { ...PASSAGE } });
    const input = scriptGenerationInput(manifest, scene());

    expect(input.scripture).toEqual({
      reference: "PSA.23",
      translation: "NIV11",
      language: "en",
    });
    // What shipped: the scene's HUMAN reference, which the live host 404s.
    expect(input.scripture!.reference).not.toBe("Psalm 23:1");
  });

  it("U-GI6: the brief carries the SCENE's own human reference and its current line", () => {
    // The per-scene reference is still the right context for a per-scene rewrite — it just
    // belongs in prose rather than in a field the provider parses as a USFM id.
    const manifest = scened({ scripture: { ...PASSAGE } });
    const input = scriptGenerationInput(manifest, scene());

    expect(input.brief).toContain("Psalm 23:1");
    expect(input.brief).toContain("The LORD is my shepherd; I shall not want.");
  });

  it("U-GI6b: a scene with no reference of its own still produces a usable brief", () => {
    const manifest = scened({ scripture: { ...PASSAGE } });
    const input = scriptGenerationInput(manifest, scene({ reference: undefined }));
    expect(input.brief).toContain("scripture");
    expect(input.scripture).toEqual({
      reference: "PSA.23",
      translation: "NIV11",
      language: "en",
    });
  });

  it("U-GI5b: no passageId means no scripture block here either", () => {
    const manifest = scened({
      scripture: { reference: "Psalms 23", translation: "NIV11" },
    });
    expect(scriptGenerationInput(manifest, scene()).scripture).toBeUndefined();
    expect(scriptGenerationInput(scened(), scene()).scripture).toBeUndefined();
  });
});
