// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, flush, mount, queryTestId } from "./support/render";
import type { Mounted } from "./support/render";

/**
 * R1 + R2 — the first-time setup wizard becomes optional and dismissible.
 *
 * ## Why this file exists at all
 *
 * There was NO component/DOM test for `SetupWizard` anywhere in the repo before this:
 * `workspace-grid-gating.test.tsx` mocks it out, and the real-lane specs
 * (`bff-session.e2e.ts`, `github-connect.e2e.ts`) drive it through a browser and a real
 * stack, which is the wrong instrument for "does this button exist and what does it call".
 *
 * ## What is proven HERE rather than in the e2e
 *
 * The e2e proves the *user-visible outcome* against a real server (skip reaches step 3;
 * dismissal persists across a fresh browser context). What it cannot see is that dismissal
 * routes through `markOnboarded` **exactly once, from any step** — the property that makes
 * R2's "must NOT be shown it again" true rather than incidentally true because the user
 * happened to be on the Done step. That is a wiring claim, and this is where wiring claims
 * belong.
 *
 * The step COPY (pills, headings) is asserted only where R1 changes its meaning: GitHub
 * must stop being labelled REQUIRED, because that label is the whole of what R1 reverses.
 */

const useSession = vi.fn();
const markOnboarded = vi.fn();

vi.mock("@/app/_components/session-provider", () => ({
  useSession: () => useSession(),
  useOptionalSession: () => useSession(),
}));

// The three connect bodies pull in the entire OAuth/PKCE/credentials stack (popups,
// pollers, live-credit fetches). None of it is under test here, and mounting it would make
// this a different test — the skip affordance and the dismissal chrome are the WIZARD's
// own code, not theirs.
vi.mock("@/app/_components/connect/github-connect-body", () => ({
  default: () => <div data-testid="stub-github-body" />,
}));
vi.mock("@/app/_components/connect/openrouter-connect-body", () => ({
  default: () => <div data-testid="stub-openrouter-body" />,
}));
// The Gloo stub DOES render a skip, because the real form does (`gloo-credentials-form.tsx`
// owns the gloo step's `wizard-skip`, unlike the OpenRouter step where the wizard owns it).
// A stub that dropped it would make the Done step unreachable for a reason that is an
// artefact of the stub rather than of the code under test.
vi.mock("@/app/_components/connect/gloo-credentials-form", () => ({
  default: ({ onSkip }: { onSkip?: () => void }) => (
    <div data-testid="stub-gloo-form">
      <button type="button" data-testid="wizard-skip" onClick={onSkip}>
        {"Skip"}
      </button>
    </div>
  ),
}));

import SetupWizard from "@/app/_components/onboarding/setup-wizard";

const NONE_LINKED = {
  github: { provider: "github", status: "not-linked" },
  openrouter: { provider: "openrouter", status: "not-linked" },
  gloo: { provider: "gloo", status: "not-linked" },
};

function sessionValue() {
  return {
    mounted: true,
    isMock: false,
    firstSignIn: true,
    sessionResolved: true,
    serverUserId: "u1",
    session: {
      isAuthed: true,
      user: { name: "Grace Hopper", email: "grace@supagloo.com" },
      hasOnboarded: false,
    },
    connections: NONE_LINKED,
    connectProvider: vi.fn(),
    linkExistingGithub: vi.fn(),
    disconnectProvider: vi.fn(),
    glooError: null,
    clearGlooError: vi.fn(),
    disconnectErrors: {},
    clearDisconnectError: vi.fn(),
    connectErrors: { github: null, openrouter: null, gloo: null },
    clearConnectError: vi.fn(),
    markOnboarded,
    signOut: vi.fn(),
  };
}

let mounted: Mounted | null = null;

beforeEach(() => {
  useSession.mockReturnValue(sessionValue());
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.resetAllMocks();
});

/** `Modal` portals to `document.body`, so every query below is rooted there rather than at
 *  the mount container. */
async function openWizard(): Promise<ParentNode> {
  mounted = await mount(<SetupWizard />);
  await flush();
  return document.body;
}

const stepLabel = (root: ParentNode) =>
  (byTestId(root, "wizard-step-label").textContent ?? "").trim();

const countTestId = (root: ParentNode, id: string) =>
  root.querySelectorAll(`[data-testid="${id}"]`).length;

describe("R1 — connections are optional in the first-time setup wizard", () => {
  it("U-OW1: the GitHub step offers a skip that reaches OpenRouter with NOTHING connected", async () => {
    // The heart of R1. Today `canAdvance("github", …)` is false until GitHub connects and
    // `GithubStep` renders no escape at all, so this walk is impossible: the wizard — and
    // therefore the whole product — is unreachable for anyone the GitHub flow fails for.
    const root = await openWizard();

    await click(byTestId(root, "wizard-get-started"));
    expect(stepLabel(root)).toBe("STEP 2 OF 4 · CONNECT GITHUB");

    await click(byTestId(root, "wizard-skip-github"));
    expect(stepLabel(root)).toBe("STEP 3 OF 4 · OPENROUTER");
  });

  it("U-OW5: the GitHub skip uses a DISTINCT testid, not the duplicated `wizard-skip`", async () => {
    // `wizard-skip` already appears twice in the codebase — `setup-wizard.tsx` (the
    // OpenRouter step) and `gloo-credentials-form.tsx`. They never co-render today, so the
    // ambiguity is latent. Adding a third would make every `clickTestId("wizard-skip")` in
    // the real-lane specs a coin flip, and it would silently break the two existing
    // assertions (`E-B2`, `E-G1`) that count `wizard-skip` on this exact step.
    const root = await openWizard();
    await click(byTestId(root, "wizard-get-started"));

    expect(countTestId(root, "wizard-skip-github")).toBe(1);
    expect(countTestId(root, "wizard-skip")).toBe(0);
  });

  it("U-OW4: the welcome checklist no longer tags GitHub REQUIRED", async () => {
    // The label IS the reversal. TURN 11's subtitle says "GitHub required · OpenRouter +
    // Gloo optional"; R1 says none of them is. Leaving the red REQUIRED pill would tell the
    // user the opposite of what the wizard now does.
    const root = await openWizard();
    const text = byTestId(root, "setup-wizard").textContent ?? "";
    expect(text).toContain("GitHub");
    expect(text).not.toContain("REQUIRED");
  });
});

