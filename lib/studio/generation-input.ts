/**
 * The `input` bodies the studio's two TEXT generations POST to
 * `POST /api/ai/generations` — as pure functions, so what travels is testable without a
 * browser, a mocked fetch or a mounted provider.
 *
 * They are extracted from `studio-context.tsx` because the bug they fix was never in the
 * React wiring: the click path worked perfectly and sent the wrong thing.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────────────
 * **`generateStoryboard`** read `project.manifest.scenes[0]` to find its scripture. On a
 * freshly-scaffolded project that is `undefined`, so it POSTed `{brief}` with no `scripture`
 * key at all. The workflow's `fetchScripturePassage` step is presence-gated, so it was
 * skipped entirely and `passage` stayed `null` — while the system prompt still instructed
 * the model to "Break the passage into an ordered sequence of short vertical-video scenes"
 * and `StoryboardSceneSchema` REQUIRES a per-scene `reference` and `translation`. Given no
 * passage and a schema that demands one, the model supplied its own: Genesis 1, ASV. There
 * is no hardcoded Genesis/ASV default anywhere in the four repos — it was the absence of an
 * input, and that is what these functions fix.
 *
 * **`rewriteScript`** did read the manifest, but read a scene's HUMAN `reference` into a
 * field the provider parses as a USFM id. That is a permanent 404 (measured live), so it was
 * failing every time against a real project.
 *
 * ── The rule both functions follow ──────────────────────────────────────────────────
 * A `scripture` block is sent only when the project has a provider-issued USFM
 * (`projectScriptureContext`). Otherwise the passage is named in the BRIEF, as prose. Never
 * a human reference in `scripture.reference` (a guaranteed hard failure) and never a
 * constructed USFM (closed as residual risk) — and never nothing at all, which is what let
 * the model invent a passage in the first place.
 */
import type { ProjectManifest } from "../api/contracts";
import { projectScriptureContext, type ScriptureGenerationContext } from "./manifest-adapter";
import type { Scene, Storyboard } from "./storyboard";

export interface TextGenerationInput {
  brief: string;
  scripture?: ScriptureGenerationContext;
}

/**
 * The first-time / re-plan `storyboard` generation input.
 *
 * The brief names the passage whenever anything knows one — the project's origin passage
 * first (the wizard's own choice, and the only thing a fresh scaffold has), then the
 * storyboard's own reference, and only then the project name. That last fallback is what the
 * user actually got: `"Plan a short scripture-video storyboard for test-1."`
 */
export function storyboardGenerationInput(
  manifest: ProjectManifest,
  storyboard: Storyboard,
  projectName: string,
): TextGenerationInput {
  const scripture = projectScriptureContext(manifest);
  // The HUMAN reference for the prose, deliberately separate from the USFM above: the model
  // is being told which passage to work on, and `"PSA.121.1-5"` is not how a person names
  // one.
  const humanReference = manifest.scripture?.reference || storyboard.reference || "";
  const translation = manifest.scripture?.translation ?? "";

  const subject = humanReference
    ? translation
      ? `${humanReference} (${translation})`
      : humanReference
    : projectName;

  return {
    brief: `Plan a short scripture-video storyboard for ${subject}.`,
    ...(scripture ? { scripture } : {}),
  };
}

/**
 * The per-scene `script` ("rewrite this line") generation input.
 *
 * The scene's own human reference goes in the brief, which is where the per-scene context
 * belongs: it tells the model which part of the passage this line covers without being
 * parsed as an id. The passage FETCH uses the project's USFM, because that is the only
 * provider-issued id a manifest carries.
 */
export function scriptGenerationInput(
  manifest: ProjectManifest,
  scene: Scene,
): TextGenerationInput {
  const scripture = projectScriptureContext(manifest);
  const at = scene.reference ? ` for ${scene.reference}` : "";
  return {
    brief:
      `Rewrite the narration line for this scene${at}, staying faithful to the ` +
      `scripture. Current line: "${scene.script}".`,
    ...(scripture ? { scripture } : {}),
  };
}
