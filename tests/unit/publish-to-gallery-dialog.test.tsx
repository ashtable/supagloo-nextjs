// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  byTestId,
  click,
  flush,
  mount,
  queryTestId,
  selectOption,
  type as typeInto,
} from "./support/render";
import type { GalleryItemDto, ProjectDto, ProjectVersionDto, RenderJobDto } from "@/lib/api/contracts";

/**
 * Turn 16b — the ONE publish-to-gallery dialog (plan slice C8).
 *
 * Replaces `your-videos-publish-dialog.test.tsx`'s PublishDialog block: that component is
 * deleted, and the rule it existed to protect — *the form belongs to the render being
 * published, not to the page* — moves here as U-PD2, asserted at the component boundary
 * where it now lives (the PROJECT picker) instead of at the page's `key=`.
 *
 * The four claims below are the ones that are DECISIONS rather than layout:
 *   U-PD1 the consent box ships unchecked (the design draws it pre-checked; a pre-ticked
 *         agreement is a dark pattern, so this is a deliberate divergence and it is pinned);
 *   U-PD2 switching PROJECT resets the form (the 22-line rationale, executable at last);
 *   U-PD3 the publish body is exactly five fields (a client that could send a duration
 *         could make the `mm:ss` badge lie — the same reason the api derives it);
 *   U-PD4 a failure keeps the dialog open with the api's own words, and a way forward.
 *
 * `<Modal>` portals to `document.body`, so every dialog query is rooted there.
 */

const {
  fetchMyRenders,
  fetchMyProjects,
  publishRenderToGallery,
  fetchVersions,
  fetchManifest,
} = vi.hoisted(() => ({
  fetchMyRenders: vi.fn(),
  fetchMyProjects: vi.fn(),
  publishRenderToGallery: vi.fn(),
  fetchVersions: vi.fn(),
  fetchManifest: vi.fn(),
}));

vi.mock("@/lib/gallery/gallery-data", () => ({
  fetchMyRenders,
  fetchMyProjects,
  publishRenderToGallery,
  unpublishGalleryItem: vi.fn(),
}));

vi.mock("@/lib/studio/studio-data", () => ({ fetchVersions, fetchManifest }));

import PublishToGalleryDialog from "@/app/_components/gallery/publish-to-gallery-dialog";

function render(id: string, projectId: string, versionId: string): RenderJobDto {
  return {
    id,
    projectId,
    versionId,
    status: "completed",
    framesDone: 300,
    framesTotal: 300,
    outputSpec: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16", codec: "h264" },
    outputAssetKey: `renders/${id}/output.mp4`,
    thumbnailAssetKey: `renders/${id}/thumb.jpg`,
    runInBackground: false,
    error: null,
    createdAt: "2026-07-20T10:00:00.000Z",
    startedAt: "2026-07-20T10:00:00.000Z",
    completedAt: `2026-07-2${id === "rj_a" ? 1 : 2}T10:05:00.000Z`,
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
    currentBranch: "v0.0.2",
    thumbnailAssetKey: null,
    lastRenderJobId: null,
    lastOpenedAt: "2026-07-20T10:00:00.000Z",
    createdAt: "2026-07-01T10:00:00.000Z",
  };
}

function version(id: string, projectId: string, semver: string): ProjectVersionDto {
  return {
    id,
    projectId,
    semver,
    branchName: `v${semver}`,
    state: "published",
    commitMessage: null,
    autoSummary: null,
    changedFiles: [],
    headCommitSha: null,
    prNumber: null,
    prUrl: null,
    publishedAt: "2026-07-20T10:00:00.000Z",
  };
}

