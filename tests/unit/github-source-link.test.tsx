// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "./support/render";
import GithubSourceLink, {
  SOURCE_REPO_URL,
} from "../../app/_components/github-source-link";

/**
 * The nav's source link — the control that replaced the inert "How it works".
 *
 * These pin the things a reader of the markup cannot check for themselves: that the
 * href is the real top-level repo, that the external-link hardening is present, and
 * that the star cell stays hidden at 0 (the case this repo is actually in, and the
 * one where showing a count would be worse than showing nothing).
 */
describe("GithubSourceLink", () => {
  it("U-GH1: points at the top-level public repo", async () => {
    const { container, unmount } = await mount(<GithubSourceLink />);
    const a = container.querySelector("a");

    expect(a?.getAttribute("href")).toBe("https://github.com/ashtable/supagloo");
    expect(SOURCE_REPO_URL).toBe("https://github.com/ashtable/supagloo");
    unmount();
  });

  it("U-GH2: opens in a new tab WITH the reverse-tabnabbing guard", async () => {
    // `target="_blank"` without `noopener` hands the opened page a live
    // `window.opener` handle back into this origin. The two travel together or
    // neither should ship.
    const { container, unmount } = await mount(<GithubSourceLink />);
    const a = container.querySelector("a");

    expect(a?.getAttribute("target")).toBe("_blank");
    const rel = a?.getAttribute("rel") ?? "";
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
    unmount();
  });

  it("U-GH3: renders no star cell when the count is absent or zero", async () => {
    // 0 is the live value for this repo. A `0` beside a GitHub mark reads as
    // anti-social-proof, so falsy must be indistinguishable from absent.
    for (const stars of [undefined, 0]) {
      const { container, unmount } = await mount(<GithubSourceLink stars={stars} />);
      expect(container.textContent).toBe("GitHub");
      unmount();
    }
  });

  it("U-GH4: renders a compact star count once there is one to show", async () => {
    const few = await mount(<GithubSourceLink stars={7} />);
    expect(few.container.textContent).toContain("7");
    few.unmount();

    const many = await mount(<GithubSourceLink stars={1240} />);
    expect(many.container.textContent).toContain("1.2k");
    many.unmount();
  });

  it("U-GH5: the menu variant is a real anchor, not a button", async () => {
    // The sheet row it replaced was a `<button>` with no handler. If this regressed
    // to a button the sheet would still close and still navigate nowhere — the exact
    // failure being fixed — so the element type is the assertion.
    const { container, unmount } = await mount(<GithubSourceLink variant="menu" />);
    const a = container.querySelector("a");

    expect(a).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(a?.getAttribute("href")).toBe(SOURCE_REPO_URL);
    expect(a?.getAttribute("role")).toBe("menuitem");
    unmount();
  });
});