describe("R2 — dismissing the wizard counts as having completed it", () => {
  it("U-OW2: a dismissal control exists and persists onboarding exactly once", async () => {
    // `markOnboarded` is the ONE mutator that writes `User.onboardingCompletedAt`
    // server-side (→ `PATCH /v1/me/onboarding`). Today it is reachable only from
    // `<DoneStep onFinish={markOnboarded}>`, and the modal is `dismissible={false}` with
    // `onClose={() => {}}` — so there is no dismissal at all, let alone a persisting one.
    const root = await openWizard();

    await click(byTestId(root, "wizard-dismiss"));
    expect(markOnboarded).toHaveBeenCalledTimes(1);
  });

  it("U-OW3: dismissal persists from ANY step, not just Done", async () => {
    // R2's wording is "if the user dismisses the wizard on their first login". Wiring the
    // persistence to a particular step would make the guarantee depend on how far they got,
    // which is precisely the fragility R1 removed.
    const root = await openWizard();

    await click(byTestId(root, "wizard-get-started"));
    expect(stepLabel(root)).toBe("STEP 2 OF 4 · CONNECT GITHUB");
    await click(byTestId(root, "wizard-dismiss"));
    expect(markOnboarded).toHaveBeenCalledTimes(1);
  });

  it("U-OW6: Escape dismisses AND persists — the modal is no longer sealed", async () => {
    // `Modal` gates Escape/backdrop on `dismissible`, which the wizard passes as `false`
    // with the comment "you complete it or the GitHub gate holds". R1 deleted that gate, so
    // the seal has nothing left to hold. Escape must route through the SAME persistence as
    // the button, or a user who presses it is shown the wizard again forever.
    await openWizard();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flush();

    expect(markOnboarded).toHaveBeenCalledTimes(1);
  });

  it("U-OW8: the BACKDROP dismisses AND persists — the third route R2's wording names", async () => {
    // R2's wording covers dismissal, and `Modal` offers three routes to it: the ✕
    // (`U-OW2`/`U-OW3`), Escape (`U-OW6`) and the backdrop. All three run through the same
    // `onClose`, so this is a gap in PROOF rather than in behaviour — but the wizard passes
    // `dismissible`, which is what arms the backdrop, and nothing held that the third route
    // persists. A future `dismissible` narrowed to "Escape only" would leave a user who
    // clicked outside the panel shown this wizard again forever, with U-OW2/3/6 green.
    const root = await openWizard();

    // The panel stops propagation, so clicking the backdrop itself is the real gesture.
    await click(byTestId(root, "modal-backdrop"));

    expect(markOnboarded).toHaveBeenCalledTimes(1);
    // No assertion that the panel GOES AWAY: `SetupWizard` passes `open` as a literal
    // `true`, so nothing here unmounts it. The removal is the parent's — `firstSignIn`
    // flips once `markOnboarded` lands and `WorkspaceHome` stops rendering it. That
    // transition is held at the composition level (`workspace-guardrail-composition`),
    // where the session it depends on is actually driveable.
  });

  it("U-OW9: a click INSIDE the panel does not dismiss — the backdrop test is not a free pass", async () => {
    // The anti-vacuity control for U-OW8. Without it, a `Modal` that closed on any click
    // anywhere would satisfy U-OW8 while making the wizard impossible to use.
    const root = await openWizard();

    await click(byTestId(root, "setup-wizard"));

    expect(markOnboarded).not.toHaveBeenCalled();
    // Deliberately no `panel is still there` assertion — see U-OW8: it never leaves in this
    // harness, so it would read as a check while being unconditionally true.
  });

  it("U-OW7: the Done step's Finish still persists — R2 adds a path, it does not move one", async () => {
    // The regression guard. `wizard-finish` is what `E-B2` clicks and what every existing
    // onboarding assertion depends on.
    const root = await openWizard();
    await click(byTestId(root, "wizard-get-started"));
    await click(byTestId(root, "wizard-skip-github"));
    await click(byTestId(root, "wizard-skip")); // openrouter
    await click(byTestId(root, "wizard-skip")); // gloo → done

    expect(queryTestId(root, "wizard-step-label")).toBeNull(); // Done carries no ordinal
    await click(byTestId(root, "wizard-finish"));
    expect(markOnboarded).toHaveBeenCalledTimes(1);
  });
});
