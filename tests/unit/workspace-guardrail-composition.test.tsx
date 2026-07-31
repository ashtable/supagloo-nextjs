// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, flush, mount, queryTestId } from "./support/render";
import type { Mounted } from "./support/render";

/**
 * Revision R3 (2026-07-31 review) — `WorkspaceHome` COMPOSED, not its pieces.
 *
 * ## The defect
 *
 * `/?newproject=blank` is reachable from the landing page's "Blank canvas" card, from a
 * bookmark, from history and from a typed URL. A signed-out visitor who follows one, signs
 * in, and lands on the workspace arrives with the query intact — so the mount effect sets
 * `wizard = "new"` while `firstSignIn` is still true and `<SetupWizard/>` is on screen.
 * Two portalled dialogs stacked; and 6 s later R3's guardrail pushed `/profile#connections`,
 * where `profile-page.tsx` `router.replace("/")`s any `firstSignIn` user straight back —
 * returning them to a setup wizard reset to step 1.
 *
 * ## TWO doorways, which is why this file exists at all
 *
 * `evaluateConnectionGuardrail` verdicts ALLOWED while `connectionsResolved` is false (a
 * failed or pending read is not an answer about the user's data — `U-GR5` pins it), and
 * that flag is false until the real-mode connections fetch lands. So there are two distinct
 * ways a first-sign-in user gets a second dialog:
 *
 *   1. resolved + nothing connected → `blocked` → R3's MODAL renders over the setup wizard;
 *   2. NOT yet resolved            → `blocked` is false → the PROJECT WIZARD renders instead.
 *
 * A fix or a test that only knows about (1) leaves (2) shipping. Both are covered below.
 *
 * ## Why a NEW file rather than a case in `workspace-grid-gating.test.tsx`
 *
 * That file structurally cannot host this. It mocks `SetupWizard` to `null` — killing the
 * very element under observation — and its `useRouter` mock mints a fresh `vi.fn()` per
 * call, so `push` is unassertable. `vi.mock` is file-level and hoisted, so neither is
 * fixable with a second `describe`.
 *
 * ## What is stubbed, and the rule the stubs follow
 *
 * `SetupWizard` and the two project wizards are stubbed because they pull in the whole
 * connect stack, which is not what this file is about. They are stubbed to RENDER SOMETHING
 * with its own testid, never to `null`: a `null` stub makes "did not render" and "rendered"
 * indistinguishable, which is precisely how the sibling file lost the ability to see this.
 * `ConnectionsRequiredModal` is the REAL component — its timer is half of what is asserted.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const useSession = vi.fn();
vi.mock("@/app/_components/session-provider", () => ({
  useSession: () => useSession(),
  useOptionalSession: () => useSession(),
}));

const fetchProjectCards = vi.fn();
vi.mock("@/lib/workspace/projects-real", () => ({
  fetchProjectCards: (...args: unknown[]) => fetchProjectCards(...args),
}));

vi.mock("@/app/_components/onboarding/setup-wizard", () => ({
  default: () => <div data-testid="stub-setup-wizard" />,
}));
vi.mock("@/app/_components/project-wizard/new-project-wizard", () => ({
  default: () => <div data-testid="stub-new-project-wizard" />,
}));
vi.mock("@/app/_components/project-wizard/import-wizard", () => ({
  default: () => <div data-testid="stub-import-wizard" />,
}));
vi.mock("@/app/_components/workspace/workspace-nav", () => ({ default: () => null }));
vi.mock("@/app/_components/workspace/provider-strip", () => ({ default: () => null }));

import WorkspaceHome from "@/app/_components/workspace/workspace-home";
import { seedNoneLinked, seedAllLinked } from "@/lib/connections/connections-model";
import {
  GUARDRAIL_REDIRECT_MS,
  PROFILE_CONNECTIONS_URL,
} from "@/lib/workspace/connection-guardrail";

function sessionValue({
  firstSignIn,
  connectionsResolved,
  connected = false,
}: {
  firstSignIn: boolean;
  connectionsResolved: boolean;
  connected?: boolean;
}) {
  return {
    mounted: true,
    isMock: false,
    firstSignIn,
    sessionResolved: true,
    serverUserId: "u1",
    connections: connected ? seedAllLinked() : seedNoneLinked(),
    connectionsResolved,
    session: {
      isAuthed: true,
      user: { name: "Ash Srinivas", email: "ash@supagloo.com" },
      hasOnboarded: !firstSignIn,
    },
  };
}

/** The deep link, exactly as the landing page's "Blank canvas" card delivers it. The mount
 *  effect reads `window.location.search`, so this has to be a real URL change. */
function arriveAtBlankCanvasDeepLink(): void {
  window.history.replaceState(null, "", "/?newproject=blank");
}

