/**
 * The manifest ⇄ storyboard adapter (Task #27). The studio's own `Storyboard`/
 * `Scene` (`./storyboard`) are UI-shaped and MISSING several fields the wire
 * `ProjectManifest` requires (`ManifestScene.reference`, `.translation`,
 * `.visualAssetKey`; `composition.width/height/aspectRatio`; `narratorVoice.label`;
 * `music.assetKey`; `endCard`; `manifestVersion`). A naive hydrate→edit→serialize
 * would DROP those and produce a manifest the wire schema rejects (`reference` is a
 * required `min(1)` string). So `serializeManifest` is a MERGE over the source
 * manifest — the editable UI fields are written back onto the base scene of the same
 * id, and every non-UI field is preserved from the base. Pure — no React/DOM.
 *
 * The UI aspect toggle is a PREVIEW-only viewport switch (state.aspect) and is NOT
 * the manifest composition — it is deliberately never written back (design-delta §2:
 * preview and render are separate, non-parity paths in v1).
 */
import type { ProjectManifest } from "../api/contracts";
import type { Scene, Storyboard } from "./storyboard";

/** Wire manifest → the UI storyboard the reducer/editor renders. */
export function hydrateStoryboard(manifest: ProjectManifest): Storyboard {
  const scenes: Scene[] = manifest.scenes.map((s, i) => ({
    id: s.id,
    index: i + 1,
    durationSeconds: s.durationSeconds,
    visualLabel: s.name,
    visualPrompt: s.visualPrompt,
    script: s.scriptText,
    onScreenText: s.captions ? "text" : "voice-only",
    // Task #35: carry the persisted generated-visual key (undefined stays
    // undefined so the round trip is exact); the preview URL is presigned later.
    visualAssetKey: s.visualAssetKey,
  }));

  const reference =
    manifest.endCard?.headline ?? manifest.scenes[0]?.reference ?? "";

  return {
    title: manifest.endCard?.headline ?? "",
    dateLabel: "",
    reference,
    fps: manifest.composition.fps,
    voiceDescription: manifest.narratorVoice.description,
    voiceLabel: manifest.narratorVoice.label ?? "",
    musicMood: manifest.music?.style ?? "",
    // Task #35: the persisted whole-project audio keys (↔ narratorVoice/music).
    narrationAssetKey: manifest.narratorVoice.assetKey,
    musicAssetKey: manifest.music?.assetKey,
    scenes,
  };
}

/**
 * The UI storyboard + the SOURCE manifest → a wire manifest, writing the editable UI
 * fields back onto `base` (of the same scene id) and preserving everything else. The
 * inverse of `hydrateStoryboard` such that
 * `serializeManifest(hydrateStoryboard(m), m)` deep-equals `m`.
 */
export function serializeManifest(
  storyboard: Storyboard,
  base: ProjectManifest,
): ProjectManifest {
  const narratorVoice = {
    description: storyboard.voiceDescription,
    ...(base.narratorVoice.label !== undefined
      ? { label: base.narratorVoice.label }
      : {}),
    // Task #35: the generated whole-project narration key comes from the storyboard
    // (a regeneration updates it), preserving absent/null/string exactly.
    ...(storyboard.narrationAssetKey !== undefined
      ? { assetKey: storyboard.narrationAssetKey }
      : {}),
  };

  const music = storyboard.musicMood
    ? {
        style: storyboard.musicMood,
        ...(storyboard.musicAssetKey !== undefined
          ? { assetKey: storyboard.musicAssetKey }
          : {}),
      }
    : base.music;

  return {
    manifestVersion: 1,
    composition: base.composition,
    narratorVoice,
    ...(music !== undefined ? { music } : {}),
    ...(base.endCard !== undefined ? { endCard: base.endCard } : {}),
    scenes: storyboard.scenes.map((s) => {
      const b = base.scenes.find((x) => x.id === s.id);
      const preserved = b ?? {
        reference: base.scenes[0]?.reference ?? "—",
        translation: base.scenes[0]?.translation ?? "BSB",
      };
      return {
        ...preserved,
        id: s.id,
        name: s.visualLabel,
        scriptText: s.script,
        visualPrompt: s.visualPrompt,
        durationSeconds: s.durationSeconds,
        captions: s.onScreenText === "text",
        // Task #35: write the (possibly rerolled) generated-visual key from the UI
        // scene, preserving absent/null/string exactly (the ephemeral preview URL
        // is deliberately NOT serialized).
        ...(s.visualAssetKey !== undefined
          ? { visualAssetKey: s.visualAssetKey }
          : {}),
      };
    }),
  };
}

/**
 * The default one-click commit message (D-2): a human-meaningful summary derived by
 * diffing the edited storyboard against the source manifest. Publish is the reviewed
 * release step; commit is the lightweight working-branch checkpoint, so it needs no
 * message input — just a sensible non-empty default the API accepts.
 */
export function commitMessage(
  storyboard: Storyboard,
  base: ProjectManifest,
): string {
  const changed = storyboard.scenes.filter((s) => {
    const b = base.scenes.find((x) => x.id === s.id);
    if (!b) return true;
    return (
      b.scriptText !== s.script ||
      b.visualPrompt !== s.visualPrompt ||
      b.durationSeconds !== s.durationSeconds ||
      b.name !== s.visualLabel ||
      (b.captions ? "text" : "voice-only") !== s.onScreenText
    );
  });

  if (changed.length === 1) return `Update scene: ${changed[0].visualLabel}`;
  if (changed.length > 1) return `Update ${changed.length} scenes`;

  const musicChanged = (base.music?.style ?? "") !== storyboard.musicMood;
  if (musicChanged) return "Update music";

  return "Update storyboard";
}
