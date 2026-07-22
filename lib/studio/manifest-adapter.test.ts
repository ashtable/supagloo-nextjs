import { describe, expect, it } from "vitest";

import {
  hydrateStoryboard,
  serializeManifest,
  commitMessage,
} from "./manifest-adapter";
import { ProjectManifestSchema, type ProjectManifest } from "../api/contracts";
import { updateSceneScript, setMusicMood } from "./storyboard";

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
