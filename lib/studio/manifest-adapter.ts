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
    // Task #57: carry the scene's own scripture onto the UI Scene so it is the single
    // source of truth for serialize (survives a re-plan) — and so the inspector's
    // data-scene-reference/-translation seam reflects it. Round trip stays exact:
    // serialize writes these values straight back.
    reference: s.reference,
    translation: s.translation,
    // Render-bug fields. `visualAssetKind` drives the preview's still-vs-clip branch (and
    // so whether the Ken Burns pan applies); the narration pair is what lets the preview
    // mount this scene's OWN clip inside its own <Sequence> and stretch the scene to fit
    // it. undefined stays undefined so the round trip remains an exact identity.
    visualAssetKind: s.visualAssetKind,
    narrationAssetKey: s.narrationAssetKey,
    narrationDurationSeconds: s.narrationDurationSeconds,
  }));

  // The passage this storyboard is ABOUT, for display and for the generation brief.
  //
  // The `scripture` term is what was missing, and it is the second half of the reported
  // "generated Genesis 1" bug: a freshly-scaffolded project has `scenes: []` and no
  // `endCard`, so this resolved to `""` and the storyboard generation's brief degraded from
  // "…a storyboard for Psalm 23" to "…a storyboard for test-1". Ordering is deliberate —
  // an `endCard.headline` is a title the author wrote, the project passage is what they
  // chose in the wizard, and a scene reference is the last resort because it may have been
  // authored by a model.
  const reference =
    manifest.endCard?.headline ??
    manifest.scripture?.reference ??
    manifest.scenes[0]?.reference ??
    "";

  return {
    title: manifest.endCard?.headline ?? "",
    dateLabel: "",
    reference,
    fps: manifest.composition.fps,
    voiceDescription: manifest.narratorVoice.description,
    voiceLabel: manifest.narratorVoice.label ?? "",
    // Feature 1: the CHOSEN provider voice id. `undefined` stays `undefined` so the round
    // trip is an exact identity — a materialized key would be a spurious diff in the
    // user's committed repo on every save.
    voiceId: manifest.narratorVoice.voiceId,
    musicMood: manifest.music?.style ?? "",
    // Task #35: the persisted whole-project audio keys (↔ narratorVoice/music).
    narrationAssetKey: manifest.narratorVoice.assetKey,
    musicAssetKey: manifest.music?.assetKey,
    // Genesis-1: the project's AI provider/model choices + faith alignment. `undefined`
    // stays `undefined` so the round trip remains an exact identity -- a materialized
    // empty object would serialize into the user's committed repo as a spurious diff on
    // every save.
    aiSettings: manifest.aiSettings,
    // The MEASURED bed length: what the preview loops the bed over so its "one continuous
    // bed" matches the render's.
    musicDurationSeconds: manifest.music?.durationSeconds,
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
  // The label is written from the UI storyboard, like the description beside it.
  // It used to come from `base.narratorVoice.label` — two fields of the SAME object read
  // from two different places — so a label the user (or an LLM re-plan) produced was
  // silently replaced by whatever was already on disk, on every commit, with nothing to
  // indicate which won. Empty means ABSENT rather than `""`, because
  // `VoiceDescriptorSchema.label` is `min(1)` and an empty string would make the manifest
  // fail the api's 422 boundary.
  const label = storyboard.voiceLabel || undefined;
  const narratorVoice = {
    description: storyboard.voiceDescription,
    ...(label !== undefined ? { label } : {}),
    // Task #35: the generated whole-project narration key comes from the storyboard
    // (a regeneration updates it), preserving absent/null/string exactly.
    ...(storyboard.narrationAssetKey !== undefined
      ? { assetKey: storyboard.narrationAssetKey }
      : {}),
    // Feature 1: the chosen provider voice id, from the UI storyboard so a change to the
    // voice list actually persists. Without this branch the control would appear to save
    // and revert on the next commit — the exact failure `narratorVoice.assetKey` already
    // shipped once.
    ...(storyboard.voiceId !== undefined ? { voiceId: storyboard.voiceId } : {}),
  };

  const music = storyboard.musicMood
    ? {
        style: storyboard.musicMood,
        ...(storyboard.musicAssetKey !== undefined
          ? { assetKey: storyboard.musicAssetKey }
          : {}),
        // Without this the measured length is dropped on every commit and the composition
        // silently reverts to a bed that plays once and stops.
        ...(storyboard.musicDurationSeconds !== undefined
          ? { durationSeconds: storyboard.musicDurationSeconds }
          : {}),
      }
    : base.music;

  // Written from the UI storyboard so a settings change actually persists -- the third
  // and fourth of the four mirrors (db-lib schema -> dbos canonicalizeManifest ->
  // contracts.ts -> here, BOTH directions). Missing any one of them makes the control
  // appear to save and then silently revert on the next commit, which is the exact bug
  // that already shipped once for `narratorVoice.assetKey`.
  //
  // An EMPTY settings object is dropped rather than written: "the user has chosen
  // nothing" is the absence of the block, not an empty one.
  const aiSettings =
    storyboard.aiSettings !== undefined
      ? Object.keys(storyboard.aiSettings).length > 0
        ? storyboard.aiSettings
        : undefined
      : base.aiSettings;

  return {
    manifestVersion: 1,
    composition: base.composition,
    narratorVoice,
    ...(music !== undefined ? { music } : {}),
    ...(aiSettings !== undefined ? { aiSettings } : {}),
    ...(base.endCard !== undefined ? { endCard: base.endCard } : {}),
    // Feature 2: the project's origin passage, PRESERVED FROM `base`. This return builds
    // its object field-by-field with no `...base` spread, so a field it does not name is
    // deleted from the user's repo on every commit — and the scaffold seeds `scripture`,
    // so the data is really there to destroy. Preserved rather than carried on the UI
    // `Storyboard` because the studio does not edit the project passage; putting it on
    // the storyboard would make it look editable, which is scope this feature lacks.
    ...(base.scripture !== undefined ? { scripture: base.scripture } : {}),
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
        // Task #57: write the scene's OWN scripture (from hydrate or an LLM re-plan),
        // falling back to the id-matched base ONLY when absent. This replaces the old
        // id-rematch that silently reattached a different old scene's stale
        // reference/translation onto brand-new re-planned content. Task #58: the
        // translation is a free YouVersion-licensed abbreviation (§2.11 / §9-Q10),
        // validated against the live collection at GENERATION time — carried through
        // here verbatim, never enum-gated at commit or re-narrowed on the read.
        reference: s.reference ?? preserved.reference,
        translation: s.translation ?? preserved.translation,
        // Task #35: write the (possibly rerolled) generated-visual key from the UI
        // scene, preserving absent/null/string exactly (the ephemeral preview URL
        // is deliberately NOT serialized).
        ...(s.visualAssetKey !== undefined
          ? { visualAssetKey: s.visualAssetKey }
          : {}),
        // Render-bug fields, written from the UI scene so a fresh narration generation or
        // a reroll that changes the media kind actually persists. The `...preserved` spread
        // above already carries the base values through; these let the UI value win when
        // it has one, and the conditional form keeps absent/null/value distinguishable.
        ...(s.visualAssetKind !== undefined
          ? { visualAssetKind: s.visualAssetKind }
          : {}),
        ...(s.narrationAssetKey !== undefined
          ? { narrationAssetKey: s.narrationAssetKey }
          : {}),
        ...(s.narrationDurationSeconds !== undefined
          ? { narrationDurationSeconds: s.narrationDurationSeconds }
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

/** The `scripture` block a `script`/`storyboard` generation POSTs. Matches db-lib's
 *  `ScripturePassageRequestSchema` — and `reference` there is a USFM id, see below. */
export interface ScriptureGenerationContext {
  /**
   * A **provider-issued USFM passage id** (`"PSA.23"`, `"PSA.121.1-5"`), never a human
   * reference. This field reaches dbos's `fetchPassage`, whose only accepted form is USFM:
   * measured live 2026-07-30, `GET /v1/bibles/111/passages/Psalm%2023` → 404
   * `{"message":"Bible passage Psalm23 for version 111 not found"}`.
   */
  reference: string;
  translation: string;
  language: string;
}

/**
 * The scripture context a generation sends — read from the project's ORIGIN passage in the
 * CURRENT manifest.
 *
 * ── Why this replaced the scene-keyed `sceneScriptureContext` (2026-07-30) ───────────
 * That function returned `ManifestScene.reference`, a HUMAN string, and its value was fed
 * straight into a passage endpoint that requires USFM. A human reference 404s, dbos raises
 * a permanent uncaught `YouVersionPassageNotFoundError`, and the whole generation fails —
 * so every "rewrite this line" against a real project was already broken in production, on
 * a path with no test that had ever sent a non-USFM reference.
 *
 * The USFM is necessarily project-scoped: `ManifestScene` has no `passageId`, only the
 * project's `scripture` block does. That is also the right scope on its own terms — a
 * storyboard re-plan replaces `scenes` wholesale, so anything stored there is destroyed by
 * the very action that most needs the origin passage.
 *
 * **Undefined when there is no `passageId`.** §9-Q10 forbids silent substitution, and the
 * only alternatives would be sending a human reference (a guaranteed permanent failure) or
 * constructing a USFM (closed as residual risk). Callers name the reference in the brief
 * instead, where a human string belongs. Pure.
 */
export function projectScriptureContext(
  manifest: ProjectManifest,
): ScriptureGenerationContext | undefined {
  const s = manifest.scripture;
  if (!s?.passageId) return undefined;
  return {
    // ECHOED from the provider by the wizard — a chapter id or a range id the host itself
    // produced. Carried through verbatim; nothing here parses or rebuilds it.
    reference: s.passageId,
    translation: s.translation,
    // The project's stored BCP-47 tag when the wizard captured one; `"eng"` otherwise
    // (which the live collection route accepts identically — verified 2026-07-30). The
    // point of storing it is that a non-English project stops being re-resolved against
    // English, which a hardcoded `"eng"` used to do silently.
    language: s.language ?? "eng",
  };
}
