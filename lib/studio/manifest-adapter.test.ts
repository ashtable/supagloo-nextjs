import { describe, expect, it } from "vitest";

import {
  hydrateStoryboard,
  serializeManifest,
  commitMessage,
  projectScriptureContext,
} from "./manifest-adapter";
import { ProjectManifestSchema, type ProjectManifest } from "../api/contracts";
import {
  updateSceneScript,
  setMusicMood,
  setSceneVisual,
  setNarrationAsset,
  setMusicAsset,
  storyboardFromGenerated,
} from "./storyboard";
import { projectWithManifest } from "./project";

/** A full, schema-valid wire manifest exercising every optional slot (music,
 *  endCard, a null visualAssetKey, a scene with captions off). */
const MANIFEST: ProjectManifest = {
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
      visualAssetKey: "projects/p1/scenes/s1.mp4",
    },
    {
      id: "s2",
      name: "sunrise · road",
      scriptText: "Make straight the way of the Lord.",
      reference: "JOHN 1:23",
      translation: "KJV",
      visualPrompt: "a straight dirt road stretching toward a rising sun",
      durationSeconds: 8,
      captions: false,
      visualAssetKey: null,
    },
  ],
  narratorVoice: {
    description: "warm, weathered, resonant baritone",
    label: "JAMES EARL JONES-STYLE",
    assetKey: "projects/p1/narration/track.mp3",
  },
  music: { style: "Swelling strings", assetKey: null },
  endCard: { headline: "JOHN 1:23 · KJV", subtext: "Verse of the day" },
};

describe("hydrateStoryboard", () => {
  it("U-A1: maps wire scenes to UI scenes (1-based index, name→visualLabel, scriptText→script)", () => {
    const sb = hydrateStoryboard(MANIFEST);
    expect(sb.scenes).toHaveLength(2);
    expect(sb.scenes[0]).toMatchObject({
      id: "s1",
      index: 1,
      durationSeconds: 5,
      visualLabel: "wilderness · dawn",
      visualPrompt: "sweeping empty wilderness at first light",
      script: "I am the voice of one",
      onScreenText: "text",
    });
    expect(sb.scenes[1].index).toBe(2);
  });

  it("U-A2: captions boolean → onScreenText enum (true→text, false→voice-only)", () => {
    const sb = hydrateStoryboard(MANIFEST);
    expect(sb.scenes[0].onScreenText).toBe("text"); // captions: true
    expect(sb.scenes[1].onScreenText).toBe("voice-only"); // captions: false
  });

  it("U-A3: maps whole-video fields (fps, voice, music) from composition/narratorVoice/music", () => {
    const sb = hydrateStoryboard(MANIFEST);
    expect(sb.fps).toBe(30);
    expect(sb.voiceDescription).toBe("warm, weathered, resonant baritone");
    expect(sb.voiceLabel).toBe("JAMES EARL JONES-STYLE");
    expect(sb.musicMood).toBe("Swelling strings");
    // reference/title derive from the end card headline (used by the player panel)
    expect(sb.reference).toBe("JOHN 1:23 · KJV");
  });

  it("U-A4: tolerates the minimal manifest (no music/endCard, no voice label, empty scenes)", () => {
    const minimal: ProjectManifest = {
      manifestVersion: 1,
      composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
      scenes: [],
      narratorVoice: { description: "a plain voice" },
    };
    const sb = hydrateStoryboard(minimal);
    expect(sb.scenes).toEqual([]);
    expect(sb.voiceLabel).toBe("");
    expect(sb.musicMood).toBe("");
  });
});

