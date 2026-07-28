// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  byTestId,
  click,
  flush,
  mount,
  typeTextArea as typeIntoTextArea,
} from "./support/render";
import type { Mounted } from "./support/render";
import type { ProjectManifest, ProjectVersionDto } from "@/lib/api/contracts";

/**
 * Task items 6 and 7, at the component boundary.
 *
 * Item 6: `startRender()` has existed since task 38 and is reachable from exactly two
 * places — the publish wizard's post-publish CTA and the render overlay's retry. There
 * is no header entry point, which is precisely the user's report ("no way to render and
 * download a video except by publishing a new version"). The fix is a trigger, not a
 * pipeline. `render-share` is deliberately NOT rewired: `studio-publish.e2e.ts` E-RND1
 * asserts it opens the ship menu and stays distinct from the render overlay.
 *
 * Item 7: the Publish gate FAILS OPEN. See `lib/studio/top-bar-gates.ts` for why the
 * underlying sha comparison is not a true invariant.
 */

const { fetchVersions } = vi.hoisted(() => ({ fetchVersions: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/studio/studio-data", () => ({
  commitVersion: vi.fn(async () => null),
  publishVersion: vi.fn(async () => null),
  fetchVersions,
}));
vi.mock("@/lib/studio/render-data", () => ({
  startRenderJob: vi.fn(async () => null),
  cancelRenderJob: vi.fn(),
  fetchRenderDownloadUrl: vi.fn(async () => null),
  pollRenderUntilTerminal: vi.fn(async () => null),
}));
vi.mock("@/lib/studio/ai-generation-data", () => ({
  createGeneration: vi.fn(),
  pollGenerationUntilTerminal: vi.fn(),
  presignDownload: vi.fn(),
}));

import TopBar from "@/app/studio/_components/top-bar";
import SceneInspector from "@/app/studio/_components/scene-inspector";
import { StudioProvider } from "@/app/studio/_components/studio-context";
import { DEMO_STORYBOARD } from "@/lib/studio/storyboard";
import type { StudioProject } from "@/lib/studio/project";

const MANIFEST: ProjectManifest = {
  manifestVersion: 1,
  composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
  narratorVoice: { description: "warm baritone" },
  scenes: DEMO_STORYBOARD.scenes.map((s) => ({
    id: s.id,
    name: s.visualLabel,
    scriptText: s.script,
    reference: "JOHN 1:23",
    translation: "ASV",
    visualPrompt: s.visualPrompt,
    durationSeconds: s.durationSeconds,
    captions: true,
  })),
};

function version(
  branchName: string,
  state: ProjectVersionDto["state"],
  headCommitSha: string | null,
): ProjectVersionDto {
  return {
    id: `id-${branchName}`,
    projectId: "p1",
    semver: branchName.replace(/^v/, ""),
    branchName,
    state,
    commitMessage: null,
    autoSummary: null,
    changedFiles: [],
    headCommitSha,
    prNumber: null,
    prUrl: null,
    publishedAt: null,
  };
}

const NOTHING_TO_PUBLISH = [
  version("v0.0.1", "working", "same"),
  version("v0.0.0", "base", "same"),
];
const SOMETHING_TO_PUBLISH = [
  version("v0.0.1", "working", "ahead"),
  version("v0.0.0", "base", "same"),
];

function realProject(): StudioProject {
  return {
    id: "psalm-121",
    projectName: "psalm-121",
    repo: "ashsrinivas/psalm-121",
    versionBranch: "v0.0.1",
    storyboard: DEMO_STORYBOARD,
    manifest: MANIFEST,
  };
}

/** The MOCK catalogue: no source manifest, which is the studio's real-vs-mock signal. */
function mockProject(): StudioProject {
  const project = realProject();
  delete project.manifest;
  return project;
}

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.resetAllMocks();
});

async function open(project: StudioProject) {
  mounted = await mount(
    <StudioProvider project={project}>
      <TopBar />
    </StudioProvider>,
  );
  await flush();
  return mounted.container;
}

