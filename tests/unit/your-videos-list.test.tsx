// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  byTestId,
  click,
  flush,
  mount,
  queryTestId,
  type as typeInto,
} from "./support/render";
import type {
  GalleryItemDto,
  ProjectDto,
  ProjectVersionDto,
  RenderJobDto,
} from "@/lib/api/contracts";

/**
 * "Your videos" — the page's own wiring, not the dialog's.
 *
 * REPLACES `your-videos-publish-dialog.test.tsx` (slice C8). That file drove a
 * `PublishDialog` that lived at the bottom of `your-videos-list.tsx` and is now deleted:
 * Turn 16b unifies the two publish surfaces into ONE dialog, and the form's own rules are
 * asserted where they now live (`publish-to-gallery-dialog.test.tsx`).
 *
 * What stays HERE is what only this page can be wrong about:
 *  - it opens the shared dialog on the right render (a row-scoped action that opened the
 *    wrong video would publish the wrong video);
 *  - a second open is a fresh form — the rule the deleted 22-line comment protected,
 *    re-asserted at this boundary because this page still owns the `key=`;
 *  - and un-publishing still says so when it is refused.
 *
 * The `<Modal>` portals to `document.body`, so every dialog query is rooted there.
 */

const {
  fetchMyRenders,
  fetchMyProjects,
  publishRenderToGallery,
  unpublishGalleryItem,
  fetchVersions,
  fetchManifest,
} = vi.hoisted(() => ({
  fetchMyRenders: vi.fn(),
  fetchMyProjects: vi.fn(),
  publishRenderToGallery: vi.fn(),
  unpublishGalleryItem: vi.fn(),
  fetchVersions: vi.fn(),
  fetchManifest: vi.fn(),
}));

vi.mock("@/lib/gallery/gallery-data", () => ({
  fetchMyRenders,
  fetchMyProjects,
  publishRenderToGallery,
  unpublishGalleryItem,
}));

vi.mock("@/lib/studio/studio-data", () => ({ fetchVersions, fetchManifest }));

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
    outputSpec: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16", codec: "h264" },
    outputAssetKey: `renders/${id}/out.mp4`,
    thumbnailAssetKey: `renders/${id}/thumb.jpg`,
    runInBackground: false,
    error: null,
    createdAt: "2026-07-25T10:00:00.000Z",
    startedAt: "2026-07-25T10:00:00.000Z",
    completedAt: `2026-07-25T10:0${id === "r_a" ? 2 : 1}:00.000Z`,
  };
}

function project(id: string, slug: string): ProjectDto {
  return {
    id,
    slug,
    name: slug,
    repoOwner: "ashsrinivas",
    repoName: slug,
    repoVisibility: "private",
    createdFrom: "blank",
    currentBranch: "v0.0.1",
    thumbnailAssetKey: null,
    lastRenderJobId: null,
    lastOpenedAt: "2026-07-25T10:00:00.000Z",
    createdAt: "2026-07-01T10:00:00.000Z",
  };
}

