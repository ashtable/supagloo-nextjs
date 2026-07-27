/**
 * Deterministic per-scene poster art for the watch page's HOW IT WAS MADE grid
 * (Turn 16a, Step 4 §1.4d). No React, no DOM, no network.
 *
 * WHY THIS IS DERIVED RATHER THAN FETCHED. There is no per-scene still anywhere in the
 * product: a manifest scene carries a `visualPrompt`, and `GalleryItem.makingOf`
 * deliberately carries no asset key. Presigning one object per scene would put N extra
 * round trips on the app's most public page and give it N more ways to half-render, for
 * decoration. So the strip is a function of the scene's position, and the only property
 * it has to keep is being the SAME on every render of the same item.
 *
 * WHAT THE DESIGN ANSWERS, AND WHAT IT DOESN'T. The design draws exactly four gradients
 * for a four-scene item and says nothing about any other count — Step 4 §8 records it as
 * unanswered (A9). The obvious fill-in, `RAMP[index % 4]`, wraps a seven-scene item back
 * to the darkest stop halfway through, which reads as a bug rather than a decision. The
 * rule here instead STRETCHES the four-stop ramp across however many scenes there are:
 *
 *   scene 1 is always the ramp's darkest stop, the last scene always its brightest, and
 *   everything between is distributed evenly along the ramp.
 *
 * That preserves what the four drawn gradients actually mean — a dark-to-light arc
 * across the video, which for the design's own Genesis 1 item is the passage — at any
 * scene count, and it is monotonic, so the strip never goes backwards.
 */

/**
 * The four gradients Step 4 §1.4d draws, VERBATIM, ordered darkest → brightest.
 *
 * Note the focal point rises with the brightness (`50% 60%` → `50% 45%`) — that is the
 * design's, not an interpolation of ours. The strings are copied rather than generated
 * precisely so a refactor cannot quietly restyle them: `scene-poster.test.ts` pins this
 * array against the design's table, so changing a hex fails the test that cites the
 * design.
 */
export const SCENE_POSTER_RAMP: readonly string[] = [
  "radial-gradient(circle at 50% 60%,#2a1a2e,#0a0610)",
  "radial-gradient(circle at 50% 55%,#1e3350,#080e18)",
  "radial-gradient(circle at 50% 50%,#8a3a1e,#2a1008)",
  "radial-gradient(circle at 50% 45%,#ffffff,#ffe8a8 25%,#f0a43a 60%,#8a3a1e)",
];

/**
 * The CSS `background` value for scene `index` (1-based) of a `total`-scene item.
 *
 * A LONE SCENE gets the ramp's first stop. With one tile there is no dark→bright
 * progression to render, and choosing the start is what makes "scene 1 is always the
 * darkest" hold without an exception to remember.
 *
 * An out-of-range or non-finite `index` CLAMPS rather than returning `undefined`: this
 * is mapped over by a component, and handing CSS the string `"undefined"` renders as no
 * background at all — a silent blank tile instead of a loud failure.
 */
export function scenePosterGradient(index: number, total: number): string {
  const last = SCENE_POSTER_RAMP.length - 1;

  const count = Number.isFinite(total) ? Math.floor(total) : 0;
  if (count <= 1) return SCENE_POSTER_RAMP[0];

  const position = Number.isFinite(index) ? Math.floor(index) : 1;
  const clamped = Math.min(Math.max(position, 1), count);

  const stop = Math.round(((clamped - 1) / (count - 1)) * last);
  return SCENE_POSTER_RAMP[Math.min(Math.max(stop, 0), last)];
}
