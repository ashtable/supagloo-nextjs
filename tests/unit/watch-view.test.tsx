// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { byTestId, click, flush, mount, press, queryTestId } from "./support/render";
import type {
  GalleryItemDetailDto,
  GalleryMakingOf,
} from "@/lib/api/contracts";

/**
 * Turn 16a (slice C6) — the WATCH ISLAND's view logic, driven through the real
 * component.
 *
 * Deliberately THIN. `tests/e2e/gallery-watch.e2e.ts` drives the page against real
 * seeded rows, a real presign and a real mp4; re-asserting any of that here would be
 * duplication. What is here is exactly the set of claims a Stagehand run CANNOT make:
 *
 *  - the SSR/hydration contract (U-WV1), which is about the first HTML byte;
 *  - the two data shapes no e2e fixture has — a null item (U-WV2) and a POPULATED
 *    making-of snapshot (U-WV3/U-WV4/U-WV7). The snapshot is written by the api at
 *    PUBLISH time and the gallery seed helper inserts rows directly, so every e2e
 *    fixture carries `makingOf: null`;
 *  - the presign re-sign, which only happens after a `<video>` error or two minutes of
 *    watching (U-WV5);
 *  - the exact-vs-abbreviated upvote format (U-WV6), which no fixture can exhibit — a
 *    fixture's count is backed by real `GalleryUpvote` rows over 8 seeded users, and
 *    "8" renders identically under both rules.
 */

const { fetchGalleryItem, fetchStreamUrl, sendUpvote, removeUpvote } = vi.hoisted(
  () => ({
    fetchGalleryItem: vi.fn(),
    fetchStreamUrl: vi.fn(),
    sendUpvote: vi.fn(),
    removeUpvote: vi.fn(),
  }),
);

vi.mock("@/lib/gallery/gallery-data", () => ({
  fetchGalleryItem,
  fetchStreamUrl,
  sendUpvote,
  removeUpvote,
}));

// The real provider drags in `@youversion/platform-react-ui` and a live cookie probe.
// The island reads exactly one field off it.
const authed = { isAuthed: true };
vi.mock("@/app/_components/session-provider", () => ({
  useSession: () => ({ mounted: true, session: authed }),
}));

// `signin-prompt` → `sign-in-button` calls `useYVAuth()`, which throws outside a
// `<YouVersionAuthProvider>`. The prompt is in the tree but is not what these tests are
// about, so the hook gets the one method that component reads.
vi.mock("@youversion/platform-react-ui", () => ({
  useYVAuth: () => ({ signIn: () => {} }),
}));

import WatchView from "@/app/_components/gallery/watch-view";

function makingOf(overrides: Partial<GalleryMakingOf> = {}): GalleryMakingOf {
  return {
    version: 1,
    capturedAt: "2026-07-20T10:00:00.000Z",
    scriptureText:
      "In the beginning God created the heaven and the earth. And God said, Let there be light: and there was light.",
    narratorVoiceLabel: "Dramatic baritone",
    musicStyle: "Orchestral",
    captionsOn: true,
    scenes: [
      { index: 1, name: "Void", durationSeconds: 7 },
      { index: 2, name: "Deep", durationSeconds: 8 },
      { index: 3, name: "Spirit", durationSeconds: 8 },
      { index: 4, name: "Light", durationSeconds: 9 },
    ],
    ...overrides,
  };
}

function item(
  overrides: Partial<GalleryItemDetailDto> = {},
): GalleryItemDetailDto {
  return {
    id: "gal_1",
    renderJobId: "rj_1",
    projectId: "prj_1",
    title: "Let There Be Light",
    description: "",
    scriptureReference: "Genesis 1:1–4",
    scriptureBook: "GEN",
    translation: "KJV",
    durationSeconds: 32,
    visibility: "public",
    publishedAt: "2026-07-20T10:00:00.000Z",
    upvoteCount: 2411,
    thumbnailUrl: null,
    rank: null,
    viewerHasUpvoted: false,
    owner: { displayName: "Mary Kanu", avatarInitials: "MK", publicVideoCount: 14 },
    makingOf: null,
    ...overrides,
  };
}