describe("serializeManifest", () => {
  it("U-A5: round-trips an unedited manifest byte-for-byte (serialize∘hydrate = identity)", () => {
    const sb = hydrateStoryboard(MANIFEST);
    const back = serializeManifest(sb, MANIFEST);
    expect(back).toEqual(MANIFEST);
    // and it still passes the wire schema
    expect(ProjectManifestSchema.safeParse(back).success).toBe(true);
  });

  it("U-A6: an edited script writes scriptText back while PRESERVING reference/translation/visualAssetKey/composition from the base", () => {
    const sb = hydrateStoryboard(MANIFEST);
    const edited = updateSceneScript(sb, "s1", "A brand new line");
    const back = serializeManifest(edited, MANIFEST);

    expect(back.scenes[0].scriptText).toBe("A brand new line");
    // non-UI fields survive the round trip
    expect(back.scenes[0].reference).toBe("JOHN 1:23");
    expect(back.scenes[0].translation).toBe("KJV");
    expect(back.scenes[0].visualAssetKey).toBe("projects/p1/scenes/s1.mp4");
    expect(back.composition).toEqual(MANIFEST.composition);
    expect(back.endCard).toEqual(MANIFEST.endCard);
    expect(ProjectManifestSchema.safeParse(back).success).toBe(true);
  });

  it("U-A7: music mood edits map to music.style while keeping the cached assetKey", () => {
    const sb = setMusicMood(hydrateStoryboard(MANIFEST), "Ambient pads");
    const back = serializeManifest(sb, MANIFEST);
    expect(back.music).toEqual({ style: "Ambient pads", assetKey: null });
  });

  // ── Task #35: generated asset refs hydrate + serialize ─────────────────────
  it("U-A11: hydrate reads the persisted asset keys into the storyboard (scene visual + whole-project narration/music)", () => {
    const sb = hydrateStoryboard(MANIFEST);
    expect(sb.scenes[0].visualAssetKey).toBe("projects/p1/scenes/s1.mp4");
    expect(sb.scenes[1].visualAssetKey).toBeNull();
    expect(sb.narrationAssetKey).toBe("projects/p1/narration/track.mp3");
    expect(sb.musicAssetKey).toBeNull();
  });

  it("U-A12: a rerolled scene visualAssetKey is written back (the reroll → commit persistence path)", () => {
    const sb = setSceneVisual(hydrateStoryboard(MANIFEST), "s2", {
      assetKey: "projects/p1/assets/gen-new",
      url: "http://minio/signed",
      // `kind` became REQUIRED with genesis-1 item 4: the key and the media kind describe
      // the same bytes, so they are written together or the renderer picks the wrong
      // element for them.
      kind: "image",
    });
    const back = serializeManifest(sb, MANIFEST);
    expect(back.scenes[1].visualAssetKey).toBe("projects/p1/assets/gen-new");
    // the ephemeral preview url never crosses the wire
    expect((back.scenes[1] as Record<string, unknown>).visualUrl).toBeUndefined();
    expect(ProjectManifestSchema.safeParse(back).success).toBe(true);
  });

  it("U-A13: regenerated narration/music asset keys write narratorVoice.assetKey + music.assetKey", () => {
    let sb = hydrateStoryboard(MANIFEST);
    sb = setNarrationAsset(sb, "projects/p1/narration/new.mp3");
    sb = setMusicAsset(sb, "projects/p1/music/new.mp3");
    const back = serializeManifest(sb, MANIFEST);
    expect(back.narratorVoice.assetKey).toBe("projects/p1/narration/new.mp3");
    expect(back.music?.assetKey).toBe("projects/p1/music/new.mp3");
    expect(ProjectManifestSchema.safeParse(back).success).toBe(true);
  });

  // ── Task #58 (design-delta §2.11 / §9-Q10): a non-KJV/BSB translation ─────────
  it("U-A18: a manifest scene with a non-KJV/BSB translation hydrates + serializes + still passes the wire schema", () => {
    const withNiv: ProjectManifest = {
      ...MANIFEST,
      scenes: [{ ...MANIFEST.scenes[0], translation: "NIV" }],
      endCard: { headline: "JOHN 1:23 · NIV" },
    };
    const sb = hydrateStoryboard(withNiv);
    // the UI Scene carries the licensed abbreviation through (task #57 seam)
    expect(sb.scenes[0].translation).toBe("NIV");

    const back = serializeManifest(sb, withNiv);
    expect(back.scenes[0].translation).toBe("NIV");
    // the serialized manifest is a VALID wire manifest — before task #58 the narrow
    // KJV/BSB enum would have rejected this, blocking commit/round-trip.
    expect(ProjectManifestSchema.safeParse(back).success).toBe(true);
  });
});

