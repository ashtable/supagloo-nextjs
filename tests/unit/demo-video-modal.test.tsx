// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, flush, mount, queryTestId } from "./support/render";
import type { Mounted } from "./support/render";

/**
 * The landing page's demo player — the behaviour a Stagehand spec cannot see, because it
 * lives in the gap between a click and a `<video>` that has a source.
 *
 * The URL is a 120-SECOND presign, and that TTL is what drives every claim here: it must
 * not be fetched before the click (it would usually be dead by the time it was used), it
 * must not be reused across opens, and an expiry mid-session surfaces as a MEDIA error
 * rather than an HTTP one, so it needs a re-sign that cannot become a loop.
 */

const fetchDemoStreamUrl = vi.hoisted(() => vi.fn());
// HeroLede reads the YouVersion auth context; the unit lane has no provider. Signed-out is
// the state the demo button is most interesting in — it is what an anonymous visitor sees.
vi.mock("@youversion/platform-react-ui", () => ({
  useYVAuth: () => ({ auth: { isAuthenticated: false }, userInfo: null }),
}));
vi.mock("@/lib/landing/demo-video", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchDemoStreamUrl,
}));

import DemoVideoModal from "@/app/_components/landing/demo-video-modal";

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.resetAllMocks();
});

const SIGNED = "https://t3.storageapi.dev/bucket/demos/genesis-1-demo.mp4?X-Amz-Signature=a";

async function open() {
  mounted = await mount(<DemoVideoModal onClose={() => {}} />);
  await flush();
  return mounted;
}

describe("DemoVideoModal", () => {
  it("costs no request until a visitor actually asks for the demo", async () => {
    // The modal is MOUNT-gated, so "closed" means "not rendered" — asserted through the
    // hero, which is the thing that decides. A presign fetched at page load would be dead
    // (120s) long before anyone clicked, and would bill a request for every visitor who
    // never watches.
    const HeroLede = (await import("@/app/_components/landing/hero-lede")).default;
    fetchDemoStreamUrl.mockResolvedValue(SIGNED);

    mounted = await mount(<HeroLede />);
    await flush();

    expect(fetchDemoStreamUrl).not.toHaveBeenCalled();
    expect(queryTestId(document.body, "demo-video-modal")).toBeNull();
  });

  it("fetches on open and plays the signed URL with native controls", async () => {
    fetchDemoStreamUrl.mockResolvedValue(SIGNED);
    await open();

    expect(fetchDemoStreamUrl).toHaveBeenCalledTimes(1);
    const video = byTestId(document.body, "demo-video") as HTMLVideoElement;
    expect(video.tagName).toBe("VIDEO");
    expect(video.getAttribute("src")).toBe(SIGNED);
    // Native controls are the point: fullscreen, volume and scrubbing come free and
    // behave correctly on iOS, where a custom transport fights the platform player.
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
  });

  it("shows an honest error state when no URL could be obtained", async () => {
    fetchDemoStreamUrl.mockResolvedValue(null);
    await open();

    const err = byTestId(document.body, "demo-video-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toMatch(/couldn't be loaded/i);
    expect(queryTestId(document.body, "demo-video")).toBeNull();
  });

  it("re-signs ONCE when the media errors, then gives up instead of looping", async () => {
    // An expired presign surfaces through the <video>, not through fetch. One retry covers
    // "left the modal open past the TTL, then hit play"; an unbounded retry would let a
    // genuinely missing object hammer the API from every visitor's browser.
    fetchDemoStreamUrl.mockResolvedValue(SIGNED);
    await open();
    expect(fetchDemoStreamUrl).toHaveBeenCalledTimes(1);

    const video = byTestId(document.body, "demo-video");
    video.dispatchEvent(new Event("error"));
    await flush();
    expect(fetchDemoStreamUrl).toHaveBeenCalledTimes(2); // re-signed

    byTestId(document.body, "demo-video").dispatchEvent(new Event("error"));
    await flush();
    expect(fetchDemoStreamUrl).toHaveBeenCalledTimes(2); // and no more
    expect(byTestId(document.body, "demo-video-error")).toBeTruthy();
  });
});

describe("hero demo buttons", () => {
  it("both the desktop and mobile buttons open the one player", async () => {
    // Two buttons exist only because two layouts do. Before this wiring BOTH were inert
    // `<button>`s with no onClick — the mobile one did not even have a testid.
    const HeroLede = (await import("@/app/_components/landing/hero-lede")).default;
    fetchDemoStreamUrl.mockResolvedValue(SIGNED);

    for (const testid of ["hero-demo", "hero-demo-mobile"]) {
      const m = await mount(<HeroLede />);
      await flush();
      expect(queryTestId(document.body, "demo-video-modal")).toBeNull();

      await click(byTestId(m.container, testid));
      await flush();
      // The modal portals to document.body, so it is not inside the container.
      expect(queryTestId(document.body, "demo-video-modal")).toBeTruthy();

      m.unmount();
    }
  });
});
