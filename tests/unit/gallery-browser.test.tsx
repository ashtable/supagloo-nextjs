// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byTestId, click, deferred, flush, mount } from "./support/render";
import type { GalleryItemDto, GalleryListResponse } from "@/lib/api/contracts";

/**
 * ROW 41 REVIEW — the two async-discipline defects in `gallery-browser.tsx`, driven
 * through the real component.
 *
 * Neither is reachable from the existing coverage, and that is the point:
 *  - `E-GU7` clicks "Load more" with nothing else in flight, so it never produces the
 *    superseded-run branch that skipped `setLoadingMore(false)`;
 *  - `E-GU4b` waits for `waitForCardCount` BEFORE switching sort, so page 2 has already
 *    landed by the time the ordering changes;
 *  - `gallery-model.test.ts` covers the reducer, which has no idea a request exists.
 *
 * Both defects are about WHEN a response lands relative to another interaction, so both
 * tests hold a request open by hand and interact underneath it.
 */

const { fetchGalleryPage, fetchStreamUrl, sendUpvote, removeUpvote } = vi.hoisted(() => ({
  fetchGalleryPage: vi.fn(),
  fetchStreamUrl: vi.fn(),
  sendUpvote: vi.fn(),
  removeUpvote: vi.fn(),
}));

vi.mock("@/lib/gallery/gallery-data", () => ({
  fetchGalleryPage,
  fetchStreamUrl,
  sendUpvote,
  removeUpvote,
}));

// The real provider drags in `@youversion/platform-react-ui` and a live cookie probe.
// `GalleryBrowser` reads exactly one field off it.
const authed = { isAuthed: true };
vi.mock("@/app/_components/session-provider", () => ({
  useSession: () => ({ session: authed }),
}));

// `signin-prompt` → `sign-in-button` calls `useYVAuth()`, which throws outside a
// `<YouVersionAuthProvider>`. The prompt is not what these tests are about, but it is in
// the tree, so the hook gets the one method that component reads.
vi.mock("@youversion/platform-react-ui", () => ({
  useYVAuth: () => ({ signIn: () => {} }),
}));

import GalleryBrowser from "@/app/_components/gallery/gallery-browser";

function item(overrides: Partial<GalleryItemDto> = {}): GalleryItemDto {
  return {
    id: "gal_1",
    renderJobId: "rj_1",
    projectId: "prj_1",
    title: "In the beginning",
    description: "",
    scriptureReference: "Genesis 1:1-5",
    scriptureBook: "GEN",
    translation: "BSB",
    durationSeconds: 42,
    visibility: "public",
    publishedAt: "2026-07-20T10:00:00.000Z",
    upvoteCount: 3,
    thumbnailUrl: null,
    rank: 2,
    viewerHasUpvoted: false,
    owner: { displayName: "Ada", avatarInitials: "A" },
    ...overrides,
  };
}

const page = (
  items: GalleryItemDto[],
  nextCursor: string | null,
): GalleryListResponse => ({ items, nextCursor });

/**
 * Mounted in a helper and torn down in `afterEach`, NOT at the end of each test body:
 * a test that fails leaves its component mounted, and a live `GalleryBrowser` with an
 * open request goes on writing into these shared module mocks. That turned one real
 * failure into three, two of which were pure noise.
 */
let live: { unmount: () => void } | null = null;

async function open(): Promise<HTMLElement> {
  const m = await mount(<GalleryBrowser />);
  live = m;
  return m.container;
}

beforeEach(() => {
  // `resetAllMocks`, NOT `clearAllMocks`: clearing wipes the call log but LEAVES the
  // `mockReturnValueOnce` queue, so one unconsumed `…Once` silently answers the next
  // test's first request. That turned one honest failure into three here.
  vi.resetAllMocks();
  authed.isAuthed = true;
});

afterEach(() => {
  live?.unmount();
  live = null;
});

