// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byTestId, click, mount, queryTestId, type as typeInto } from "./support/render";
import type { GalleryItemDto, RenderJobDto } from "@/lib/api/contracts";

/**
 * ROW 41 REVIEW — the publish dialog's state must belong to the RENDER being published,
 * not to the page.
 *
 * `<PublishDialog>` is mounted unconditionally and gated only by `open` on the inner
 * `<Modal>`, so its `useState` initializers run once per page load. Nothing resets them
 * on close. The second "Share to gallery" therefore opened prefilled with the FIRST
 * render's title and scripture reference — and `scriptureReference` is both what the
 * server derives `scriptureBook` from and what renders verbatim on the public card, so
 * the accident is publishing B under A's reference.
 *
 * There is no coverage of this anywhere: `your-videos-model.test.ts` is pure mapping and
 * the row-41 e2e never publishes twice.
 *
 * The `<Modal>` portals to `document.body`, so every dialog query is rooted there.
 */

const { fetchMyRenders, publishRenderToGallery, unpublishGalleryItem } = vi.hoisted(
  () => ({
    fetchMyRenders: vi.fn(),
    publishRenderToGallery: vi.fn(),
    unpublishGalleryItem: vi.fn(),
  }),
);

vi.mock("@/lib/gallery/gallery-data", () => ({
  fetchMyRenders,
  publishRenderToGallery,
  unpublishGalleryItem,
}));

vi.mock("@/app/_components/session-provider", () => ({
  useSession: () => ({ session: { isAuthed: true } }),
}));

import YourVideosList from "@/app/_components/your-videos/your-videos-list";

function render(id: string): RenderJobDto {
  return {
    id,
    projectId: `prj_${id}`,
    versionId: `ver_${id}`,
    status: "completed",
    framesDone: 300,
    framesTotal: 300,
    outputSpec: {
      width: 1080,
      height: 1920,
      fps: 30,
      aspectRatio: "9:16",
      codec: "h264",
    },
    outputAssetKey: `renders/${id}/out.mp4`,
    thumbnailAssetKey: `renders/${id}/thumb.jpg`,
    runInBackground: false,
    error: null,
    createdAt: "2026-07-25T10:00:00.000Z",
    startedAt: "2026-07-25T10:00:00.000Z",
    completedAt: "2026-07-25T10:01:00.000Z",
  };
}

function galleryItem(renderJobId: string): GalleryItemDto {
  return {
    id: `gal_${renderJobId}`,
    renderJobId,
    projectId: `prj_${renderJobId}`,
    title: "Published",
    description: "",
    scriptureReference: "Genesis 1:1",
    scriptureBook: "GEN",
    translation: "BSB",
    durationSeconds: 10,
    visibility: "public",
    publishedAt: "2026-07-25T11:00:00.000Z",
    upvoteCount: 0,
    thumbnailUrl: null,
    rank: null,
    viewerHasUpvoted: false,
    owner: { displayName: "Ada", avatarInitials: "A" },
  };
}

let mounted: { container: HTMLElement; unmount: () => void } | null = null;

