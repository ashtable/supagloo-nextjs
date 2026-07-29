/**
 * Figure 20b — the ADVISORY cost and time for a video generation.
 *
 * ## Read this before touching anything here
 *
 * `lib/studio/cost-estimate.ts` refuses to price video, deliberately and permanently:
 *
 * ```ts
 * if (kind === "video") {
 *   return unpriced("Video pricing is not published by the provider — cost unknown.");
 * }
 * ```
 *
 * checked FIRST, before anything reads `pricing`, so that no future catalogue change can
 * turn *"we cannot know this"* into a confident dollar amount. Figure 19a agrees with the
 * code — its SCENE VIDEO cost row reads `"Provider publishes no pricing."` with value
 * `"—"`.
 *
 * **This module must never feed `cost-estimate.ts` or the 19a cost row.** That is not a
 * style preference; it is the difference between a number the product stands behind and a
 * rough figure someone measured once. It is enforced by U-D7 in `video-advisory.test.ts`,
 * which reads `cost-estimate.ts`'s SOURCE and fails if it so much as mentions this file.
 *
 * ## What this is instead
 *
 * A warning with no magnitude barely warns — "video is expensive" tells a user nothing
 * they can act on. So the 20b dialog, and only the 20b dialog, shows a measured
 * observation, labelled as one, carrying the date it was taken. It is presented as
 * anecdote ("one clip cost this much"), never as a price.
 *
 * ## Where the numbers come from, and where 20b is not followed
 *
 * ONE live `wan-2.7` clip, measured 2026-07-28: `usage.cost` **$0.50**, wall time
 * **8 min 5 s**.
 *
 * | 20b draws | shipped | why |
 * |---|---|---|
 * | `$0.50` per scene | `$0.50` | it IS the measurement |
 * | `2–6 MIN` per scene | **`~8 min`** | the only run we have took 8 min 5 s. Printing 2–6 min would understate the wait by more than 30% while claiming to be an estimate. |
 * | `$2.00` / `24 minutes` for 4 scenes | computed `N ×` | same form as drawn; the literals assume four scenes and the wrong per-scene time |
 * | `~15 seconds` for a still | omitted | no telemetry exists for it |
 * | `"roughly 1/150th the cost"` | omitted | there is no ratio when one side is unpriced |
 *
 * The still-image side of the dialog is rendered through `estimateGenerationCost`, which
 * answers honestly per model (and for the current Gloo default answers `unpriced`).
 */

export interface VideoAdvisory {
  /** ISO date the measurement was taken. Rendered on screen — an undated estimate is a
   *  rumour. */
  readonly measuredOn: string;
  /** Observed `usage.cost` of one clip, USD. */
  readonly costPerSceneUsd: number;
  /** Observed wall-clock time for one clip, seconds. */
  readonly secondsPerScene: number;
  /** What was actually run, so the figure can be re-derived or challenged. */
  readonly basis: string;
}

export const VIDEO_ADVISORY: VideoAdvisory = {
  measuredOn: "2026-07-28",
  costPerSceneUsd: 0.5,
  secondsPerScene: 485,
  basis: "one live wan-2.7 clip",
};

/**
 * The qualifier that rides with EVERY advisory number on screen.
 *
 * Not decoration: without it these read as a price, and the provider publishes none. The
 * date is interpolated so the sentence ages visibly rather than silently.
 */
export function advisoryQualifier(advisory: VideoAdvisory = VIDEO_ADVISORY): string {
  return `Rough estimate from ${advisory.basis}, measured ${advisory.measuredOn} — the provider publishes no price, so your cost may differ.`;
}

/** `$0.50`. Two decimals: these are dollars-and-cents magnitudes, not the four-decimal
 *  per-token rates the honest cost module renders. */
export function formatAdvisoryUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/**
 * `"~8 min"` / `"~2 min"` / `"~45 sec"`.
 *
 * Always prefixed with `~`: a single measurement is not a range, and rendering `8:05`
 * would imply a precision one sample cannot support.
 */
export function formatAdvisoryDuration(seconds: number): string {
  if (seconds < 90) return `~${Math.round(seconds)} sec`;
  return `~${Math.round(seconds / 60)} min`;
}

/**
 * The whole-video projection 20b shows beside the per-scene one: *"Generating video for
 * all N scenes would cost about X and take up to Y."*
 *
 * Computed from the scene count rather than drawn, because the figure's `$2.00` /
 * `24 minutes` assume exactly four scenes and a per-scene time we did not measure.
 */
export function advisoryForScenes(
  sceneCount: number,
  advisory: VideoAdvisory = VIDEO_ADVISORY,
): { usd: number; seconds: number } {
  const n = Math.max(0, Math.floor(sceneCount));
  return {
    usd: n * advisory.costPerSceneUsd,
    seconds: n * advisory.secondsPerScene,
  };
}
