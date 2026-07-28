/**
 * The studio preview's Ken Burns motion table and music-fitting math.
 *
 * These are a deliberate HAND-MIRROR of the render generator
 * (`supagloo-nodejs-dbos/src/remotion/templates.ts` — `KEN_BURNS` and the `<Loop>`
 * emission). nextjs cannot import from the dbos repo, and the studio preview
 * (`storyboard-video.tsx`) is a separately hand-written composition, so nothing in the
 * system reconciles the two automatically.
 *
 * design-delta §2 limitation 2 accepts preview/render divergence as a v1 cost, and that is
 * fine for layout details. It is NOT fine for a motion effect: a pan that exists only in the
 * render means the studio shows a still image and the downloaded video moves, which reads as
 * a bug in whichever one the user looks at second. Hence the mirror, and hence
 * `ken-burns.test.ts` pinning the table verbatim so a one-sided edit fails a test rather than
 * shipping silently.
 *
 * `scale` values are STRINGS, exactly as in the render generator: React's unitless-property
 * table does not include `scale`, so a numeric value is emitted as `scale:1.1px` — invalid
 * CSS, and the zoom silently does nothing.
 */
export interface KenBurnsMotion {
  scale: [string, string];
  translate: [string, string];
}

export const KEN_BURNS: readonly KenBurnsMotion[] = [
  { scale: ["1", "1.1"], translate: ["0% 0%", "1.5% 1%"] },
  { scale: ["1.1", "1"], translate: ["-1.5% -1%", "0% 0%"] },
  { scale: ["1", "1.1"], translate: ["0% 0%", "-1.5% 1%"] },
  { scale: ["1.1", "1"], translate: ["1.5% -1%", "0% 0%"] },
];

/**
 * The motion for the scene at `index`. Derived purely from the ordinal — never from
 * randomness or a clock — because the render generator is deterministic and byte-pinned by
 * goldens, and a preview that wandered would stop predicting it. Cycling gives adjacent
 * scenes different moves so a cut never looks like a continuation of the previous one.
 */
export function kenBurnsForScene(index: number): KenBurnsMotion {
  return KEN_BURNS[index % KEN_BURNS.length];
}

/**
 * Frames per music-bed iteration, or `null` when the bed should NOT be looped.
 *
 * `null` in two distinct cases, both meaning "play it once, plainly":
 *  - the measured length already covers the composition, so there is nothing to repeat;
 *  - nothing was measured at all (every manifest committed before the measured length
 *    existed). Inventing an iteration length would mis-time the bed on every playthrough,
 *    so the un-looped `<Audio>` — the old behaviour — is the honest fallback.
 */
export function musicLoopFrames(
  measuredSeconds: number | undefined | null,
  fps: number,
  totalFrames: number,
): number | null {
  if (!measuredSeconds || measuredSeconds <= 0) return null;
  const frames = Math.max(1, Math.round(measuredSeconds * fps));
  return frames < totalFrames ? frames : null;
}