const stream = (url: string) => ({
  url,
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
});

/** Mounted through a helper and torn down in `afterEach`, never at the end of a test
 *  body: a failing test would otherwise leave a live island writing into these shared
 *  module mocks (the lesson `gallery-browser.test.tsx` records). */
let live: { unmount: () => void } | null = null;

async function open(itemId = "gal_1"): Promise<HTMLElement> {
  const m = await mount(<WatchView itemId={itemId} />);
  live = m;
  await flush();
  return m.container;
}

beforeEach(() => {
  // `resetAllMocks`, NOT `clearAllMocks`: clearing wipes the call log but LEAVES the
  // `…Once` queue, so one unconsumed `…Once` silently answers the next test's first
  // request.
  vi.resetAllMocks();
  authed.isAuthed = true;
  fetchStreamUrl.mockResolvedValue(stream("https://s3.example/one?X-Amz-Signature=a"));
});

afterEach(() => {
  live?.unmount();
  live = null;
});

describe("U-WV1: the island is mount-gated", () => {
  it("server-renders NOTHING carrying data-testid=\"gallery-watch\"", () => {
    // The whole of row 68's rule: a testid a Server Component emits is in the FIRST
    // HTML BYTE, so waiting on it proves the HTML arrived and nothing about React
    // having hydrated. This is that claim at the cheapest possible layer — before any
    // browser is involved.
    const html = renderToStaticMarkup(<WatchView itemId="gal_1" />);
    expect(html).not.toContain('data-testid="gallery-watch"');
  });

  it("renders it once mounted", async () => {
    fetchGalleryItem.mockResolvedValue(item());
    const container = await open();
    expect(queryTestId(container, "gallery-watch")).not.toBeNull();
  });
});

describe("U-WV2: a missing item is a not-found state, never a blank page", () => {
  it("renders the not-found copy and no player when fetchGalleryItem resolves null", async () => {
    fetchGalleryItem.mockResolvedValue(null);
    const container = await open("nope");

    const notFound = byTestId(container, "gallery-watch-notfound");
    expect(notFound.textContent).toContain("We couldn't find that video.");
    expect(queryTestId(container, "gallery-watch-video")).toBeNull();
    expect(queryTestId(container, "gallery-watch-title")).toBeNull();
    // A dead end with no way out is the failure mode this state exists to avoid.
    expect(notFound.textContent).toContain("‹ Gallery");
    // And nothing was signed for an item that does not exist.
    expect(fetchStreamUrl).not.toHaveBeenCalled();
  });
});

describe("U-WV3: an item with NO making-of snapshot is complete without those sections", () => {
  it("renders title, player and creator, and OMITS scripture + how-it-was-made", async () => {
    fetchGalleryItem.mockResolvedValue(item({ makingOf: null }));
    const container = await open();

    expect(byTestId(container, "gallery-watch-title").textContent).toBe(
      "Let There Be Light",
    );
    expect(queryTestId(container, "gallery-watch-video")).not.toBeNull();
    expect(byTestId(container, "gallery-watch-creator-name").textContent).toBe(
      "Mary Kanu",
    );
    // `displayName · N public videos · shared X ago` — and no fabricated `@handle`
    // (D1: `User` has no handle column, and the api's own DTO records the gap).
    const meta = byTestId(container, "gallery-watch-creator-meta").textContent ?? "";
    expect(meta).toContain("14 public videos");
    expect(meta).not.toContain("@");

    expect(queryTestId(container, "gallery-watch-scripture")).toBeNull();
    expect(queryTestId(container, "gallery-watch-madeof")).toBeNull();
  });
});

