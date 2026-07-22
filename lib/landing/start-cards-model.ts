/**
 * The 4 landing origin entry points, as pure data keyed by `createdFrom`. This
 * is the seam the landing components (`start-cards.tsx`, `featured-demo.tsx`)
 * render from, and what the unit suite pins — v1 descopes VOTD / passage / demo
 * to disabled "coming soon" affordances; only "Blank canvas" is live, routing
 * into the workspace's New-project wizard via `/?newproject=blank`.
 *
 * Copy strings are glyph-exact from the wireframe (8a/9b) — the landing e2e
 * asserts them verbatim against DOM text. No React in here.
 */

export type StartOrigin = "votd" | "passage" | "demo" | "blank";

export interface StartEntryPoint {
  createdFrom: StartOrigin;
  title: string;
  desc: string;
  /** May the user actually start a project from this origin in v1? */
  enabled: boolean;
  /** Renders the "Coming soon" pill + disabled treatment when true. */
  comingSoon: boolean;
  /** The E2E hook (`data-testid`). `demo` lives in featured-demo, not a card. */
  testId: string;
}

/** Pill label on every descoped origin. */
export const COMING_SOON_LABEL = "Coming soon";

/**
 * Where the (enabled) blank-canvas card links. The workspace honors
 * `?newproject=blank` by auto-opening the New-project wizard on the create-new
 * tab — the agreed landing↔workspace contract.
 */
export const BLANK_CANVAS_HREF = "/?newproject=blank";

export const START_ENTRY_POINTS: Record<StartOrigin, StartEntryPoint> = {
  votd: {
    createdFrom: "votd",
    title: "Verse of the Day",
    desc: "Today's YouVersion verse, auto-loaded.",
    enabled: false,
    comingSoon: true,
    testId: "start-card-votd",
  },
  passage: {
    createdFrom: "passage",
    title: "From a passage",
    desc: "Pick any book, chapter & verses.",
    enabled: false,
    comingSoon: true,
    testId: "start-card-passage",
  },
  demo: {
    createdFrom: "demo",
    // The featured-demo band owns the demo's real copy (title, description,
    // tags); this entry only models the CTA's enablement + testid.
    title: "▶ Start from this demo",
    desc: "",
    enabled: false,
    comingSoon: true,
    testId: "start-demo",
  },
  blank: {
    createdFrom: "blank",
    title: "Blank canvas",
    desc: "Build the flow from scratch.",
    enabled: true,
    comingSoon: false,
    testId: "start-card-blank",
  },
};

/** The "OR START YOUR OWN" trio, in wireframe order (demo is its own band). */
export const LANDING_START_CARDS: readonly StartEntryPoint[] = [
  START_ENTRY_POINTS.votd,
  START_ENTRY_POINTS.passage,
  START_ENTRY_POINTS.blank,
];