beforeEach(() => {
  // `resetAllMocks`, NOT `clearAllMocks`: clearing wipes the call log but LEAVES the
  // `mockReturnValueOnce` queue, so one unconsumed `…Once` silently answers the next
  // test's first request. That turned one honest failure into three here.
  vi.resetAllMocks();
  fetchMyRenders.mockResolvedValue([render("r_a"), render("r_b")]);
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

async function openList() {
  mounted = await mount(<YourVideosList />);
  return mounted.container;
}

const dialogField = (testId: string) => byTestId(document.body, testId) as HTMLInputElement;

describe("PublishDialog — a second open is a fresh form", () => {
  it("does not carry render A's title and reference into render B's dialog", async () => {
    publishRenderToGallery.mockResolvedValue(galleryItem("r_a"));
    const container = await openList();

    await click(byTestId(container, "your-videos-publish-r_a"));
    await typeInto(dialogField("publish-title"), "Creation, day one");
    await typeInto(dialogField("publish-reference"), "Genesis 1:1-5");
    await typeInto(dialogField("publish-translation"), "KJV");
    await typeInto(dialogField("publish-description"), "A first cut.");
    await click(byTestId(document.body, "publish-submit"));

    expect(publishRenderToGallery).toHaveBeenCalledWith("r_a", {
      title: "Creation, day one",
      description: "A first cut.",
      scriptureReference: "Genesis 1:1-5",
      translation: "KJV",
      visibility: "public",
    });

    // A is now published, so B is the only render still offering the affordance.
    await click(byTestId(container, "your-videos-publish-r_b"));

    expect(dialogField("publish-title").value).toBe("");
    expect(dialogField("publish-reference").value).toBe("");
    expect(dialogField("publish-description").value).toBe("");
    // Translation resets to the DEFAULT, not to whatever A was published under.
    expect(dialogField("publish-translation").value).toBe("BSB");
    // And the submit button is back to disabled, because an empty form is not ready.
    expect((byTestId(document.body, "publish-submit") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("does not carry a failed publish's error message into the next dialog", async () => {
    publishRenderToGallery.mockResolvedValueOnce(null);
    const container = await openList();

    await click(byTestId(container, "your-videos-publish-r_a"));
    await typeInto(dialogField("publish-title"), "Creation, day one");
    await typeInto(dialogField("publish-reference"), "Genesis 1:1-5");
    await click(byTestId(document.body, "publish-submit"));
    expect(queryTestId(document.body, "publish-error")).not.toBeNull();

    // Give up on A and try B instead.
    await click(byTestId(document.body, "modal-close"));
    await click(byTestId(container, "your-videos-publish-r_b"));

    expect(queryTestId(document.body, "publish-error")).toBeNull();
    expect(dialogField("publish-title").value).toBe("");
  });
});

describe("Unpublish — a refusal is visible", () => {
  it("says so when the DELETE fails instead of leaving the button inert", async () => {
    publishRenderToGallery.mockResolvedValue(galleryItem("r_a"));
    unpublishGalleryItem.mockResolvedValue(false);
    const container = await openList();

    await click(byTestId(container, "your-videos-publish-r_a"));
    await typeInto(dialogField("publish-title"), "Creation, day one");
    await typeInto(dialogField("publish-reference"), "Genesis 1:1-5");
    await click(byTestId(document.body, "publish-submit"));

    await click(byTestId(container, "your-videos-unpublish-r_a"));

    // Before the fix this returned silently: the card kept saying "Remove from gallery"
    // and the click did nothing observable, which reads as a broken button.
    expect(byTestId(container, "your-videos-unpublish-error-r_a").textContent).toContain(
      "still in the gallery",
    );
    // The card must still offer the retry — the item genuinely IS still published.
    expect(queryTestId(container, "your-videos-unpublish-r_a")).not.toBeNull();
  });

  it("clears the card's published state when the DELETE succeeds", async () => {
    publishRenderToGallery.mockResolvedValue(galleryItem("r_a"));
    unpublishGalleryItem.mockResolvedValue(true);
    const container = await openList();

    await click(byTestId(container, "your-videos-publish-r_a"));
    await typeInto(dialogField("publish-title"), "Creation, day one");
    await typeInto(dialogField("publish-reference"), "Genesis 1:1-5");
    await click(byTestId(document.body, "publish-submit"));

    await click(byTestId(container, "your-videos-unpublish-r_a"));

    expect(unpublishGalleryItem).toHaveBeenCalledWith("gal_r_a");
    expect(queryTestId(container, "your-videos-unpublish-r_a")).toBeNull();
    expect(queryTestId(container, "your-videos-unpublish-error-r_a")).toBeNull();
    expect(queryTestId(container, "your-videos-publish-r_a")).not.toBeNull();
  });
});
