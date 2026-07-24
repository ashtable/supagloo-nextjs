import { describe, expect, it } from "vitest";

import {
  hydrateStoryboard,
  serializeManifest,
  commitMessage,
  sceneScriptureContext,
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

  it("U-A16: sceneScriptureContext + projectWithManifest — rewriteScript reads the post-commit-refreshed manifest, not the stale pre-commit one", () => {
    // The stale (pre-replan) project manifest: s1 = JOHN 1:23 / KJV.
    const staleProject = {
      id: "p1",
      projectName: "p1",
      repo: "o/r",
      versionBranch: "v0.0.1",
      storyboard: hydrateStoryboard(MANIFEST),
      manifest: MANIFEST,
    };
    expect(sceneScriptureContext(staleProject.manifest, "s1")).toEqual({
      reference: "JOHN 1:23",
      translation: "KJV",
      language: "eng",
    });

    // A commit of a re-planned manifest (s1 now PSALM 23:2 / BSB) refreshes the project.
    const committed = serializeManifest(
      storyboardFromGenerated(REPLAN, hydrateStoryboard(MANIFEST)),
      MANIFEST,
    );
    const refreshed = projectWithManifest(staleProject, committed);

    // rewriteScript now sends the NEW scripture (from the refreshed manifest), not the
    // stale JOHN 1:23 the un-refreshed prop still holds.
    expect(sceneScriptureContext(refreshed.manifest!, "s1")).toEqual({
      reference: "PSALM 23:2",
      translation: "BSB",
      language: "eng",
    });
    // the original stale project is untouched (immutability)
    expect(sceneScriptureContext(staleProject.manifest, "s1")?.reference).toBe(
      "JOHN 1:23",
    );
  });

  it("U-A17: sceneScriptureContext returns undefined for an unknown scene id", () => {
    expect(sceneScriptureContext(MANIFEST, "nope")).toBeUndefined();
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
