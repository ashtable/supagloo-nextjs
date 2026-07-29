// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byTestId, mount } from "./support/render";

/**
 * Feature 7, defect 2 — the project grid is unsynchronized with the session.
 *
 * `WorkspaceHome`'s grid effect was keyed `[mounted, isMock]`, so it fired the instant
 * the component mounted — which is the instant `session.isAuthed` flipped true, i.e.
 * BEFORE the sign-in exchange had minted the cookie. `fetchProjectCards` returns `[]` on
 * any failure (a 401 included), and nothing ever refetched, so the grid stayed empty for
 * the whole load.
 *
 * Compare the connections effect in `session-provider.tsx`, which IS gated on
 * `serverUser`. That single asymmetry is why the two reported symptoms healed on
 * different reloads: connections recovered on the first Cmd-R, the grid needed a second.
 *
 * The gate is deliberately `serverUserId`, NOT `sessionResolved`: `sessionResolved` is set
 * in a `finally` and so goes true even on the broken login load, when there is no cookie
 * at all. "We have finished asking" is not "there is a server session".
 */

const fetchProjectCards = vi.fn();
const useSession = vi.fn();

vi.mock("@/lib/workspace/projects-real", () => ({
  fetchProjectCards: (...args: unknown[]) => fetchProjectCards(...args),
}));
vi.mock("@/app/_components/session-provider", () => ({
  useSession: () => useSession(),
  useOptionalSession: () => useSession(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// The wizards and the setup overlay pull in the whole connect stack; none of them is
// under test here and mounting them would make this a different test.
vi.mock("@/app/_components/project-wizard/new-project-wizard", () => ({
  default: () => null,
}));
vi.mock("@/app/_components/project-wizard/import-wizard", () => ({
  default: () => null,
}));
vi.mock("@/app/_components/onboarding/setup-wizard", () => ({ default: () => null }));
vi.mock("@/app/_components/workspace/workspace-nav", () => ({ default: () => null }));
vi.mock("@/app/_components/workspace/provider-strip", () => ({ default: () => null }));

import WorkspaceHome from "@/app/_components/workspace/workspace-home";

const CARD = {
  id: "psalm-121",
  title: "Psalm 121",
  reference: "Psalm 121",
  lastOpened: "2026-07-29T00:00:00.000Z",
  repo: "ashtable/psalm-121",
  scenes: 4,
};

interface SessionShape {
  serverUserId: string | null;
}

function sessionValue({ serverUserId }: SessionShape) {
  return {
    mounted: true,
    isMock: false,
    firstSignIn: false,
    sessionResolved: true,
    serverUserId,
    session: {
      isAuthed: true,
      user: { name: "Ash Srinivas", email: "ash@supagloo.com" },
      hasOnboarded: true,
    },
  };
}

let mounted: {
  container: HTMLElement;
  rerender: (el: React.ReactElement) => Promise<void>;
  unmount: () => void;
} | null = null;

beforeEach(() => {
  vi.resetAllMocks();
  fetchProjectCards.mockResolvedValue([CARD]);
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe("WorkspaceHome — the grid waits for a real SERVER session", () => {
  it("U-A7: does NOT fetch while the sign-in exchange is still in flight", async () => {
    // The broken login load, exactly: `isAuthed` is already true (resolveSession branch 3
    // reports it from YouVersion auth alone) but no cookie exists yet.
    useSession.mockReturnValue(sessionValue({ serverUserId: null }));
    mounted = await mount(<WorkspaceHome />);
    expect(fetchProjectCards).not.toHaveBeenCalled();
  });

  it("U-A8: THE BUG — fetches once the server session arrives, with NO reload and no remount", async () => {
    // Driven through ONE mounted tree. Unmounting and mounting again would run the effect
    // unconditionally on the fresh mount, so it would pass identically with the broken
    // `[mounted, isMock]` deps — it would prove the effect exists, never that the
    // dependency array reacts to `serverUserId`. That is the exact shape of the bug this
    // test claims to hold, so the remount version could not see a recurrence.
    useSession.mockReturnValue(sessionValue({ serverUserId: null }));
    mounted = await mount(<WorkspaceHome />);
    expect(fetchProjectCards).not.toHaveBeenCalled();
    const before = byTestId(mounted.container, "workspace-home");

    // The exchange lands and `serverUser` resolves — the same transition that already
    // drives the connections effect, delivered the way React delivers it: the provider
    // re-renders its children.
    useSession.mockReturnValue(sessionValue({ serverUserId: "u1" }));
    await mounted.rerender(<WorkspaceHome />);

    expect(fetchProjectCards).toHaveBeenCalledTimes(1);
    // Same DOM node ⇒ the component was never unmounted, so the fetch came from the
    // dependency change and not from a fresh mount.
    expect(byTestId(mounted.container, "workspace-home")).toBe(before);
  });

  it("U-A9: a returning user with a cookie fetches immediately, exactly once", async () => {
    useSession.mockReturnValue(sessionValue({ serverUserId: "u1" }));
    mounted = await mount(<WorkspaceHome />);
    expect(fetchProjectCards).toHaveBeenCalledTimes(1);
  });

  it("U-A10: mock mode still fetches nothing — the pure-client lane keeps zero egress", async () => {
    useSession.mockReturnValue({
      ...sessionValue({ serverUserId: null }),
      isMock: true,
    });
    mounted = await mount(<WorkspaceHome />);
    expect(fetchProjectCards).not.toHaveBeenCalled();
  });

  it("U-A11: a switch of USER refetches in place — one account never shows another's grid", async () => {
    // Same reasoning as U-A8: keying on the ID rather than a boolean is only observable
    // across a re-render of the SAME tree. A remount here would pass under `[mounted,
    // isMock]` and under a `Boolean(serverUserId)` gate alike.
    useSession.mockReturnValue(sessionValue({ serverUserId: "u1" }));
    mounted = await mount(<WorkspaceHome />);
    expect(fetchProjectCards).toHaveBeenCalledTimes(1);
    const before = byTestId(mounted.container, "workspace-home");

    useSession.mockReturnValue(sessionValue({ serverUserId: "u2" }));
    await mounted.rerender(<WorkspaceHome />);

    expect(fetchProjectCards).toHaveBeenCalledTimes(2);
    expect(byTestId(mounted.container, "workspace-home")).toBe(before);
  });

  it("U-A12: an unrelated re-render does NOT refetch — the gate is the value, not the render", async () => {
    // Without this, `[mounted, isMock, serverUserId]` and a dep-less effect would both
    // satisfy U-A8/U-A11. This is the half that says the array is doing work.
    useSession.mockReturnValue(sessionValue({ serverUserId: "u1" }));
    mounted = await mount(<WorkspaceHome />);
    expect(fetchProjectCards).toHaveBeenCalledTimes(1);

    await mounted.rerender(<WorkspaceHome />);
    await mounted.rerender(<WorkspaceHome />);
    expect(fetchProjectCards).toHaveBeenCalledTimes(1);
  });
});
