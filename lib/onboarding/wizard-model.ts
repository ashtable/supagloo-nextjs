/**
 * The first-time setup wizard's pure state machine (plan §1.2). The mock design
 * has no working stepper — it's a static filmstrip of 5 screens — so this is
 * designed from scratch: step order, progress fill, the GitHub hard gate,
 * skippability, and the Done recap templated from actual connection state (not
 * the wireframe's hardcoded row).
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
 * Can the wizard move past `step`? GitHub is a hard gate — you cannot advance
 * from it until GitHub itself is connected, even if every other provider is
 * connected. Every other step advances freely.
 */
export function canAdvance(step: WizardStep, connections: ConnectionsState): boolean {
  if (step === "github") return connections.github.status === "connected";
  return true;
}

export function isSkippable(step: WizardStep): boolean {
  return step === "openrouter" || step === "gloo";
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
