// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  byTestId,
  click,
  deferred,
  flush,
  mount,
  type as typeText,
} from "./support/render";
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

// `fetchStreamUrl` is NOT mocked here any more: slice C7 moved playback to
// `/gallery/[id]`, so the browser no longer signs anything. Listing it would be a mock
// for a call this component can no longer make.
const {
  fetchGalleryPage,
  sendUpvote,
  removeUpvote,
  fetchMyRenders,
  fetchMyProjects,
  publishRenderToGallery,
  push,
} = vi.hoisted(() => ({
  fetchGalleryPage: vi.fn(),
  sendUpvote: vi.fn(),
  removeUpvote: vi.fn(),
  fetchMyRenders: vi.fn(),
  fetchMyProjects: vi.fn(),
  publishRenderToGallery: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/gallery/gallery-data", () => ({
  fetchGalleryPage,
  sendUpvote,
  removeUpvote,
  // Slice C8: `＋ Share yours` now opens the real 16b dialog, which loads the caller's
  // renders + projects to build its PROJECT picker.
  fetchMyRenders,
  fetchMyProjects,
  publishRenderToGallery,
}));

vi.mock("@/lib/studio/studio-data", () => ({
  fetchVersions: vi.fn(async () => []),
  fetchManifest: vi.fn(async () => ({ ok: false, reason: "github_not_connected" })),
}));

// `useRouter` throws outside an app-router provider. The component genuinely navigates
// after a successful publish, so the router is stubbed rather than the call avoided —
// and the navigation itself is asserted below.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// The real provider drags in `@youversion/platform-react-ui` and a live cookie probe.
// `GalleryBrowser` reads exactly one field off it.
const authed = { isAuthed: true };
/** Whether the `GET /api/me` probe has landed. Mutable, so a test can hold the client
 *  in the window where "signed out" and "not asked yet" are the same `isAuthed`. */