// ── Task #57: per-scene scripture carry-through (item 1, the reattachment bug) ──
describe("task 57 — per-scene scripture carry-through + post-commit refresh", () => {
  /** A re-plan's LLM output whose ids overlap the base by construction (s1…sN),
   *  with per-scene scripture DELIBERATELY different from the base's id-matched
   *  scenes so a reattachment bug is detectable. */
  const REPLAN = {
    scenes: [
      {
        name: "still waters",
        scriptText: "he leadeth me beside the still waters",
        reference: "PSALM 23:2",
        translation: "BSB",
        visualPrompt: "calm river at dusk",
        suggestedDurationSeconds: 6,
      },
      {
        name: "shadow",
        scriptText: "though I walk through the valley",
        reference: "PSALM 23:4",
        translation: "BSB",
        visualPrompt: "narrow canyon in shadow",
        suggestedDurationSeconds: 7,
      },
    ],
    narratorVoice: { description: "gentle shepherd voice" },
    musicStyle: "Soft strings",
  };

  it("U-A14: hydrate reads each scene's reference/translation onto the UI Scene", () => {
    const sb = hydrateStoryboard(MANIFEST);
    expect(sb.scenes[0].reference).toBe("JOHN 1:23");
    expect(sb.scenes[0].translation).toBe("KJV");
    expect(sb.scenes[1].reference).toBe("JOHN 1:23");
    expect(sb.scenes[1].translation).toBe("KJV");
  });

  it("U-A15 (flagship): a re-plan whose ids overlap the base serializes the FRESH per-scene scripture, not the id-matched base's stale value", () => {
    // base s1/s2 both hold JOHN 1:23 / KJV; the re-plan's s1/s2 hold Psalm scripture.
    const replanned = storyboardFromGenerated(REPLAN, hydrateStoryboard(MANIFEST));
    // ids overlap the base by construction (proves the id-rematch would have fired)
    expect(replanned.scenes.map((s) => s.id)).toEqual(["s1", "s2"]);

    const back = serializeManifest(replanned, MANIFEST);
    // the committed manifest carries the re-plan's OWN scripture, NOT JOHN 1:23/KJV
    expect(back.scenes[0].reference).toBe("PSALM 23:2");
    expect(back.scenes[0].translation).toBe("BSB");
    expect(back.scenes[1].reference).toBe("PSALM 23:4");
    expect(back.scenes[1].translation).toBe("BSB");
    // and it is still a valid wire manifest
    expect(ProjectManifestSchema.safeParse(back).success).toBe(true);
  });

  it("U-A16: projectWithManifest — the post-commit refresh becomes the next merge base and the next brief's scene source", () => {
    // Rewritten 2026-07-30. This used to assert that a re-plan + commit changed what
    // `sceneScriptureContext` fed the passage FETCH; that read is gone (a scene has no
    // provider-issued USFM, so it could never produce a fetchable reference — see
    // U-A33/U-A34). What the refresh is genuinely load-bearing for survives: the
    // committed scenes become the next commit's merge base AND the source of the scene
    // references a rewrite brief names.
    const staleProject = {
      id: "p1",
      projectName: "p1",
      repo: "o/r",
      versionBranch: "v0.0.1",
      storyboard: hydrateStoryboard(MANIFEST),
      manifest: MANIFEST,
    };
    expect(staleProject.manifest.scenes[0].reference).toBe("JOHN 1:23");

    const committed = serializeManifest(
      storyboardFromGenerated(REPLAN, hydrateStoryboard(MANIFEST)),
      MANIFEST,
    );
    const refreshed = projectWithManifest(staleProject, committed);

    expect(refreshed.manifest!.scenes[0].reference).toBe("PSALM 23:2");
    expect(refreshed.manifest!.scenes[0].translation).toBe("BSB");
    // the original stale project is untouched (immutability)
    expect(staleProject.manifest.scenes[0].reference).toBe("JOHN 1:23");
  });

  it("U-A17: the project passage is INVARIANT across a re-plan — which is why it lives at project scope", () => {
    // The reason `passageId` is not a per-scene field: a storyboard re-plan replaces
    // `scenes` wholesale, so anything stored there is destroyed by the very action that
    // most needs the origin passage. The project block survives it untouched.
    const withPassage: ProjectManifest = {
      ...MANIFEST,
      scripture: {
        reference: "Psalm 121",
        translation: "BSB",
        language: "en",
        passageId: "PSA.121",
      },
    };
    const before = projectScriptureContext(withPassage);
    const committed = serializeManifest(
      storyboardFromGenerated(REPLAN, hydrateStoryboard(withPassage)),
      withPassage,
    );
    expect(committed.scenes[0].reference).toBe("PSALM 23:2"); // the scenes DID change
    expect(projectScriptureContext(committed)).toEqual(before); // the passage did not
  });
});

