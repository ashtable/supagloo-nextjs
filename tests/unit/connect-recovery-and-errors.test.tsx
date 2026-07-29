// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, mount, queryTestId } from "./support/render";
import type { Mounted } from "./support/render";

import GithubConnectBody from "@/app/_components/connect/github-connect-body";
import OpenRouterConnectBody from "@/app/_components/connect/openrouter-connect-body";

/**
 * Two production dead ends, both found by driving the deployed app, both of the same
 * shape: a connect flow that could not finish, reported as an indefinite "Connecting…"
 * with no error and no remaining move.
 *
 * 1. GitHub, already-installed. GitHub redirects to an App's Setup URL only when an
 *    installation is CREATED, so an existing installation lands the user on the
 *    installation settings page and no callback ever fires. The "Finish connecting"
 *    recovery link exists for exactly this — but it was `disabled={pending}`, and
 *    `pending` is set by the very button that strands them. The one state the control
 *    had to work in was the one state it was removed from.
 *
 * 2. A browser-refused OAuth tab. `window.open` returns null rather than throwing, so
 *    the refusal was invisible and the flow polled for a callback no tab would send.
 *
 * These assertions are about REACHABILITY and FEEDBACK, not styling: can the user act,
 * and are they told what happened.
 */

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe("GithubConnectBody — the already-installed recovery link", () => {
  it("stays clickable while pending (the state it exists to rescue)", async () => {
    const onLinkExisting = vi.fn();
    mounted = await mount(
      <GithubConnectBody
        onAuthorize={() => {}}
        onLinkExisting={onLinkExisting}
        pending
      />,
    );

    // `click` dispatches a real DOM event, so a `disabled` attribute short-circuits it
    // exactly as it does for a user. That is the regression: this call counted zero.
    await click(byTestId(mounted.container, "connect-link-existing"));
    expect(onLinkExisting).toHaveBeenCalledTimes(1);
  });

  it("is clickable when idle too", async () => {
    const onLinkExisting = vi.fn();
    mounted = await mount(
      <GithubConnectBody
        onAuthorize={() => {}}
        onLinkExisting={onLinkExisting}
        pending={false}
      />,
    );
    await click(byTestId(mounted.container, "connect-link-existing"));
    expect(onLinkExisting).toHaveBeenCalledTimes(1);
  });

  it("still disables the PRIMARY authorize button while pending", async () => {
    // The fix must not turn into "nothing is gated any more" — a second install click
    // mid-flight is still meaningless. Only the escape hatch is exempt.
    const onAuthorize = vi.fn();
    mounted = await mount(
      <GithubConnectBody
        onAuthorize={onAuthorize}
        onLinkExisting={() => {}}
        pending
      />,
    );
    await click(byTestId(mounted.container, "connect-authorize"));
    expect(onAuthorize).not.toHaveBeenCalled();
  });
});

describe("connect error surfaces", () => {
  it("GitHub: renders the message when a connect could not start", async () => {
    mounted = await mount(
      <GithubConnectBody
        onAuthorize={() => {}}
        onLinkExisting={() => {}}
        pending={false}
        error="Your browser blocked the sign-in tab."
      />,
    );
    expect(byTestId(mounted.container, "connect-github-error").textContent).toContain(
      "blocked the sign-in tab",
    );
  });

  it("GitHub: renders nothing when there is no error", async () => {
    mounted = await mount(
      <GithubConnectBody
        onAuthorize={() => {}}
        onLinkExisting={() => {}}
        pending={false}
      />,
    );
    expect(queryTestId(mounted.container, "connect-github-error")).toBeNull();
  });

  it("OpenRouter: renders the message when a connect could not start", async () => {
    mounted = await mount(
      <OpenRouterConnectBody
        onConnect={() => {}}
        pending={false}
        error="Your browser blocked the sign-in tab."
      />,
    );
    const alert = byTestId(mounted.container, "connect-openrouter-error");
    expect(alert.textContent).toContain("blocked the sign-in tab");
    // Announced, not merely coloured — the user may not be watching this region.
    expect(alert.getAttribute("role")).toBe("alert");
  });

  it("OpenRouter: renders nothing when there is no error", async () => {
    mounted = await mount(
      <OpenRouterConnectBody onConnect={() => {}} pending={false} />,
    );
    expect(queryTestId(mounted.container, "connect-openrouter-error")).toBeNull();
  });
});