function galleryItem(renderJobId: string): GalleryItemDto {
  return {
    id: `gal_${renderJobId}`,
    renderJobId,
    projectId: "p_a",
    title: "Published",
    description: "",
    scriptureReference: "Psalm 23:1-6",
    scriptureBook: "PSA",
    translation: "KJV",
    durationSeconds: 32,
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
const onClose = vi.fn();
const onPublished = vi.fn();

beforeEach(() => {
  // `resetAllMocks`, NOT `clearAllMocks`: clearing leaves the `…Once` queue, so one
  // unconsumed `mockResolvedValueOnce` silently answers the next test's first request.
  vi.resetAllMocks();
  fetchMyRenders.mockResolvedValue([
    render("rj_a", "p_a", "v_a"),
    render("rj_b", "p_b", "v_b"),
  ]);
  fetchMyProjects.mockResolvedValue([project("p_a", "psalm-121"), project("p_b", "john-3")]);
  fetchVersions.mockImplementation(async (projectId: string) =>
    projectId === "p_a"
      ? [version("v_a", "p_a", "0.0.2")]
      : [version("v_b", "p_b", "1.2.0")],
  );
  // The manifest read is best-effort and owner-scoped through GitHub; every assertion
  // below must hold when it fails, because in the real world it often will.
  fetchManifest.mockResolvedValue({ ok: false, reason: "github_not_connected" });
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

async function open(initialRenderId: string | null = null) {
  mounted = await mount(
    <PublishToGalleryDialog
      open
      initialRenderId={initialRenderId}
      onClose={onClose}
      onPublished={onPublished}
    />,
  );
  await flush();
  return mounted.container;
}

const field = (testId: string) => byTestId(document.body, testId) as HTMLInputElement;
const select = (testId: string) => byTestId(document.body, testId) as HTMLSelectElement;
const submit = () => byTestId(document.body, "publish-submit") as HTMLButtonElement;

const choose = (testId: string, value: string) => selectOption(select(testId), value);

describe("the 16b publish dialog", () => {
  it("U-PD1: the consent checkbox renders UNCHECKED on open, and submit is gated on it", async () => {
    await open("rj_a");

    const consent = field("publish-consent");
    expect(consent.checked).toBe(false);

    // Everything else the api needs is already there…
    await typeInto(field("publish-title"), "The Lord Is My Shepherd");
    await typeInto(field("publish-passage"), "Psalm 23:1-6");
    // …and it is STILL not submittable, because consent is the remaining gate.
    expect(submit().disabled).toBe(true);

    await click(consent);
    expect(submit().disabled).toBe(false);

    // "community guidelines" is bold copy, never a link — no such page exists.
    const consentRow = byTestId(document.body, "publish-consent-row");
    expect(consentRow.textContent).toContain("community guidelines");
    expect(consentRow.querySelector("a")).toBeNull();
  });

  it("U-PD2: changing the PROJECT selection clears title and passage", async () => {
    await open("rj_a");

    // The picker names each render by the D8 join, so the value the user switches
    // BETWEEN is meaningful rather than an opaque id.
    expect(select("publish-project").value).toBe("rj_a");
    const labels = Array.from(select("publish-project").options).map((o) => o.textContent);
    expect(labels).toContain("psalm-121 · v0.0.2");
    expect(labels).toContain("john-3 · v1.2.0");

    await typeInto(field("publish-title"), "Creation, day one");
    await typeInto(field("publish-passage"), "Genesis 1:1-5");
    await click(field("publish-consent"));

    await choose("publish-project", "rj_b");
    await flush();

    // The whole point: render B's form must not carry render A's reference — the server
    // derives `scriptureBook` from it and the public card prints it verbatim.
    expect(field("publish-title").value).toBe("");
    expect(field("publish-passage").value).toBe("");
    expect(field("publish-consent").checked).toBe(false);
    expect(submit().disabled).toBe(true);
    expect(select("publish-project").value).toBe("rj_b");
  });

  it("U-PD3: submit sends exactly {title, description, scriptureReference, translation, visibility} and NOTHING else", async () => {
    publishRenderToGallery.mockResolvedValue({ ok: true, item: galleryItem("rj_a") });
    await open("rj_a");

    await typeInto(field("publish-title"), "  The Lord Is My Shepherd  ");
    await typeInto(field("publish-passage"), "  Psalm 23:1-6 ");
    await click(field("publish-consent"));
    await click(submit());
    await flush();

    expect(publishRenderToGallery).toHaveBeenCalledTimes(1);
    const [renderId, body] = publishRenderToGallery.mock.calls[0];
    expect(renderId).toBe("rj_a");
    expect(body).toEqual({
      title: "The Lord Is My Shepherd",
      // D12: the design drops DESCRIPTION from both screens, so there is no input —
      // but the wire field stays, sent as the empty string it already defaults to.
      description: "",
      scriptureReference: "Psalm 23:1-6",
      translation: "KJV",
      visibility: "public",
    });
    // A body with an extra key fails this. `durationSeconds` and both asset keys are
    // SERVER-derived on purpose.
    expect(Object.keys(body as object).sort()).toEqual([
      "description",
      "scriptureReference",
      "title",
      "translation",
      "visibility",
    ]);

    expect(onPublished).toHaveBeenCalledWith(galleryItem("rj_a"));
  });

  it("U-PD4: a failed publish keeps the dialog open, shows the api's message verbatim, and re-enables submit", async () => {
    publishRenderToGallery.mockResolvedValue({
      ok: false,
      message: "render is already published to the gallery",
    });
    await open("rj_a");

    await typeInto(field("publish-title"), "The Lord Is My Shepherd");
    await typeInto(field("publish-passage"), "Psalm 23:1-6");
    await click(field("publish-consent"));
    await click(submit());
    await flush();

    // The api's own words, not a paraphrase: the three refusals are distinguishable
    // upstream and stay distinguishable here.
    expect(byTestId(document.body, "publish-error").textContent).toBe(
      "render is already published to the gallery",
    );
    expect(onPublished).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // An error state with no way out is a dead end.
    expect(submit().disabled).toBe(false);
    expect(queryTestId(document.body, "publish-dialog")).not.toBeNull();
  });

  it("U-PD5: Allow remixes, Show my GitHub repo and Change cover frame are present, disabled and explain themselves", async () => {
    await open("rj_a");

    for (const testId of [
      "publish-toggle-remixes",
      "publish-toggle-repo",
      "publish-cover-change",
    ]) {
      const el = byTestId(document.body, testId);
      expect(el.getAttribute("aria-disabled"), `${testId} is not disabled`).toBe("true");
      // Never a control that silently does nothing: each says WHY it cannot be used.
      expect((el.getAttribute("title") ?? "").length, `${testId} has no tooltip`).toBeGreaterThan(0);
    }
  });

  it("U-PD6: TRANSLATION offers the documented defaults plus an Other… escape that reveals a free-text input", async () => {
    await open("rj_a");

    const values = Array.from(select("publish-translation").options).map((o) => o.value);
    expect(values).toContain("KJV");
    expect(values).toContain("BSB");
    // No closed enum lives anywhere in this system — `TranslationSchema` is an open
    // string, so the dropdown must not be able to refuse a legitimate abbreviation.
    expect(queryTestId(document.body, "publish-translation-other")).toBeNull();
    await choose("publish-translation", values[values.length - 1]);
    await flush();

    const other = field("publish-translation-other");
    await typeInto(other, "NRSVUE");

    publishRenderToGallery.mockResolvedValue({ ok: true, item: galleryItem("rj_a") });
    await typeInto(field("publish-title"), "Title");
    await typeInto(field("publish-passage"), "Psalm 23:1");
    await click(field("publish-consent"));
    await click(submit());
    await flush();

    expect(publishRenderToGallery.mock.calls[0][1]).toMatchObject({
      translation: "NRSVUE",
    });
  });
});