describe("GalleryBrowser — load more, superseded mid-flight", () => {
  it("re-enables 'Load more' when a sort change supersedes the page-2 request", async () => {
    const pageTwo = deferred<GalleryListResponse | null>();

    fetchGalleryPage
      // page 1, popular
      .mockResolvedValueOnce(page([item({ id: "gal_1" })], "cursor-1"))
      // page 2, popular — held open
      .mockReturnValueOnce(pageTwo.promise)
      // page 1, newest (the sort change that supersedes page 2)
      .mockResolvedValueOnce(page([item({ id: "gal_9" })], "cursor-9"));

    const container = await open();
    await flush();

    const loadMore = byTestId(container, "gallery-load-more") as HTMLButtonElement;
    await click(loadMore);
    expect(loadMore.disabled).toBe(true); // the in-flight state is real

    // Switch ordering while page 2 is still open. This bumps `runRef`, so page 2's
    // continuation is now stale and must not splice popular rows into a newest listing.
    await click(byTestId(container, "gallery-sort-newest"));
    await flush();

    // …and now page 2 finally answers, into a run nobody is waiting for.
    pageTwo.resolve(page([item({ id: "gal_2" })], "cursor-2"));
    await flush();

    // The stale page must not have been appended…
    expect(container.querySelector('[data-testid="gallery-card-gal_2"]')).toBeNull();
    // …and the button must be usable again. Before the fix, the early return skipped
    // `setLoadingMore(false)` and "Load more" stayed disabled for the whole session.
    const after = byTestId(container, "gallery-load-more") as HTMLButtonElement;
    expect(after.disabled).toBe(false);
    expect(after.textContent).toBe("Load more");

    // Prove it is genuinely usable, not merely enabled-looking.
    fetchGalleryPage.mockResolvedValueOnce(page([item({ id: "gal_10" })], null));
    await click(after);
    await flush();
    expect(container.querySelector('[data-testid="gallery-card-gal_10"]')).not.toBeNull();

  });

  /**
   * Pins the invariant that makes the `finally` above SUFFICIENT — i.e. why
   * `loadingMore` needs no per-request token the way page 1 needs `runRef`.
   *
   * There is only ever ONE open page-2 request, because the same flag that the
   * superseded branch used to leak is also what disables the control and what
   * short-circuits the callback. So `finally` can never clear a NEWER request's flag:
   * a newer request cannot exist. Delete either guard and this stops being true.
   */
  it("cannot start a second page-2 request while the first is still open", async () => {
    const pageTwo = deferred<GalleryListResponse | null>();
    fetchGalleryPage
      .mockResolvedValueOnce(page([item({ id: "gal_1" })], "cursor-1"))
      .mockReturnValueOnce(pageTwo.promise);

    const container = await open();
    await flush();

    const loadMore = byTestId(container, "gallery-load-more") as HTMLButtonElement;
    await click(loadMore);
    expect(fetchGalleryPage).toHaveBeenCalledTimes(2);

    await click(loadMore);
    await click(loadMore);
    expect(fetchGalleryPage).toHaveBeenCalledTimes(2);

    pageTwo.resolve(page([item({ id: "gal_2" })], null));
    await flush();
    expect(container.querySelector('[data-testid="gallery-card-gal_2"]')).not.toBeNull();
    // `nextCursor: null` is genuinely exhausted, so the control hides itself.
    expect(container.querySelector('[data-testid="gallery-load-more"]')).toBeNull();
  });
});

describe("GalleryBrowser — double-clicked upvote", () => {
  it("does not fire a concurrent DELETE while the POST is still open", async () => {
    const vote = deferred<GalleryItemDto | null>();
    fetchGalleryPage.mockResolvedValueOnce(
      page([item({ id: "gal_1", upvoteCount: 3, viewerHasUpvoted: false })], null),
    );
    sendUpvote.mockReturnValueOnce(vote.promise);

    const container = await open();
    await flush();

    const pill = byTestId(container, "gallery-upvote-gal_1") as HTMLButtonElement;
    await click(pill);
    // The optimistic flip has already rendered, so an impatient second click reads the
    // pill as VOTED and asks to un-vote — a DELETE racing its own POST, with the API
    // free to answer them in either order.
    await click(pill);

    expect(sendUpvote).toHaveBeenCalledTimes(1);
    expect(removeUpvote).not.toHaveBeenCalled();
    expect(pill.disabled).toBe(true);

    vote.resolve(item({ id: "gal_1", upvoteCount: 4, viewerHasUpvoted: true, rank: null }));
    await flush();

    const settled = byTestId(container, "gallery-upvote-gal_1") as HTMLButtonElement;
    expect(settled.disabled).toBe(false);
    expect(byTestId(container, "gallery-upvote-count-gal_1").textContent).toBe("4");
    expect(settled.getAttribute("data-voted")).toBe("true");

    // Only now is a second vote legal, and it is the un-vote.
    removeUpvote.mockResolvedValueOnce(
      item({ id: "gal_1", upvoteCount: 3, viewerHasUpvoted: false, rank: null }),
    );
    await click(settled);
    await flush();
    expect(removeUpvote).toHaveBeenCalledTimes(1);
    expect(byTestId(container, "gallery-upvote-count-gal_1").textContent).toBe("3");

  });

  it("keeps the pill live on OTHER cards while one vote is in flight", async () => {
    const vote = deferred<GalleryItemDto | null>();
    fetchGalleryPage.mockResolvedValueOnce(
      page([item({ id: "gal_1" }), item({ id: "gal_2", rank: 3 })], null),
    );
    sendUpvote.mockReturnValueOnce(vote.promise).mockResolvedValueOnce(
      item({ id: "gal_2", upvoteCount: 4, viewerHasUpvoted: true, rank: null }),
    );

    const container = await open();
    await flush();

    await click(byTestId(container, "gallery-upvote-gal_1"));
    // The guard is PER ITEM, not a global lock: one slow request must not freeze the grid.
    await click(byTestId(container, "gallery-upvote-gal_2"));
    expect(sendUpvote).toHaveBeenCalledTimes(2);
    expect(sendUpvote).toHaveBeenNthCalledWith(1, "gal_1");
    expect(sendUpvote).toHaveBeenNthCalledWith(2, "gal_2");

    vote.resolve(item({ id: "gal_1", upvoteCount: 4, viewerHasUpvoted: true, rank: null }));
    await flush();
  });
});