let mounted: Mounted | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  fetchProjectCards.mockResolvedValue([]);
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("WorkspaceHome — the launcher family is inert during first-time onboarding (R3)", () => {
  it("U-WGC1: doorway 1 — a first-sign-in user at ?newproject=blank gets the setup wizard and NO guardrail redirect", async () => {
    // Resolved + nothing connected: the verdict IS `blocked`, so before the fix the modal
    // rendered on top of the setup wizard and armed a 6 s push to a route that bounces this
    // very user back to `/`.
    arriveAtBlankCanvasDeepLink();
    useSession.mockReturnValue(
      sessionValue({ firstSignIn: true, connectionsResolved: true }),
    );
    mounted = await mount(<WorkspaceHome />);
    await flush();

    expect(queryTestId(document.body, "stub-setup-wizard")).not.toBeNull();
    expect(queryTestId(document.body, "connections-required")).toBeNull();

    // The redirect is the harm, so the redirect is what is asserted — not just the absence
    // of a DOM node. Past the full window, with room to spare.
    vi.advanceTimersByTime(GUARDRAIL_REDIRECT_MS * 2);
    await flush();
    expect(push).not.toHaveBeenCalled();
  });

  it("U-WGC2: doorway 2 — with connections UNRESOLVED the project wizard is suppressed too", async () => {
    // The half-fix detector. `connectionsResolved: false` ⇒ verdict ALLOWED ⇒ `blocked` is
    // false ⇒ gating only R3's modal changes nothing here, and `<NewProjectWizard/>` renders
    // over the setup wizard instead. Both wizards need live GitHub data on their first step
    // and neither has a designed empty state.
    arriveAtBlankCanvasDeepLink();
    useSession.mockReturnValue(
      sessionValue({ firstSignIn: true, connectionsResolved: false }),
    );
    mounted = await mount(<WorkspaceHome />);
    await flush();

    expect(queryTestId(document.body, "stub-setup-wizard")).not.toBeNull();
    expect(queryTestId(document.body, "stub-new-project-wizard")).toBeNull();
    expect(queryTestId(document.body, "connections-required")).toBeNull();
  });

  it("U-WGC3: CONTROL — the same unconnected state WITHOUT firstSignIn does show the modal and does redirect", async () => {
    // Without this the suite cannot tell "gated correctly" from "gated always" — a
    // `launcherLive = false` constant would keep U-WGC1 and U-WGC2 green while deleting R3.
    arriveAtBlankCanvasDeepLink();
    useSession.mockReturnValue(
      sessionValue({ firstSignIn: false, connectionsResolved: true }),
    );
    mounted = await mount(<WorkspaceHome />);
    await flush();

    expect(queryTestId(document.body, "stub-setup-wizard")).toBeNull();
    expect(queryTestId(document.body, "connections-required")).not.toBeNull();

    vi.advanceTimersByTime(GUARDRAIL_REDIRECT_MS);
    await flush();
    expect(push).toHaveBeenCalledWith(PROFILE_CONNECTIONS_URL);
  });

  it("U-WGC4: D1 — the deep link's intent SURVIVES onboarding and opens the instant it ends", async () => {
    // THE DECISION, pinned so it is a decision rather than an accident.
    //
    // D1(a) "render-gate only" was chosen over D1(b) "also suppress the intent". `wizard`
    // stays `"new"` through onboarding, so the wizard the user actually asked for opens as
    // soon as it can be honoured. D1(b) would have left nothing to open — silently dropping
    // the deep link for exactly the users it exists for, the ones arriving from the landing
    // page for the first time.
    //
    // Driven through ONE mounted tree via `rerender`. A remount would re-run the mount
    // effect and re-set `wizard` from the URL, so it would pass identically under D1(b) —
    // it would prove the effect exists, never that the INTENT survived the transition.
    arriveAtBlankCanvasDeepLink();
    useSession.mockReturnValue(
      sessionValue({ firstSignIn: true, connectionsResolved: true, connected: true }),
    );
    mounted = await mount(<WorkspaceHome />);
    await flush();
    expect(queryTestId(document.body, "stub-new-project-wizard")).toBeNull();

    // Onboarding completes — the same transition the real `SetupWizard` drives by marking
    // the user onboarded, delivered the way React delivers it: the provider re-renders.
    useSession.mockReturnValue(
      sessionValue({ firstSignIn: false, connectionsResolved: true, connected: true }),
    );
    await mounted.rerender(<WorkspaceHome />);
    await flush();

    expect(queryTestId(document.body, "stub-setup-wizard")).toBeNull();
    expect(queryTestId(document.body, "stub-new-project-wizard")).not.toBeNull();
  });

  it("U-WGC5: D1's other edge — an unconnected user who finishes onboarding meets the modal, not silence", async () => {
    // The same transition as U-WGC4 but still unconnected: what surfaces is R3's modal with
    // its redirect now armed, and `/profile#connections` is reachable for them because
    // `firstSignIn` is false. Stated explicitly because it is the consequence of D1(a) that
    // a reader is most likely to be surprised by.
    arriveAtBlankCanvasDeepLink();
    useSession.mockReturnValue(
      sessionValue({ firstSignIn: true, connectionsResolved: true }),
    );
    mounted = await mount(<WorkspaceHome />);
    await flush();
    expect(queryTestId(document.body, "connections-required")).toBeNull();

    useSession.mockReturnValue(
      sessionValue({ firstSignIn: false, connectionsResolved: true }),
    );
    await mounted.rerender(<WorkspaceHome />);
    await flush();

    expect(queryTestId(document.body, "connections-required")).not.toBeNull();
    vi.advanceTimersByTime(GUARDRAIL_REDIRECT_MS);
    await flush();
    expect(push).toHaveBeenCalledWith(PROFILE_CONNECTIONS_URL);
  });

  it("U-WGC6: the import launcher is gated by the SAME predicate, not by a second copy of the rule", async () => {
    // D2. The header's "Import repo" button is a third way into the launcher family; a
    // per-element `!firstSignIn` is how you end up guarding two of three.
    arriveAtBlankCanvasDeepLink();
    useSession.mockReturnValue(
      sessionValue({ firstSignIn: true, connectionsResolved: false, connected: true }),
    );
    mounted = await mount(<WorkspaceHome />);
    await flush();

    await click(byTestId(document.body, "workspace-import-repo"));
    await flush();
    expect(queryTestId(document.body, "stub-import-wizard")).toBeNull();

    // Control on the same click: once onboarding is over, it opens.
    useSession.mockReturnValue(
      sessionValue({ firstSignIn: false, connectionsResolved: false, connected: true }),
    );
    await mounted.rerender(<WorkspaceHome />);
    await flush();
    expect(queryTestId(document.body, "stub-import-wizard")).not.toBeNull();
  });
});