describe("U-WV4: chips are conditional on their backing field", () => {
  it("renders exactly the chips that have a value, and never a visual-style chip", async () => {
    // A music style, NO narrator voice, captions off: exactly one chip must appear.
    fetchGalleryItem.mockResolvedValue(
      item({
        makingOf: makingOf({
          narratorVoiceLabel: null,
          musicStyle: "Orchestral",
          captionsOn: false,
        }),
      }),
    );
    const container = await open();

    const chips = container.querySelectorAll('[data-testid^="gallery-watch-chip-"]');
    expect(Array.from(chips).map((c) => c.textContent)).toEqual(["🎻 Orchestral"]);

    // D5: `🎬 Cosmic visuals` has NO backing field anywhere in the product — the
    // manifest carries only per-scene `visualPrompt`. There must be no code path that
    // can emit it, which is what this asserts about the WHOLE rendered tree.
    expect(container.textContent).not.toContain("Cosmic visuals");
    expect(queryTestId(container, "gallery-watch-chip-visual")).toBeNull();
  });

  it("renders all three when all three are present", async () => {
    fetchGalleryItem.mockResolvedValue(item({ makingOf: makingOf() }));
    const container = await open();

    const chips = Array.from(
      container.querySelectorAll('[data-testid^="gallery-watch-chip-"]'),
    ).map((c) => c.textContent);
    expect(chips).toEqual(["🔊 Dramatic baritone", "🎻 Orchestral", "✎ Captions on"]);
    expect(byTestId(container, "gallery-watch-scripture").textContent).toContain(
      "In the beginning God created",
    );
  });
});