describe("commitMessage", () => {
  it("U-A8: names the single changed scene", () => {
    const sb = updateSceneScript(hydrateStoryboard(MANIFEST), "s1", "changed");
    expect(commitMessage(sb, MANIFEST)).toBe("Update scene: wilderness · dawn");
  });

  it("U-A9: counts multiple changed scenes", () => {
    let sb = hydrateStoryboard(MANIFEST);
    sb = updateSceneScript(sb, "s1", "changed one");
    sb = updateSceneScript(sb, "s2", "changed two");
    expect(commitMessage(sb, MANIFEST)).toBe("Update 2 scenes");
  });

  it("U-A10: falls back to a music / generic message", () => {
    expect(commitMessage(setMusicMood(hydrateStoryboard(MANIFEST), "New mood"), MANIFEST)).toBe(
      "Update music",
    );
    expect(commitMessage(hydrateStoryboard(MANIFEST), MANIFEST)).toBe(
      "Update storyboard",
    );
  });
});

// ---------------------------------------------------------------------------
// Render-bug fields must survive the hydrate → edit → serialize round trip. A field the
// composition READS but the adapter drops is erased on the next commit — the exact
// regression `canonicalizeManifest` already suffered with narratorVoice.assetKey.
// ---------------------------------------------------------------------------

const RENDER_BUG_MANIFEST: ProjectManifest = {
  manifestVersion: 1,
  composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
  scenes: [
    {
      id: "s1",
      name: "Alpha",
      scriptText: "In the beginning God created the heaven and the earth.",
      reference: "Genesis 1:1",
      translation: "KJV",
      visualPrompt: "a formless void",
      durationSeconds: 4,
      captions: true,
      visualAssetKey: "projects/p/assets/img-1",
      visualAssetKind: "image",
      narrationAssetKey: "projects/p/assets/gen-1-scene-s1",
      narrationDurationSeconds: 6.5,
    },
    {
      id: "s2",
      name: "Beta",
      scriptText: "And God said, Let there be light.",
      reference: "Genesis 1:3",
      translation: "KJV",
      visualPrompt: "first light",
      durationSeconds: 5,
      captions: false,
      visualAssetKey: "projects/p/assets/clip-2",
      visualAssetKind: "video",
    },
  ],
  narratorVoice: { description: "Warm narrator" },
  music: {
    style: "ambient pads",
    assetKey: "projects/p/assets/music-1",
    durationSeconds: 29.07,
  },
};

describe("manifest-adapter — render-bug fields", () => {
  it("U-A20: hydrate carries per-scene narration, the visual kind, and the measured bed length", () => {
    const sb = hydrateStoryboard(RENDER_BUG_MANIFEST);
    expect(sb.scenes[0].narrationAssetKey).toBe("projects/p/assets/gen-1-scene-s1");
    expect(sb.scenes[0].narrationDurationSeconds).toBe(6.5);
    expect(sb.scenes[0].visualAssetKind).toBe("image");
    expect(sb.scenes[1].visualAssetKind).toBe("video");
    expect(sb.scenes[1].narrationAssetKey).toBeUndefined();
    expect(sb.musicDurationSeconds).toBe(29.07);
  });

  it("U-A21: serialize∘hydrate is still an exact identity WITH the new fields present", () => {
    // The flagship contract (U-A5) extended to the fields this change adds. If hydrate and
    // serialize disagree about any one of them, a commit silently drops it and the render
    // reverts to the pre-fix behaviour one commit later.
    const round = serializeManifest(
      hydrateStoryboard(RENDER_BUG_MANIFEST),
      RENDER_BUG_MANIFEST,
    );
    expect(round).toEqual(RENDER_BUG_MANIFEST);
    expect(ProjectManifestSchema.safeParse(round).success).toBe(true);
  });

  it("U-A22: editing a script preserves that scene's narration ref and measured length", () => {
    const sb = hydrateStoryboard(RENDER_BUG_MANIFEST);
    const edited = {
      ...sb,
      scenes: [{ ...sb.scenes[0], script: "Edited verse." }, sb.scenes[1]],
    };
    const out = serializeManifest(edited, RENDER_BUG_MANIFEST);
    expect(out.scenes[0].scriptText).toBe("Edited verse.");
    expect(out.scenes[0].narrationAssetKey).toBe("projects/p/assets/gen-1-scene-s1");
    expect(out.scenes[0].narrationDurationSeconds).toBe(6.5);
    expect(out.music?.durationSeconds).toBe(29.07);
  });

  it("U-A23: a v1 manifest with none of the new fields round-trips without materializing them", () => {
    // A `narrationAssetKey: undefined` key would break deep-equality AND would be written
    // into the committed JSON as an absent-but-present field. Absence must stay absence.
    const round = serializeManifest(hydrateStoryboard(MANIFEST), MANIFEST);
    expect(round).toEqual(MANIFEST);
    expect("narrationAssetKey" in round.scenes[0]).toBe(false);
    expect("visualAssetKind" in round.scenes[0]).toBe(false);
  });
});

