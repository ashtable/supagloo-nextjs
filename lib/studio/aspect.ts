/**
 * Aspect-ratio geometry (pure). Maps the format toggle to the Remotion
 * composition resolution and to a display box that fits within the player column
 * while preserving the ratio.
 */

export type Aspect = "9:16" | "16:9" | "1:1";

/** Supported aspects, in format-toggle order. */
export const ASPECTS: readonly Aspect[] = ["9:16", "16:9", "1:1"];

/** Composition resolution (logical pixels) for each aspect. */
export function aspectDimensions(a: Aspect): { width: number; height: number } {
  switch (a) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "16:9":
      return { width: 1920, height: 1080 };
    case "1:1":
      return { width: 1080, height: 1080 };
  }
}

/**
 * Largest box with the aspect's ratio that fits inside `maxWidth × maxHeight`.
 * Width-bound unless that overflows the height, then height-bound.
 */
export function fitDisplayBox(
  a: Aspect,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const { width, height } = aspectDimensions(a);
  const ratio = width / height;
  let w = maxWidth;
  let h = w / ratio;
  if (h > maxHeight) {
    h = maxHeight;
    w = h * ratio;
  }
  return { width: w, height: h };
}