const sessionState = { resolved: true };
vi.mock("@/app/_components/session-provider", () => ({
  useSession: () => ({ session: authed, sessionResolved: sessionState.resolved }),
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
  sessionState.resolved = true;
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

/**
 * Slice C8 — the header CTA's terminus.
 *
 * `＋ Share yours` used to open a 440px apology that linked to another page. It now opens
 * the real 16b dialog, and a successful publish leaves you looking at the thing you just
 * published — "Published" that leaves you where you were is indistinguishable from
 * nothing having happened.
 */
describe("GalleryBrowser — ＋ Share yours opens 16b and lands on the new item", () => {
  it("opens the publish dialog with a PROJECT picker, then routes to the item's watch page", async () => {
    fetchGalleryPage.mockResolvedValue(page([item({ id: "gal_1" })], null));
    fetchMyRenders.mockResolvedValue([
      {
        id: "rj_1",
        projectId: "prj_1",
        versionId: "ver_1",
        status: "completed" as const,
        framesDone: 300,
        framesTotal: 300,
        outputSpec: {
          width: 1080,
          height: 1920,
          fps: 30,
          aspectRatio: "9:16",
          codec: "h264",
        },
        outputAssetKey: "renders/rj_1/output.mp4",
        thumbnailAssetKey: "renders/rj_1/thumb.jpg",
        runInBackground: false,
        error: null,
        createdAt: "2026-07-20T10:00:00.000Z",
        startedAt: "2026-07-20T10:00:00.000Z",
        completedAt: "2026-07-20T10:05:00.000Z",
      },
    ]);
    fetchMyProjects.mockResolvedValue([]);
    publishRenderToGallery.mockResolvedValue({
      ok: true,
      item: item({ id: "gal_new", renderJobId: "rj_1" }),
    });

    const container = await open();
    await flush();

    await click(byTestId(container, "gallery-share-yours"));
    await flush();
    await flush();

    // The placeholder's testid must NOT come back with it.
    expect(document.body.querySelector('[data-testid="gallery-share-dialog"]')).toBeNull();
    const picker = byTestId(document.body, "publish-project") as HTMLSelectElement;
    expect(picker.value).toBe("rj_1");
    // Both joins missed (no projects, no versions), and the render is STILL offered —
    // a publishable video must never vanish because a naming call failed.
    expect(picker.selectedOptions[0].textContent).toContain("prj_1");

    await typeText(byTestId(document.body, "publish-title"), "In the beginning");
    await typeText(byTestId(document.body, "publish-passage"), "Genesis 1:1-5");
    await click(byTestId(document.body, "publish-consent"));
    await click(byTestId(document.body, "publish-submit"));
    await flush();

    expect(push).toHaveBeenCalledWith("/gallery/gal_new");
  });
});

/**
 * W8 — SIGNED OUT, `＋ Share yours` MUST NOT OPEN THE PUBLISH DIALOG.
 *
 * The CTA is in the public header, so an anonymous visitor sees it. It opened the 16b
 * dialog unconditionally, and the dialog's own first act is to load the caller's
 * renders and projects — two authenticated reads that answer 401 for a visitor who has
 * no session. What that visitor got was a dialog stating "No finished videos yet",
 * which is false (they may have many; they are simply not signed in) and which offers
 * no way to sign in from where they are stood.
 *
 * The rule underneath: a control the product shows to everyone must answer everyone.
 * Signing in is the next step, so the CTA has to be the thing that offers it.
 */
describe("GalleryBrowser — ＋ Share yours signed out", () => {
  it("opens the sign-in prompt, opens no publish dialog, and asks the API for nothing", async () => {
    authed.isAuthed = false;
    fetchGalleryPage.mockResolvedValue(page([item({ id: "gal_1" })], null));

    const container = await open();
    await flush();

    await click(byTestId(container, "gallery-share-yours"));
    await flush();
    await flush();

    // The prompt — which is where the sign-in button actually lives.
    const prompt = document.body.querySelector('[data-testid="gallery-signin-prompt"]');
    expect(prompt, "no sign-in path was offered").not.toBeNull();
    expect(document.body.querySelector('[data-testid="gallery-signin-button"]')).not.toBeNull();
    // …and it says what it is for. "SIGN IN TO UPVOTE" over a share action is the
    // wrong sentence in the right modal.
    expect(prompt!.textContent).toContain("SIGN IN TO SHARE");
    expect(prompt!.textContent).not.toContain("whose vote is whose");

    // The dialog never mounted, and the lie never rendered.
    expect(document.body.querySelector('[data-testid="publish-dialog"]')).toBeNull();
    expect(document.body.textContent).not.toContain("No finished videos yet");

    // THE 401s. The dialog's three loads are the whole reason gating it matters: an
    // anonymous visitor must not generate authenticated reads by clicking a public
    // button.
    expect(fetchMyRenders).not.toHaveBeenCalled();
    expect(fetchMyProjects).not.toHaveBeenCalled();
    expect(publishRenderToGallery).not.toHaveBeenCalled();
  });

  it("still opens the publish dialog once signed in — the gate is the session, not the button", async () => {
    // The other half of the claim: this must not be a CTA that stopped working.
    authed.isAuthed = true;
    fetchGalleryPage.mockResolvedValue(page([item({ id: "gal_1" })], null));
    fetchMyRenders.mockResolvedValue([]);
    fetchMyProjects.mockResolvedValue([]);

    const container = await open();
    await flush();

    await click(byTestId(container, "gallery-share-yours"));
    await flush();
    await flush();

    expect(document.body.querySelector('[data-testid="publish-dialog"]')).not.toBeNull();
    expect(fetchMyRenders).toHaveBeenCalledTimes(1);
  });
});

/**
 * The other half of W8, and the one an e2e run actually caught: `isAuthed` is `false`
 * BOTH for an anonymous visitor and for a signed-in one whose session probe has not
 * landed. A gate that decides at click time reads those as the same thing and sends a
 * signed-in user to the sign-in prompt — permanently, because the decision has been
 * made and nothing re-makes it.
 *
 * Not hypothetical: the first real-stack run of the gated CTA failed exactly here,
 * intermittently, because Stagehand clicks the moment the grid hydrates and `/api/me`
 * had not answered yet.
 */
describe("GalleryBrowser — ＋ Share yours pressed before the session is known", () => {
  it("waits for the answer, then opens the dialog for a session that resolves signed IN", async () => {
    sessionState.resolved = false;
    authed.isAuthed = false; // what an unresolved client reports about a signed-in user
    fetchGalleryPage.mockResolvedValue(page([item({ id: "gal_1" })], null));
    fetchMyRenders.mockResolvedValue([]);
    fetchMyProjects.mockResolvedValue([]);

    const container = await open();
    await flush();

    await click(byTestId(container, "gallery-share-yours"));
    await flush();

    // Nothing has been decided, so nothing wrong is on screen — no dialog, and NOT the
    // sign-in prompt, which would be the wrong answer to a signed-in visitor.
    expect(document.body.querySelector('[data-testid="publish-dialog"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="gallery-signin-prompt"]')).toBeNull();

    // …and now the probe lands.
    sessionState.resolved = true;
    authed.isAuthed = true;
    await click(byTestId(container, "gallery-sort-newest")); // any re-render
    await flush();
    await flush();

    // The click was not lost: the intent survived and resolved into the right surface.
    expect(document.body.querySelector('[data-testid="publish-dialog"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="gallery-signin-prompt"]')).toBeNull();
  });

  it("resolves into the sign-in prompt for a session that resolves signed OUT", async () => {
    sessionState.resolved = false;
    authed.isAuthed = false;
    fetchGalleryPage.mockResolvedValue(page([item({ id: "gal_1" })], null));

    const container = await open();
    await flush();
    await click(byTestId(container, "gallery-share-yours"));
    await flush();
    expect(document.body.querySelector('[data-testid="gallery-signin-prompt"]')).toBeNull();

    sessionState.resolved = true;
    await click(byTestId(container, "gallery-sort-newest"));
    await flush();

    const prompt = document.body.querySelector('[data-testid="gallery-signin-prompt"]');
    expect(prompt).not.toBeNull();
    expect(prompt!.textContent).toContain("SIGN IN TO SHARE");
    expect(fetchMyRenders).not.toHaveBeenCalled();
  });
});