describe("TopBar — item 6, the header Render button", () => {
  it("U-TB1: a render-button exists and sits immediately after commit-button", async () => {
    fetchVersions.mockResolvedValue(SOMETHING_TO_PUBLISH);
    const root = await open(realProject());
    const render = byTestId(root, "render-button");
    const commit = byTestId(root, "commit-button");
    expect(render.textContent).toContain("Render");
    // DOCUMENT_POSITION_FOLLOWING === 4: render comes after commit in document order
    expect(commit.compareDocumentPosition(render) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // it must not be a second name for the share popover (E-RND1 keeps them distinct)
    expect(byTestId(root, "render-share")).not.toBe(render);
  });

  it("U-TB2: disabled with a commit-first title once there are uncommitted edits", async () => {
    // A render does `cloneAtVersion` and builds from the LAST COMMIT, so rendering while
    // dirty would silently produce a video without the edits on screen. Driven through
    // the real edit seam (`script-input`), not by hand-setting state.
    fetchVersions.mockResolvedValue(SOMETHING_TO_PUBLISH);
    mounted = await mount(
      <StudioProvider project={realProject()}>
        <TopBar />
        <SceneInspector />
      </StudioProvider>,
    );
    await flush();
    const root = mounted.container;

    expect((byTestId(root, "render-button") as HTMLButtonElement).disabled).toBe(false);

    await typeIntoTextArea(byTestId(root, "script-input"), "EDITED, NOT COMMITTED");
    expect(byTestId(root, "version-branch-chip").getAttribute("data-dirty")).toBe("true");

    const render = byTestId(root, "render-button") as HTMLButtonElement;
    expect(render.disabled).toBe(true);
    expect(render.getAttribute("title")).toBe(
      "Commit your changes first — a render is built from the last commit.",
    );
  });

  it("U-TB3: clicking Render starts a render — the button then reports one is running", async () => {
    fetchVersions.mockResolvedValue(SOMETHING_TO_PUBLISH);
    const root = await open(realProject());
    const button = byTestId(root, "render-button") as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    await click(button);
    await flush();

    const after = byTestId(root, "render-button") as HTMLButtonElement;
    expect(after.disabled).toBe(true);
    expect(after.getAttribute("title")).toBe("A render is already running.");
  });
});

describe("TopBar — item 7, the Publish gate", () => {
  it("U-TB4: disabled with an actionable title when the versions say nothing is ahead", async () => {
    fetchVersions.mockResolvedValue(NOTHING_TO_PUBLISH);
    const root = await open(realProject());
    const publish = byTestId(root, "publish-button") as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    expect(publish.getAttribute("title")).toBe(
      "Nothing new to publish — commit a change first.",
    );
  });

  it("U-TB4b: the disabled Publish DROPS the gradient — a saturated gradient at opacity .5 reads 'faded', not 'disabled'", async () => {
    fetchVersions.mockResolvedValue(NOTHING_TO_PUBLISH);
    const root = await open(realProject());
    const publish = byTestId(root, "publish-button");
    expect(publish.style.background).not.toContain("gradient");
  });

  it("U-TB5: enabled once a commit is ahead of the published head", async () => {
    fetchVersions.mockResolvedValue(SOMETHING_TO_PUBLISH);
    const root = await open(realProject());
    const publish = byTestId(root, "publish-button") as HTMLButtonElement;
    expect(publish.disabled).toBe(false);
    expect(publish.getAttribute("title")).toBeNull();
    expect(publish.style.background).toContain("gradient");
  });

  it("U-TB6: the MOCK catalogue never disables Publish — and never even asks for versions", async () => {
    const root = await open(mockProject());
    expect((byTestId(root, "publish-button") as HTMLButtonElement).disabled).toBe(false);
    expect(fetchVersions).not.toHaveBeenCalled();
  });

  it("U-TB6b: FAILS OPEN — an unreadable versions list leaves Publish live", async () => {
    fetchVersions.mockResolvedValue(null);
    const root = await open(realProject());
    expect((byTestId(root, "publish-button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("U-TB7: disabled with a commit-first title once there are uncommitted edits — even when a commit IS ahead", async () => {
    // The versions say there is something to publish (U-TB5's fixture, which is enabled
    // when clean), so the ONLY thing turning the button off here is the uncommitted edit.
    // A publish merges the version BRANCH into main; the edit on screen is not on it, so
    // publishing now releases a version that silently omits what the user is looking at.
    // Driven through the real edit seam (`script-input`), not by hand-setting state.
    fetchVersions.mockResolvedValue(SOMETHING_TO_PUBLISH);
    mounted = await mount(
      <StudioProvider project={realProject()}>
        <TopBar />
        <SceneInspector />
      </StudioProvider>,
    );
    await flush();
    const root = mounted.container;

    expect((byTestId(root, "publish-button") as HTMLButtonElement).disabled).toBe(false);

    await typeIntoTextArea(byTestId(root, "script-input"), "EDITED, NOT COMMITTED");
    expect(byTestId(root, "version-branch-chip").getAttribute("data-dirty")).toBe("true");

    const publish = byTestId(root, "publish-button") as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    expect(publish.getAttribute("title")).toBe(
      "Commit your changes first — a publish releases the last commit.",
    );
    // and the disabled treatment is the same one U-TB4b pins: no gradient
    expect(publish.style.background).not.toContain("gradient");
  });
});

describe("TopBar — a commit the server never accepted is not a timeout", () => {
  it("U-TB8: a null jobId reports the REQUEST failing, never `commit_timeout`", async () => {
    // `commitVersion` returns null for ANY non-2xx / unparseable / thrown POST — a 422
    // `manifest_invalid` (which D3's shipped workflow makes easy to hit: clear a Script
    // textarea to retype it and commit) comes back in milliseconds. Reporting that as
    // `commit_timeout` names a failure mode that did not occur.
    //
    // `commitVersion` is mocked to `async () => null` at the top of this file, which is
    // exactly that seam. The POLL timeout keeps `commit_timeout` — see U-R14.
    fetchVersions.mockResolvedValue(SOMETHING_TO_PUBLISH);
    mounted = await mount(
      <StudioProvider project={realProject()}>
        <TopBar />
        <SceneInspector />
      </StudioProvider>,
    );
    await flush();
    const root = mounted.container;

    await typeIntoTextArea(byTestId(root, "script-input"), "EDITED, NOT COMMITTED");
    await click(byTestId(root, "commit-button"));
    await flush();

    const chip = byTestId(root, "commit-error");
    expect(chip.textContent).toContain("Commit failed");
    expect(chip.getAttribute("title")).toBe("commit_request_failed");
    expect(chip.getAttribute("title")).not.toBe("commit_timeout");
  });
});
