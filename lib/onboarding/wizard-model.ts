/**
 * The first-time setup wizard's pure state machine (plan §1.2). The mock design
 * has no working stepper — it's a static filmstrip of 5 screens — so this is
 * designed from scratch: step order, progress fill, skippability, and the Done
 * recap templated from actual connection state (not the wireframe's hardcoded row).
 *
 * ── R1 (2026-07-31): the GitHub hard gate is GONE ───────────────────────────
 *
 * `canAdvance(step, connections)` used to answer `false` for `github` until GitHub
 * itself was connected. That made the wizard a single point of failure for the
 * whole product: any bug in the GitHub flow locked every new user out of
 * everything, because the wizard overlays the only page they can reach.
 *
 * Connections are now optional at onboarding and enforced AT THE POINT OF USE —
 * `lib/workspace/connection-guardrail.ts` refuses project create/import, and the
 * api answers `409 provider_not_connected` for a generation on an unconnected
 * provider. This is a deliberate REVERSAL of stated design intent: turn 11's own
 * subtitle reads "first-time setup (GitHub required · OpenRouter + Gloo optional)".
 *
 * The predicate was DELETED rather than made to always return `true`. A gate that
 * cannot refuse is dead weight that still reads like a gate — and the wizard's
 * auto-advance effect called it, so an always-true version would have skipped the
 * GitHub step the instant the wizard mounted.
 */

import type { ConnectionsState, Provider } from "../connections/connections-model";

export type WizardStep = "welcome" | "github" | "openrouter" | "gloo" | "done";

export const WIZARD_STEPS: readonly WizardStep[] = [
  "welcome",
  "github",
  "openrouter",
  "gloo",
  "done",
];

const PROGRESS: Record<WizardStep, number> = {
  welcome: 20,
  github: 45,
  openrouter: 70,
  gloo: 92,
  done: 100,
};

export function progressFill(step: WizardStep): number {
  return PROGRESS[step];
}

const STEP_LABELS: Record<Exclude<WizardStep, "done">, string> = {
  welcome: "STEP 1 OF 4 · WELCOME",
  github: "STEP 2 OF 4 · CONNECT GITHUB",
  openrouter: "STEP 3 OF 4 · OPENROUTER",
  gloo: "STEP 4 OF 4 · GLOO AI",
};

/** The "STEP n OF 4 · …" eyebrow. Done carries no ordinal. */
export function stepLabel(step: WizardStep): string | null {
  if (step === "done") return null;
  return STEP_LABELS[step];
}

/**
 * Which steps offer an escape. THE single source the component consults — before R1 this
 * was exported, unit-tested, and imported by ZERO components: `SetupWizard` hard-coded the
 * answer by passing `onSkip` to two of the step components and not the third, so the
 * predicate and the UI could disagree without anything noticing.
 *
 * `welcome` has nothing to skip (it is a preamble whose only control moves forward) and
 * `done` is the exit itself.
 */
export function isSkippable(step: WizardStep): boolean {
  return step === "github" || step === "openrouter" || step === "gloo";
}

/** Walk the step order forward one; `null` past the end. */
export function nextStep(step: WizardStep): WizardStep | null {
  const idx = WIZARD_STEPS.indexOf(step);
  if (idx === -1 || idx === WIZARD_STEPS.length - 1) return null;
  return WIZARD_STEPS[idx + 1];
}

/** Jump past a skipped optional step. Only meaningful for skippable steps. */
export function stepAfterSkip(step: WizardStep): WizardStep | null {
  return nextStep(step);
}

export interface RecapRow {
  provider: Provider;
  connected: boolean;
  text: string;
}

/** Templates the Done recap from ACTUAL connection state, per provider. */
export function doneRecap(connections: ConnectionsState): RecapRow[] {
  const github = connections.github.status === "connected";
  const openrouter = connections.openrouter.status === "connected";
  const gloo = connections.gloo.status === "connected";

  const githubUsername =
    connections.github.detail?.username ?? "@ashsrinivas";

  return [
    {
      provider: "github",
      connected: github,
      text: github
        ? `✓ GitHub connected · ${githubUsername}`
        : "— GitHub skipped · add later in Profile",
    },
    {
      provider: "openrouter",
      connected: openrouter,
      text: openrouter
        ? "✓ OpenRouter connected"
        : "— OpenRouter skipped · add later in Profile",
    },
    {
      provider: "gloo",
      connected: gloo,
      text: gloo
        ? "✓ Gloo AI connected"
        : "— Gloo AI skipped · add later in Profile",
    },
  ];
}