function version(id: string, projectId: string): ProjectVersionDto {
  return {
    id,
    projectId,
    semver: "0.0.1",
    branchName: "v0.0.1",
    state: "published",
    commitMessage: null,
    autoSummary: null,
    changedFiles: [],
    headCommitSha: null,
    prNumber: null,
    prUrl: null,
    publishedAt: "2026-07-25T10:00:00.000Z",
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
  // test's first request.
  vi.resetAllMocks();
  fetchMyRenders.mockResolvedValue([render("r_a"), render("r_b")]);
  fetchMyProjects.mockResolvedValue([
    project("prj_r_a", "genesis-1"),
    project("prj_r_b", "psalm-23"),
  ]);
  fetchVersions.mockImplementation(async (projectId: string) => [
    version(`ver_${projectId.replace("prj_", "")}`, projectId),
  ]);
  fetchManifest.mockResolvedValue({ ok: false, reason: "github_not_connected" });
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

async function openList() {
  mounted = await mount(<YourVideosList />);
  await flush();
  return mounted.container;
}

const dialogField = (testId: string) =>
  byTestId(document.body, testId) as HTMLInputElement;

async function fillAndPublish(title: string, passage: string) {
  await typeInto(dialogField("publish-title"), title);
  await typeInto(dialogField("publish-passage"), passage);
  await click(dialogField("publish-consent"));
  await click(byTestId(document.body, "publish-submit"));
  await flush();
}

describe("opening the shared 16b dialog from a row", () => {
  it("Y-VL1: preselects THAT row's render, so the row action and the published video agree", async () => {
    publishRenderToGallery.mockResolvedValue({ ok: true, item: galleryItem("r_b") });
    const container = await openList();

    await click(byTestId(container, "your-videos-publish-r_b"));
    await flush();

    const picker = byTestId(document.body, "publish-project") as HTMLSelectElement;
    expect(picker.value).toBe("r_b");
    // …and the D8 join names it, rather than showing an opaque id.
    expect(picker.selectedOptions[0].textContent).toBe("psalm-23 · v0.0.1");

    await fillAndPublish("The Lord Is My Shepherd", "Psalm 23:1-6");
    expect(publishRenderToGallery.mock.calls[0][0]).toBe("r_b");
  });

  it("Y-VL2: a second open is a fresh form — render A's passage never reaches render B", async () => {
    publishRenderToGallery.mockResolvedValue({ ok: true, item: galleryItem("r_a") });
    const container = await openList();

    await click(byTestId(container, "your-videos-publish-r_a"));
    await flush();
    await fillAndPublish("Creation, day one", "Genesis 1:1-5");

    // A is published, so B is the only row still offering the affordance.
    await click(byTestId(container, "your-videos-publish-r_b"));
    await flush();

    expect(dialogField("publish-title").value).toBe("");
    expect(dialogField("publish-passage").value).toBe("");
    // The consent is an agreement about THIS video; it does not carry over either.
    expect(dialogField("publish-consent").checked).toBe(false);
    expect((byTestId(document.body, "publish-submit") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  /**
   * ADDED AFTER A SURVIVING MUTATION. Replacing this page's `key={publishing.id}` with a
   * constant left Y-VL1–Y-VL3 green, because all three CLOSE the dialog between opens and
   * `{publishing && …}` already unmounts it on close. The key only earns its place on the
   * transition Y-VL2 never makes: A → B with no close in between.
   *
   * That transition is reachable. The rows stay in the document behind the portalled
   * modal, so anything that reaches them — a keyboard user tabbing past the trap, a
   * screen reader, a future layout where the overlay does not cover the grid — publishes
   * render B through a form still holding render A's passage.
   */
  it("Y-VL4: switching directly from render A's dialog to render B's resets the form", async () => {
    const container = await openList();

    await click(byTestId(container, "your-videos-publish-r_a"));
    await flush();
    await typeInto(dialogField("publish-title"), "Creation, day one");
    await typeInto(dialogField("publish-passage"), "Genesis 1:1-5");

    // No close, no publish — straight to the other row.
    await click(byTestId(container, "your-videos-publish-r_b"));
    await flush();

    expect((byTestId(document.body, "publish-project") as HTMLSelectElement).value).toBe(
      "r_b",
    );
    expect(dialogField("publish-title").value).toBe("");
    expect(dialogField("publish-passage").value).toBe("");
  });

  it("Y-VL3: a failed publish keeps the row and the dialog, and the next open is clean", async () => {
    publishRenderToGallery.mockResolvedValueOnce({
      ok: false,
      message: "render is already published to the gallery",
    });
    const container = await openList();

    await click(byTestId(container, "your-videos-publish-r_a"));
    await flush();
    await fillAndPublish("Creation, day one", "Genesis 1:1-5");

    expect(byTestId(document.body, "publish-error").textContent).toBe(
      "render is already published to the gallery",
    );
    // The row must still say "Share to gallery" — nothing was published.
    expect(queryTestId(container, "your-videos-publish-r_a")).not.toBeNull();

    await click(byTestId(document.body, "publish-cancel"));
    await click(byTestId(container, "your-videos-publish-r_b"));
    await flush();
    expect(queryTestId(document.body, "publish-error")).toBeNull();
    expect(dialogField("publish-title").value).toBe("");
  });
});

describe("Unpublish — a refusal is visible", () => {
  it("says so when the DELETE fails instead of leaving the button inert", async () => {
    publishRenderToGallery.mockResolvedValue({ ok: true, item: galleryItem("r_a") });
    unpublishGalleryItem.mockResolvedValue(false);
    const container = await openList();

    await click(byTestId(container, "your-videos-publish-r_a"));
    await flush();
    await fillAndPublish("Creation, day one", "Genesis 1:1-5");

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
    publishRenderToGallery.mockResolvedValue({ ok: true, item: galleryItem("r_a") });
    unpublishGalleryItem.mockResolvedValue(true);
    const container = await openList();

    await click(byTestId(container, "your-videos-publish-r_a"));
    await flush();
    await fillAndPublish("Creation, day one", "Genesis 1:1-5");

    await click(byTestId(container, "your-videos-unpublish-r_a"));

    expect(unpublishGalleryItem).toHaveBeenCalledWith("gal_r_a");
    expect(queryTestId(container, "your-videos-unpublish-r_a")).toBeNull();
    expect(queryTestId(container, "your-videos-unpublish-error-r_a")).toBeNull();
    expect(queryTestId(container, "your-videos-publish-r_a")).not.toBeNull();
  });
});
