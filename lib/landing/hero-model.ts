/**
 * The auth-varying hero content, as pure functions. This is the seam that lets
 * the signed-in (9a) behavior be verified by unit tests — the E2E suite drives
 * real YouVersion OAuth and has no signed-in session in CI. The component
 * (`hero-lede.tsx`) layers the viewport (mobile-short) variants on top via CSS.
 *
 * Strings are glyph-exact from the canonical wireframe (8a/9a/9b): em dash
 * U+2014, middot U+00B7, fullwidth plus U+FF0B, ▶ U+25B6, ✦ U+2726.
 */

export type PrimaryCta = "start" | "demo";

export interface HeroModel {
  /** Desktop-canonical eyebrow (mobile-short handled in the component via CSS). */
  eyebrow: string;
  /** Desktop-canonical sub-copy. */
  subCopy: string;
  /** Desktop primary CTA identity. */
  primaryCta: PrimaryCta;
  /** Does the hero offer sign-in? (rendered mobile-only when true) === !isAuthed. */
  showHeroSignIn: boolean;
}

const SUBCOPY_BASE =
  "Pick a verse — Supagloo storyboards it, narrates it in the voice you describe, and scores it into a share-ready short.";
const SIGN_IN_SENTENCE = " Sign in with your YouVersion account to begin.";

/** All hero copy in one place so the component and its anchors stay byte-exact. */
export const HERO_COPY = {
  eyebrowSignedOut: "SCRIPTURE VIDEO STUDIO · BUILT ON YOUVERSION",
  eyebrowMobileSignedOut: "SCRIPTURE VIDEO STUDIO",
  subCopyBase: SUBCOPY_BASE,
  subCopySignedOut: SUBCOPY_BASE + SIGN_IN_SENTENCE,
  subCopyMobileSignedOut:
    "Pick a verse — Supagloo storyboards, narrates & scores it into a share-ready short.",
  startCreating: "＋ Start creating",
  watchDemo: "▶ Watch the Genesis demo",
  signIn: "Sign in with YouVersion",
  freePill: "✦ 100% FREE",
} as const;

/**
 * The signed-in welcome eyebrow, from the user's first name (uppercased). Falls
 * back — without the name segment — when no name is available, so an authed user
 * with no profile name never sees a dangling "WELCOME BACK,  ·".
 */
export function welcomeEyebrow(name?: string): string {
  const first = name?.trim().split(/\s+/).filter(Boolean)[0];
  if (!first) return "WELCOME BACK · READY WHEN YOU ARE";
  return `WELCOME BACK, ${first.toUpperCase()} · READY WHEN YOU ARE`;
}

/**
 * The auth-driven hero model. Signed-out is the 8a hero (sign-in has moved to
 * the nav; the hero's sole desktop CTA is the gradient demo, and a hero sign-in
 * re-surfaces on mobile 9b). Signed-in is the 9a hero (welcome eyebrow, "Start
 * creating" primary, sub-copy without the sign-in sentence).
 */
export function heroModel(isAuthed: boolean, name?: string): HeroModel {
  if (isAuthed) {
    return {
      eyebrow: welcomeEyebrow(name),
      subCopy: HERO_COPY.subCopyBase,
      primaryCta: "start",
      showHeroSignIn: false,
    };
  }
  return {
    eyebrow: HERO_COPY.eyebrowSignedOut,
    subCopy: HERO_COPY.subCopySignedOut,
    primaryCta: "demo",
    showHeroSignIn: true,
  };
}