describe("U-WV5: the presigned stream URL is re-signed on a player error", () => {
  it("re-signs exactly once, swaps the src, and restores currentTime", async () => {
    fetchGalleryItem.mockResolvedValue(item());
    fetchStreamUrl
      .mockResolvedValueOnce(stream("https://s3.example/one?X-Amz-Signature=a"))
      .mockResolvedValueOnce(stream("https://s3.example/two?X-Amz-Signature=b"));

    const container = await open();
    const video = byTestId(container, "gallery-watch-video") as HTMLVideoElement;
    expect(fetchStreamUrl).toHaveBeenCalledTimes(1);
    expect(video.getAttribute("src")).toBe("https://s3.example/one?X-Amz-Signature=a");

    // The viewer is 7 seconds in when the 120s presign dies under them.
    video.currentTime = 7;
    await act(async () => {
      video.dispatchEvent(new Event("error"));
    });
    await flush();

    expect(fetchStreamUrl).toHaveBeenCalledTimes(2);
    const swapped = byTestId(container, "gallery-watch-video") as HTMLVideoElement;
    expect(swapped.getAttribute("src")).toBe("https://s3.example/two?X-Amz-Signature=b");

    // The restore lands on `loadedmetadata` — seeking before the new source knows its
    // duration is a no-op in every real browser.
    swapped.currentTime = 0;
    await act(async () => {
      swapped.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(swapped.currentTime).toBe(7);
  });

  it("does NOT loop: a second error on the re-signed URL becomes the error state", async () => {
    // An object that is genuinely missing errors forever. Without this guard the island
    // would hammer the presign endpoint for as long as the tab is open.
    fetchGalleryItem.mockResolvedValue(item());
    fetchStreamUrl
      .mockResolvedValueOnce(stream("https://s3.example/one?X-Amz-Signature=a"))
      .mockResolvedValueOnce(stream("https://s3.example/two?X-Amz-Signature=b"));

    const container = await open();
    const video = byTestId(container, "gallery-watch-video") as HTMLVideoElement;
    await act(async () => video.dispatchEvent(new Event("error")));
    await flush();
    expect(fetchStreamUrl).toHaveBeenCalledTimes(2);

    const swapped = byTestId(container, "gallery-watch-video") as HTMLVideoElement;
    await act(async () => swapped.dispatchEvent(new Event("error")));
    await flush();

    expect(fetchStreamUrl).toHaveBeenCalledTimes(2);
    const failed = byTestId(container, "gallery-watch-player-error");
    expect(failed.textContent).toContain("That video didn't load.");

    // The way out re-signs — an error state with no way out is a dead end.
    fetchStreamUrl.mockResolvedValueOnce(
      stream("https://s3.example/three?X-Amz-Signature=c"),
    );
    await click(byTestId(container, "gallery-watch-player-retry"));
    await flush();
    expect(fetchStreamUrl).toHaveBeenCalledTimes(3);
    expect(queryTestId(container, "gallery-watch-player-error")).toBeNull();
  });
});

describe("U-WV6: the watch page's upvote count is EXACT, not abbreviated", () => {
  it("renders 2,412 where a card would render 2.4k", async () => {
    fetchGalleryItem.mockResolvedValue(item({ upvoteCount: 2412 }));
    const container = await open();
    expect(byTestId(container, "gallery-upvote-count-gal_1").textContent).toBe("2,412");
  });

  it("signed out, a vote opens the sign-in prompt and moves nothing", async () => {
    authed.isAuthed = false;
    fetchGalleryItem.mockResolvedValue(item({ upvoteCount: 2412 }));
    const container = await open();

    await click(byTestId(container, "gallery-upvote-gal_1"));
    await flush();

    expect(sendUpvote).not.toHaveBeenCalled();
    // The shared `Modal` portals to `document.body`, so the prompt is never inside the
    // island's own container.
    expect(queryTestId(document, "gallery-signin-prompt")).not.toBeNull();
    expect(byTestId(container, "gallery-upvote-count-gal_1").textContent).toBe("2,412");
    expect(
      byTestId(container, "gallery-upvote-gal_1").getAttribute("data-voted"),
    ).toBe("false");
  });

  it("signed in, a vote adopts the server's count WITHOUT blanking the detail-only fields", async () => {
    // The upvote routes answer with the CARD dto — `makingOf` and
    // `owner.publicVideoCount` are not on it. This mock is that exact shape, cast at the
    // boundary, because the whole point of the assertion is what happens when the
    // response is NARROWER than the item on screen: spreading it would silently delete
    // the HOW IT WAS MADE section and the creator's video count on every vote.
    const detail = item({ upvoteCount: 2411, makingOf: makingOf() });
    const card: Record<string, unknown> = { ...detail, upvoteCount: 2412, viewerHasUpvoted: true };
    delete card.makingOf;
    card.owner = {
      displayName: detail.owner.displayName,
      avatarInitials: detail.owner.avatarInitials,
    };
    fetchGalleryItem.mockResolvedValue(detail);
    sendUpvote.mockResolvedValue(card);
    const container = await open();
    expect(queryTestId(container, "gallery-watch-madeof")).not.toBeNull();

    await click(byTestId(container, "gallery-upvote-gal_1"));
    await flush();

    expect(sendUpvote).toHaveBeenCalledWith("gal_1");
    expect(byTestId(container, "gallery-upvote-count-gal_1").textContent).toBe("2,412");
    expect(
      byTestId(container, "gallery-upvote-gal_1").getAttribute("data-voted"),
    ).toBe("true");

    // The two fields the response does not carry are still on screen.
    expect(queryTestId(container, "gallery-watch-madeof")).not.toBeNull();
    expect(byTestId(container, "gallery-watch-creator-meta").textContent).toContain(
      "14 public videos",
    );
  });
});

describe("U-WV7: the scene grid prints the design's tile format", () => {
  it("renders one tile per scene as 'NN · Name' + a one-decimal duration", async () => {
    fetchGalleryItem.mockResolvedValue(item({ makingOf: makingOf() }));
    const container = await open();

    const tiles = Array.from(
      container.querySelectorAll('[data-testid^="gallery-watch-scene-"]'),
    );
    expect(tiles.length).toBe(4);
    expect(byTestId(container, "gallery-watch-scene-1").textContent).toContain(
      "01 · Void",
    );
    expect(byTestId(container, "gallery-watch-scene-1").textContent).toContain("7.0s");
    expect(byTestId(container, "gallery-watch-scene-4").textContent).toContain(
      "04 · Light",
    );
    expect(byTestId(container, "gallery-watch-scene-4").textContent).toContain("9.0s");
  });

  it("renders a 7-scene item without wrapping the gradient ramp backwards", async () => {
    // The design draws four scenes and says nothing about any other count (A9).
    // `scene-poster.ts` STRETCHES the ramp; this asserts the component actually uses it
    // — first tile darkest, last tile brightest, at a count the design never drew.
    fetchGalleryItem.mockResolvedValue(
      item({
        makingOf: makingOf({
          scenes: Array.from({ length: 7 }, (_, i) => ({
            index: i + 1,
            name: `Scene ${i + 1}`,
            durationSeconds: 4.5,
          })),
        }),
      }),
    );
    const container = await open();

    // jsdom normalises hex to `rgb()` in `style.background`, so the ramp's endpoints
    // are asserted in the form the DOM actually reports: `#2a1a2e` and `#ffe8a8`.
    const first = byTestId(container, "gallery-watch-poster-1");
    const last = byTestId(container, "gallery-watch-poster-7");
    expect(first.style.background).toContain("rgb(42, 26, 46)");
    expect(last.style.background).toContain("rgb(255, 232, 168)");
    expect(first.style.background).not.toBe(last.style.background);
  });
});

/**
 * U-WV8 — THE SCRUB TRACK IS A REAL SLIDER.
 *
 * `role="slider"` + `tabIndex={0}` are a contract with assistive tech and with anyone
 * who does not use a mouse: this control is focusable, and a slider moves with the
 * arrow keys. The component shipped with a click handler and NOTHING else, so the role
 * announced a seek control that could not be seeked. That is worse than an unlabelled
 * div — it is a promise the DOM makes on the component's behalf and the component
 * breaks.
 *
 * Unit-lane rather than e2e for the same reason U-WV5 is: it is about what a key press
 * does to `video.currentTime`, which needs a `<video>` whose duration is known, and the
 * one-second fixture mp4 makes every offset in a real run round to the same number.
 * `gallery-watch.e2e.ts` E-GW4b still proves a real key from a real keyboard reaches
 * it; this proves the map.
 */
describe("U-WV8: the scrub track is operable from the keyboard", () => {
  /** Mount, load metadata, and hand back the element + its scrub track. */
  async function player(durationSeconds = 32) {
    fetchGalleryItem.mockResolvedValue(item());
    const container = await open();
    const video = byTestId(container, "gallery-watch-video") as HTMLVideoElement;
    // jsdom reports `duration: NaN` forever — it has no media pipeline — so the number
    // the component reads is defined here, exactly as a loaded source would report it.
    Object.defineProperty(video, "duration", {
      value: durationSeconds,
      configurable: true,
    });
    await act(async () => {
      video.dispatchEvent(new Event("loadedmetadata"));
    });
    return { container, video, scrub: byTestId(container, "gallery-watch-scrub") };
  }

  it("declares itself focusable and a slider", async () => {
    const { scrub } = await player();
    expect(scrub.getAttribute("role")).toBe("slider");
    expect(scrub.getAttribute("tabindex")).toBe("0");
  });

  it("seeks with the arrows, PageUp/PageDown, Home and End", async () => {
    const { video, scrub } = await player(32);

    await press(scrub, "ArrowRight");
    expect(video.currentTime).toBe(5);
    await press(scrub, "ArrowRight");
    expect(video.currentTime).toBe(10);
    await press(scrub, "ArrowLeft");
    expect(video.currentTime).toBe(5);

    await press(scrub, "PageUp");
    expect(video.currentTime).toBe(15);
    await press(scrub, "PageDown");
    expect(video.currentTime).toBe(5);

    await press(scrub, "End");
    expect(video.currentTime).toBe(32);
    await press(scrub, "Home");
    expect(video.currentTime).toBe(0);
  });

  it("moves the fill it draws, not just the element underneath", async () => {
    // The transport has to agree with the media element, or a keyboard user seeks
    // blind: the number moved but the only visible feedback did not.
    const { container, scrub } = await player(32);
    await press(scrub, "ArrowRight");
    await flush();
    expect(byTestId(container, "gallery-watch-scrub-fill").style.width).toBe(
      `${(5 / 32) * 100}%`,
    );
    expect(byTestId(container, "gallery-watch-timecode").textContent).toBe(
      "0:05 / 0:32",
    );
  });

  it("announces the position as a TIME, not as a bare percentage", async () => {
    // `aria-valuenow="16"` read aloud is "16" — of what? `aria-valuetext` is the whole
    // reason a screen-reader user knows where in the video they just landed.
    const { scrub } = await player(32);
    await press(scrub, "ArrowRight");
    await flush();
    expect(scrub.getAttribute("aria-valuetext")).toBe("0:05 / 0:32");
    expect(scrub.getAttribute("aria-valuenow")).toBe("16");
  });

  it("claims the keys it handles and leaves every other key alone", async () => {
    const { video, scrub } = await player(32);

    const handled = await press(scrub, "ArrowRight");
    expect(handled.defaultPrevented).toBe(true);

    // Tab must still move focus, Escape must still reach whatever is listening, and
    // the page must still scroll. A slider that swallows them is a keyboard trap.
    for (const key of ["Tab", "Escape", "Enter", "a"]) {
      const event = await press(scrub, key);
      expect(event.defaultPrevented, key).toBe(false);
    }
    expect(video.currentTime).toBe(5);
  });

  it("does nothing at all before the duration is known", async () => {
    // `duration` is NaN until `loadedmetadata`. Seeking to 0 here would silently rewind
    // a viewer who pressed → during the first moments of playback.
    fetchGalleryItem.mockResolvedValue(item());
    const container = await open();
    const video = byTestId(container, "gallery-watch-video") as HTMLVideoElement;
    const scrub = byTestId(container, "gallery-watch-scrub");

    const event = await press(scrub, "ArrowRight");
    expect(event.defaultPrevented).toBe(false);
    expect(video.currentTime).toBe(0);
  });
});

/**
 * U-WV9 — THE AGE-BASED RE-SIGN IS BOUNDED.
 *
 * `sign()`'s failure branch sets `playerFailed` and returns, leaving the stream state
 * exactly as it was. The 5-second age check then reads that untouched state, finds it
 * still older than the safety margin, and asks again. And again — twelve requests a
 * minute, for as long as the tab is open, at a BFF that is by definition already
 * failing. A viewer who walks away from a watch page leaves a client hammering it.
 *
 * Fake timers rather than a real wait: the first re-sign is due ~105 s in, and the
 * claim is about what happens over the minutes after that. `Try again` remains the
 * deliberate retry and is asserted here too — bounding the automatic loop must not
 * cost the user their way out.
 */
describe("U-WV9: a failing age-based re-sign cannot poll forever", () => {
  it("stops after a bounded number of attempts, and Try again still works", async () => {
    vi.useFakeTimers();
    try {
      fetchGalleryItem.mockResolvedValue(item());
      fetchStreamUrl.mockResolvedValueOnce(
        stream("https://s3.example/one?X-Amz-Signature=a"),
      );

      const container = await open();
      expect(fetchStreamUrl).toHaveBeenCalledTimes(1);

      // From here the presign endpoint is down: every re-sign answers null.
      fetchStreamUrl.mockResolvedValue(null);

      // Past the safety margin (120 - 15 = 105 s), so the age check starts asking…
      await act(async () => {
        await vi.advanceTimersByTimeAsync(110_000);
      });
      expect(
        fetchStreamUrl.mock.calls.length,
        "the age check never re-signed at all",
      ).toBeGreaterThan(1);

      // …and now a full further minute — twelve more ticks of the 5 s poll — during
      // which a viewer is doing nothing at all. Whatever the budget is, it is spent by
      // the end of this.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      const settled = fetchStreamUrl.mock.calls.length;
      // A handful of attempts, not a poll rate. At 12 ticks a minute the unbounded
      // version reached 15 by this point and kept going.
      expect(
        settled,
        "the age check is polling rather than giving up — this is the unbounded loop",
      ).toBeLessThanOrEqual(5);

      // Three more minutes changes nothing: the bound is a bound, not a delay.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(180_000);
      });
      expect(fetchStreamUrl.mock.calls.length).toBe(settled);

      // The viewer's way out is untouched, and it re-arms the automatic check.
      const failed = byTestId(container, "gallery-watch-player-error");
      expect(failed.textContent).toContain("That video didn't load.");
      fetchStreamUrl.mockResolvedValueOnce(
        stream("https://s3.example/two?X-Amz-Signature=b"),
      );
      await click(byTestId(container, "gallery-watch-player-retry"));
      await flush();
      expect(fetchStreamUrl.mock.calls.length).toBe(settled + 1);
      expect(queryTestId(container, "gallery-watch-player-error")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
