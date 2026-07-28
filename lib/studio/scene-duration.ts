/**
 * The ONE rule reconciling a scene's AUTHORED length with the MEASURED length of its own
 * narration — the nextjs MIRROR of db-lib's `effectiveSceneDurationSeconds`.
 *
 * Mirrored rather than imported because this app hand-mirrors the whole manifest contract
 * (`lib/api/contracts.ts`) instead of depending on db-lib, and this rule is part of that
 * contract: it is what turns a manifest scene into a length. It MUST stay identical to the
 * db-lib version, because three surfaces compute scene frames independently — the generated
 * Remotion composition (render), the studio timeline, and the preview `<Player>` — and if
 * any of them disagrees, the preview stops predicting the render.
 *
 * A scene's `durationSeconds` comes from the LLM's `suggestedDurationSeconds`, which bears no
 * relation to how long the verse takes to read aloud. When the narration is longer, the scene
 * STRETCHES; the alternative is what shipped, which was cutting the verse off mid-sentence.
 *
 * Deliberately derived rather than written back into `durationSeconds`: that field is
 * user-editable in the studio, so overwriting it would discard a duration the user chose and
 * would ratchet upward on every regeneration.
 */
export function effectiveSceneDurationSeconds(scene: {
  durationSeconds: number;
  narrationDurationSeconds?: number | null;
}): number {
  return Math.max(scene.durationSeconds, scene.narrationDurationSeconds ?? 0);
}
