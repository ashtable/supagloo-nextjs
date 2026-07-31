// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, flush, mount, queryTestId } from "./support/render";
import type { Mounted } from "./support/render";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import ConnectionsRequiredModal from "@/app/_components/workspace/connections-required-modal";
import {
  GUARDRAIL_REDIRECT_MS,
  PROFILE_CONNECTIONS_URL,
} from "@/lib/workspace/connection-guardrail";

/**
 * R3's modal — NET-NEW. Nothing in wireframe turns 9–20 is a connection guardrail, so this
 * is composed from drawn precedent rather than transcribed:
 *
 *   · 11a step 1's three requirement rows (26px provider tile + name + em-dash gloss +
 *     status pill), with the static pill swapped for LIVE state;
 *   · 10a's "not linked" treatment for a missing one — red-tinted frame, `Link ▸` verb;
 *   · a GOLD warn tile, not red: this is a PRECONDITION, not 12b's failure;
 *   · 12a's static `Redirecting automatically…` caption — the only auto-redirect vocabulary
 *     the design owns. No countdown ring.
 *
 * It fires from the WORKSPACE, so it takes the light `--sg-*` chrome of 12a/14a/16b, never
 * 20b's studio dark.
 */

const BLOCKED_NOTHING = {
  kind: "blocked" as const,
  github: false,
  openrouter: false,
  gloo: false,
  needsGithub: true,
  needsModelProvider: true,
};

const BLOCKED_GITHUB_ONLY = {
  kind: "blocked" as const,
  github: true,
  openrouter: false,
  gloo: false,
  needsGithub: false,
  needsModelProvider: true,
};

let mounted: Mounted | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.resetAllMocks();
});

async function open(verdict = BLOCKED_NOTHING): Promise<ParentNode> {
  // `Modal` portals to `document.body`.
  mounted = await mount(
    <ConnectionsRequiredModal open verdict={verdict} onClose={() => {}} />,
  );
  await flush();
  return document.body;
}

describe("R3 — the connections-required modal", () => {
  it("U-CR1: renders one LIVE row per provider, and keeps a ✕", async () => {
    // Live state, not a static list: 11a step 1 draws fixed REQUIRED/OPTIONAL pills, but
    // this modal is shown BECAUSE something is missing, so the rows have to say which.
    const root = await open(BLOCKED_GITHUB_ONLY);

    expect(byTestId(root, "connections-required-row-github").dataset.connected).toBe(
      "true",
    );
    expect(byTestId(root, "connections-required-row-openrouter").dataset.connected).toBe(
      "false",
    );
    expect(byTestId(root, "connections-required-row-gloo").dataset.connected).toBe(
      "false",
    );

    // R3 allows dismissal — it just does not stop the redirect. The ✕ only renders inside
    // `Modal`'s titled header, so a missing `title` prop silently produces a modal with no
    // close button at all (the trap the first-time wizard hit).
    expect(queryTestId(root, "modal-close")).not.toBeNull();
  });

  it("U-CR5: the requirement list lives in the SCROLLING body, so the actions stay reachable", async () => {
    // `Modal` caps the panel at the viewport and scrolls its BODY. A tall block rendered
    // outside that region pushes the action row off-screen on a phone with no way to scroll
    // to it — the 16b publish dialog shipped exactly that bug.
    const root = await open();
    const body = byTestId(root, "connections-required-body");
    expect(body.contains(byTestId(root, "connections-required-row-github"))).toBe(true);
    expect(body.contains(byTestId(root, "connections-required-cta"))).toBe(true);
  });

  it("U-CR2: the primary CTA navigates to the profile connections section", async () => {
    const root = await open();
    await click(byTestId(root, "connections-required-cta"));
    expect(push).toHaveBeenCalledWith(PROFILE_CONNECTIONS_URL);
  });

  it("U-CR3: with NO interaction at all, it auto-navigates there", async () => {
    // R3, verbatim: "if they do not click it, they are auto-redirected there anyway."
    const root = await open();
    expect(push).not.toHaveBeenCalled();

    vi.advanceTimersByTime(GUARDRAIL_REDIRECT_MS - 1);
    expect(push).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await flush();
    expect(push).toHaveBeenCalledWith(PROFILE_CONNECTIONS_URL);
    expect(push).toHaveBeenCalledTimes(1);
    expect(byTestId(root, "connections-required")).toBeTruthy();
  });

  it("U-CR4: dismissing does NOT cancel the redirect", async () => {
    // Deliberate, and the requirement's own wording. The ✕ / "Not now" let the user read the
    // workspace behind the modal; they do not opt out of being taken where they must go.
    // Making dismissal cancel it would leave a user who clicked ✕ in exactly the state R3
    // was written to prevent — on the workspace, unable to create anything, with nothing
    // telling them why.
    const root = await open();
    await click(byTestId(root, "connections-required-dismiss"));

    vi.advanceTimersByTime(GUARDRAIL_REDIRECT_MS);
    await flush();
    expect(push).toHaveBeenCalledWith(PROFILE_CONNECTIONS_URL);
  });

  it("U-CR6: an UNMOUNTED modal never navigates — the timer is cleaned up", async () => {
    // The failure this catches: the user resolves the situation another way (or the verdict
    // flips once connections land), the modal unmounts, and 6 seconds later the app yanks
    // them to /profile from wherever they now are. `new-project-wizard`'s ready-card
    // redirect needed exactly this guard.
    await open();
    mounted?.unmount();
    mounted = null;

    vi.advanceTimersByTime(GUARDRAIL_REDIRECT_MS * 2);
    await flush();
    expect(push).not.toHaveBeenCalled();
  });

  it("U-CR7: states the automatic redirect in words, without inventing a countdown", async () => {
    // 12a's precedent is a STATIC caption; a live countdown is a control the design does not
    // own and would make the modal feel like a threat.
    const root = await open();
    const text = byTestId(root, "connections-required").textContent ?? "";
    expect(text).toContain("Redirecting automatically");
    expect(text).not.toMatch(/\b\d+\s*(s|sec|seconds)\b/i);
  });
});