// ── D3: added / deleted scenes must survive the merge honestly ────────────────
describe("serializeManifest — added and deleted scenes (USER DECISION D3)", () => {
  it("U-MA20: an ADDED scene writes its OWN reference/translation, never scene 0's", () => {
    // `serializeManifest` falls back to `base.scenes[0]` for an id it has never seen
    // (manifest-adapter.ts:112-115). A scene added after s2 must therefore arrive
    // carrying s2's scripture, or every new screen silently claims scene 1's verse —
    // the same reattachment class of bug plan row 57 already fixed once.
    const sb = hydrateStoryboard(MANIFEST);
    const withOwnScripture = {
      ...sb,
      scenes: [
        sb.scenes[0],
        sb.scenes[1],
        {
          ...sb.scenes[1],
          id: "s9",
          index: 3,
          script: "the second half of the line",
          reference: "JOHN 1:24",
          translation: "BSB",
        },
      ],
    };
    const out = serializeManifest(withOwnScripture, MANIFEST);
    expect(out.scenes).toHaveLength(3);
    expect(out.scenes[2].id).toBe("s9");
    expect(out.scenes[2].reference).toBe("JOHN 1:24");
    expect(out.scenes[2].translation).toBe("BSB");
    // and specifically NOT the scene-0 fallback
    expect(out.scenes[2].reference).not.toBe(MANIFEST.scenes[0].reference);
    // the result is still a valid wire manifest
    expect(ProjectManifestSchema.safeParse(out).success).toBe(true);
  });

  it("U-MA21: a DELETED scene disappears and the survivors round-trip unchanged", () => {
    const sb = hydrateStoryboard(MANIFEST);
    const without = { ...sb, scenes: [sb.scenes[1]] };
    const out = serializeManifest(without, MANIFEST);
    expect(out.scenes.map((s) => s.id)).toEqual(["s2"]);
    expect(out.scenes[0]).toEqual(MANIFEST.scenes[1]);
    expect(ProjectManifestSchema.safeParse(out).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Feature 1 — the narrator voice: the chosen id, and the label that could not persist
// ---------------------------------------------------------------------------

describe("manifest-adapter — narratorVoice (feature 1)", () => {
  const withVoice = (over: Record<string, unknown>): ProjectManifest => ({
    ...MANIFEST,
    narratorVoice: { ...MANIFEST.narratorVoice, ...over },
  });

  it("U-V28: the chosen voice id round-trips hydrate → serialize as an identity", () => {
    const m = withVoice({ voiceId: "zac" });
    const sb = hydrateStoryboard(m);
    expect(sb.voiceId).toBe("zac");
    expect(serializeManifest(sb, m)).toEqual(m);
  });

  it("U-V29: absent stays absent — an already-committed manifest is unchanged", () => {
    const sb = hydrateStoryboard(MANIFEST);
    expect(sb.voiceId).toBeUndefined();
    const out = serializeManifest(sb, MANIFEST);
    expect("voiceId" in out.narratorVoice).toBe(false);
    expect(out).toEqual(MANIFEST);
  });

  it("U-V30: a CHANGED voice id is written back — the whole point of the control", () => {
    const m = withVoice({ voiceId: "zac" });
    const sb = { ...hydrateStoryboard(m), voiceId: "tara" };
    expect(serializeManifest(sb, m).narratorVoice.voiceId).toBe("tara");
  });

  it("U-V31: THE voiceLabel BUG — an edited label now persists instead of being discarded", () => {
    // `serializeManifest` wrote `description` from UI state but `label` from
    // `base.narratorVoice.label`. So a label the user (or a re-plan) produced was silently
    // replaced by the label already on disk, every single commit. Two fields of the same
    // object, read from two different places, with nothing to indicate which won.
    const m = withVoice({ label: "OLD LABEL" });
    const sb = { ...hydrateStoryboard(m), voiceLabel: "NEW LABEL" };
    expect(serializeManifest(sb, m).narratorVoice.label).toBe("NEW LABEL");
  });

  it("U-V32: clearing the label removes it rather than writing an empty string", () => {
    // `VoiceDescriptorSchema.label` is `min(1)`, so an empty string would make the
    // manifest un-committable at the api's 422 boundary.
    const m = withVoice({ label: "OLD LABEL" });
    const sb = { ...hydrateStoryboard(m), voiceLabel: "" };
    const out = serializeManifest(sb, m);
    expect("label" in out.narratorVoice).toBe(false);
    expect(ProjectManifestSchema.safeParse(out).success).toBe(true);
  });

  it("U-V33: a manifest carrying a voice id stays schema-valid", () => {
    expect(ProjectManifestSchema.safeParse(withVoice({ voiceId: "zac" })).success).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Feature 2 — the project's origin passage survives the studio's Commit
// ---------------------------------------------------------------------------
//
// `serializeManifest` builds its result field-by-field with NO `...base` spread, so a
// manifest field it does not name is deleted on every commit. `scripture` is seeded by
// the scaffold (`project-jobs-service.ts` seeds it past the schema), so the data is
// already in the user's repo — the studio was destroying it. This is the SECOND of two
// independent erasure points; the first is the read-side parse in `lib/api/contracts.ts`.
// Fixing only one leaves the other live, which is why both land together.
describe("manifest-adapter — the project's origin passage (feature 2)", () => {
  const SCRIPTURE = {
    reference: "Psalm 121",
    translation: "BSB",
    language: "en",
    passageId: "PSA.121",
  } as const;
  const withScripture: ProjectManifest = { ...MANIFEST, scripture: { ...SCRIPTURE } };

  it("U-A26: serialize∘hydrate is an identity for a manifest carrying scripture", () => {
    const back = serializeManifest(hydrateStoryboard(withScripture), withScripture);
    expect(back).toEqual(withScripture);
    expect(back.scripture).toEqual(SCRIPTURE);
    expect(ProjectManifestSchema.safeParse(back).success).toBe(true);
  });

  it("U-A27: an EDIT elsewhere still preserves the passage — the real commit path", () => {
    // The studio does not edit the project passage, so it is preserved from `base`
    // rather than carried on the UI `Storyboard`. This is the case that was broken:
    // edit a scene's script, hit Commit, and the passage was gone from the repo.
    const edited = updateSceneScript(
      hydrateStoryboard(withScripture),
      "s1",
      "A brand new line",
    );
    const back = serializeManifest(edited, withScripture);
    expect(back.scenes[0].scriptText).toBe("A brand new line");
    expect(back.scripture).toEqual(SCRIPTURE);
  });

  it("U-A28: absent stays absent — no spurious empty block in the committed repo", () => {
    const back = serializeManifest(hydrateStoryboard(MANIFEST), MANIFEST);
    expect("scripture" in back).toBe(false);
    expect(back).toEqual(MANIFEST);
  });

  it("U-A29: hydrate does not surface it on the Storyboard — it is project scope, not UI scope", () => {
    // Deliberate: adding it to `Storyboard` would make it look editable in the studio,
    // which is scope this feature does not have. STILL TRUE after the 2026-07-30
    // carry-through fix: the generation inputs read `project.manifest` at the call site
    // (see `generation-input.ts`) rather than routing the passage through the UI
    // storyboard, so this mirror deliberately did not have to move.
    expect("scripture" in hydrateStoryboard(withScripture)).toBe(false);
  });

  // B5 / plan §D-1's promised bonus fix: the picker's tags are BCP-47, and this read
  // used to hardcode "eng", silently re-resolving a non-English project against English.
  // Re-pointed 2026-07-30 from the scene-keyed `sceneScriptureContext` to
  // `projectScriptureContext`: the USFM the passage endpoint requires is PROJECT-scoped
  // (`ManifestScene` has no `passageId`), so a scene-keyed lookup could never produce one.
  it("U-A30: projectScriptureContext prefers the stored language tag", () => {
    expect(projectScriptureContext(withScripture)?.language).toBe("en");
  });

  it("U-A31: projectScriptureContext still falls back to 'eng' when no tag is stored", () => {
    expect(
      projectScriptureContext({
        ...MANIFEST,
        scripture: { reference: "Psalm 121", translation: "BSB", passageId: "PSA.121" },
      })?.language,
    ).toBe("eng");
  });

  it("U-A32: a FRESH SCAFFOLD's storyboard reference comes from the project passage", () => {
    // The second half of the reported bug. A scaffolded project has `scenes: []` and no
    // `endCard`, so `storyboard.reference` was `""` — which is why the generation brief
    // degraded to "…storyboard for test-1" and the model was left to invent a passage.
    // `buildBlankManifest()` (db-lib) emits `scenes: []` and NO endCard, which is exactly
    // the state this reproduces — the MANIFEST fixture's own endCard has to go, or the
    // fixture is not a scaffold.
    const fresh: ProjectManifest = { ...MANIFEST, scenes: [], scripture: { ...SCRIPTURE } };
    delete fresh.endCard;
    expect(hydrateStoryboard(fresh).reference).toBe("Psalm 121");
  });

  it("U-A32b: an endCard headline still wins, and a scene reference is still the last resort", () => {
    // Ordering, stated as behaviour: endCard (the author's own title) > the project's
    // origin passage > a scene reference (which may be LLM-authored).
    expect(
      hydrateStoryboard({
        ...MANIFEST,
        scenes: [],
        endCard: { headline: "A title the user wrote" },
        scripture: { ...SCRIPTURE },
      }).reference,
    ).toBe("A title the user wrote");
    // MANIFEST has an endCard of its own, so strip it to see the fallback chain.
    const noEndCard = { ...MANIFEST };
    delete noEndCard.endCard;
    expect(hydrateStoryboard(noEndCard).reference).toBe("JOHN 1:23");
  });

  it("U-A32c: the PROJECT PASSAGE outranks a scene reference — the middle rung nothing pinned", () => {
    // U-A32b looks like it covers the whole chain and does not. It pins endCard > scripture
    // and "no endCard, no scripture ⇒ scene", but never scripture > SCENE: its first fixture
    // has `scenes: []` and its second has no `scripture`, so the two candidates are never
    // both present at once. Nothing else in the lane put them together either — swapping the
    // `scripture` and `scenes[0]` rungs in `manifest-adapter.ts` left all 1328 tests green,
    // and this is a precedence THIS RUN introduced.
    //
    // It is not a cosmetic ordering. A scene reference may have been authored by the model,
    // which is the whole point of `manifest-adapter.ts`'s own comment ("a scene reference is
    // the last resort"), and this value feeds the generation brief. So inverting it hands the
    // model back its own previous guess instead of the passage the user chose in the wizard —
    // i.e. it re-creates the reported bug's exact symptom, which the fixture's scene
    // reference is named after.
    const bothPresent: ProjectManifest = {
      ...MANIFEST,
      scenes: [{ ...MANIFEST.scenes[0], reference: "Genesis 1:1", translation: "ASV" }],
      scripture: { ...SCRIPTURE },
    };
    delete bothPresent.endCard;
    expect(hydrateStoryboard(bothPresent).reference).toBe("Psalm 121");
  });

  it("U-A33: projectScriptureContext sends the USFM passageId as `reference`", () => {
    // `ScripturePassageRequestSchema.reference` reaches dbos's `fetchPassage`, whose only
    // accepted form is a provider-issued USFM id. Measured live 2026-07-30: a human
    // reference is a 404, which dbos raises as a PERMANENT uncaught error.
    expect(projectScriptureContext(withScripture)).toEqual({
      reference: "PSA.121",
      translation: "BSB",
      language: "en",
    });
  });

  it("U-A34: NO passageId means NO context — never a human reference that would 404", () => {
    expect(projectScriptureContext(MANIFEST)).toBeUndefined();
    expect(
      projectScriptureContext({
        ...MANIFEST,
        scripture: { reference: "Psalm 121", translation: "BSB" },
      }),
    ).toBeUndefined();
  });

  it("U-A35: a VERSE-RANGE passageId travels verbatim — it is echoed, not parsed", () => {
    // The wizard now persists whatever id the provider echoes for a verse selection
    // (measured live: `PSA.121.1+PSA.121.2` → `"PSA.121.1-2"`). Nothing downstream may
    // reinterpret it; it round-trips through the passage endpoint as-is.
    expect(
      projectScriptureContext({
        ...MANIFEST,
        scripture: { ...SCRIPTURE, passageId: "PSA.121.1-5", reference: "Psalms 121:1-5" },
      })?.reference,
    ).toBe("PSA.121.1-5");
  });
});
