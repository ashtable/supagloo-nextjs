// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, deferred, flush, mount, queryTestId } from "./support/render";
import type { Mounted } from "./support/render";

/**
 * U-INS2..U-INS5 — the Inspector's GENERATION section at the component boundary.
 *
 * This file is deliberately SHORT. Everything about layout, labels, option ordering,
 * which providers appear, when the faith-alignment select shows, and what the cost row
 * reads is proven where it belongs: the rules in `lib/studio/ai-settings.test.ts` and
 * `lib/studio/cost-estimate.test.ts`, and the rendered result in the real-lane Stagehand
 * spec `studio-model-cost.e2e.ts` against a LIVE catalogue. Re-asserting any of that here
 * would be a brittle duplicate that breaks on a copy change without catching a defect.
 *
 * What is proven here is what neither of those can see:
 *  - the catalogue is read ONCE per studio open, not once per re-render (U-INS3);
 *  - a response landing after unmount does not dispatch into a dead reducer (U-INS4);
 *  - a failed read leaves the editor up (U-INS5);
 *  - the video driver's POLL BUDGET reaches the data layer (U-INS6).
 * All are the defect class the jsdom lane was added for (row 41's review found two of them
 * inside client-component async flow), and all are invisible to a Stagehand spec, which
 * can only observe the settled UI.
 *
 * Plus the one structural claim that is cheap here and expensive anywhere else: the whole
 * section is ABSENT for a mock-catalogue project (U-INS2). That gate is what keeps the
 * mock e2e lane's exact-`textContent` assertions valid and its zero-egress guarantee
 * true, so it cannot be proven by a spec running in the lane it protects.
 *
 * ── About the plan's `U-INS1` ──────────────────────────────────────────────────────────
 * The §2.2 plan named `U-INS1` for one specific claim: "a catalogue response that lands
 * AFTER the user has already picked a model does not overwrite the pick" — the stale-
 * response race. **That test is not here, and it is not missing.** The race is prevented
 * STRUCTURALLY rather than by timing, so there is no ordering a test could construct that
 * would exhibit it: `reducer.ts`'s `MODELS_LOADED` case returns
 * `{ ...state, modelCatalogue: action.catalogue }` and touches nothing else — in
 * particular not `storyboard.aiSettings`, which is where the user's pick lives. A late
 * catalogue cannot overwrite a pick it never writes to.
 *
 * The invariant that actually holds it is therefore a REDUCER invariant, and it is pinned
 * where it can be broken: `lib/studio/reducer-ai-settings.test.ts`'s `MODELS_LOADED` test
 * asserts `storyboard.aiSettings` is unchanged across the action. Three tests below were
 * shipped under the `U-INS1a/b/c` ids while making three different claims; they are
 * renumbered `U-INS3/4/5` so no id promises a test that does not exist.
 */

const fetchModelCatalogue = vi.hoisted(() => vi.fn());
// Hoisted (not inline in the factory) because U-INS6 asserts on the ARGUMENTS these were
// called with, which is the only place the video poll budget is observable.
const createGeneration = vi.hoisted(() => vi.fn());
const pollGenerationUntilTerminal = vi.hoisted(() => vi.fn());
const presignDownload = vi.hoisted(() => vi.fn());

vi.mock("@/lib/studio/model-catalogue-data", () => ({ fetchModelCatalogue }));
vi.mock("@/lib/studio/studio-data", () => ({
  commitVersion: vi.fn(),
  publishVersion: vi.fn(),
  fetchVersions: vi.fn(async () => null),
}));
vi.mock("@/lib/studio/render-data", () => ({
  startRenderJob: vi.fn(),
  cancelRenderJob: vi.fn(),
  fetchRenderDownloadUrl: vi.fn(),
  pollRenderUntilTerminal: vi.fn(),
}));
vi.mock("@/lib/studio/ai-generation-data", () => ({
  createGeneration,
  pollGenerationUntilTerminal,
  presignDownload,
}));

import SceneInspector from "@/app/studio/_components/scene-inspector";
import { StudioProvider } from "@/app/studio/_components/studio-context";
import { DEMO_STORYBOARD } from "@/lib/studio/storyboard";
import type { StudioProject } from "@/lib/studio/project";
import type { ProjectManifest } from "@/lib/api/contracts";

const MANIFEST: ProjectManifest = {
  manifestVersion: 1,
  composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
  scenes: DEMO_STORYBOARD.scenes.map((s) => ({
    id: s.id,
    name: s.visualLabel,
    scriptText: s.script,
    reference: "JOHN 1:23",
    translation: "KJV",
    visualPrompt: s.visualPrompt,
    durationSeconds: s.durationSeconds,
    captions: s.onScreenText === "text",
  })),
  narratorVoice: { description: DEMO_STORYBOARD.voiceDescription },
};

const CATALOGUE = {
  models: [
    {
      id: "vendor/img",
      provider: "openrouter" as const,
      label: "Vendor Image",
      kinds: ["image" as const],
      pricing: { perImage: 0.03 },
    },
  ],
  providers: { gloo: false, openrouter: true },
  defaults: { image: { provider: "openrouter" as const, model: "vendor/img" } },
};

const realProject = (): StudioProject => ({
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
  manifest: MANIFEST,
});

const mockProject = (): StudioProject => ({
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
});

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  // `clearAllMocks` clears the CALL LOG only and leaves the `…Once` queue intact, so one
  // unconsumed value silently answers the next test's first request.
  vi.resetAllMocks();
});

async function open(project: StudioProject) {
  mounted = await mount(
    <StudioProvider project={project}>
      <SceneInspector />
    </StudioProvider>,
  );
  await flush();
  return mounted.container;
}

describe("the Inspector GENERATION section", () => {
  it("U-INS2: is ABSENT for a mock-catalogue project, and reads NOTHING", async () => {
    // The `aiEnabled` gate. Mock-lane e2e specs assert the inspector's exact textContent
    // and the lane's whole point is zero network egress — so a section that mounted here
    // would break both, and it cannot be a spec in that lane that proves it does not.
    fetchModelCatalogue.mockResolvedValue(CATALOGUE);
    const root = await open(mockProject());

    expect(queryTestId(root, "ai-settings")).toBeNull();
    expect(queryTestId(root, "generate-scene-video")).toBeNull();
    expect(fetchModelCatalogue).not.toHaveBeenCalled();
  });

  it("U-INS3: reads the catalogue ONCE per studio open, not once per re-render", async () => {
    // The effect is keyed on whether the project has a manifest, not on the state it
    // dispatches into. Keying it wrong makes every edit re-read four upstream catalogues,
    // and (worse) makes each late response a chance to overwrite state the user has moved
    // on from. A settled-UI spec cannot count requests.
    fetchModelCatalogue.mockResolvedValue(CATALOGUE);
    const root = await open(realProject());

    expect(fetchModelCatalogue).toHaveBeenCalledTimes(1);
    expect(byTestId(root, "ai-settings")).toBeTruthy();

    // Drive several real re-renders through an actual edit seam.
    const captions = byTestId(root, "captions-switch");
    for (let i = 0; i < 3; i += 1) {
      captions.click();
      await flush();
    }
    expect(fetchModelCatalogue).toHaveBeenCalledTimes(1);
  });

  it("U-INS4: a catalogue landing AFTER unmount does not dispatch into a dead reducer", async () => {
    // Holding the request open and unmounting underneath it is the whole technique. The
    // `aliveRef` guard is invisible from outside: without it this resolve throws a React
    // "update on an unmounted component" and, in the general case, writes into state that
    // no longer exists.
    const pending = deferred<typeof CATALOGUE>();
    fetchModelCatalogue.mockReturnValue(pending.promise);

    await open(realProject());
    mounted?.unmount();
    mounted = null;

    pending.resolve(CATALOGUE);
    await expect(flush()).resolves.toBeUndefined();
  });

  it("U-INS5: a FAILED catalogue read leaves the editor up, with the section still mounted", async () => {
    // `fetchModelCatalogue` resolves null on any failure rather than throwing, and the
    // panel has to render that as an honest unavailable state — not as an empty gap, and
    // certainly not by taking the inspector down. A picker is not worth the editor.
    fetchModelCatalogue.mockResolvedValue(null);
    const root = await open(realProject());

    expect(byTestId(root, "ai-settings")).toBeTruthy();
    expect(byTestId(root, "script-input")).toBeTruthy();
    // With no catalogue there is nothing selectable, and the cost row must say so rather
    // than showing a number it does not have.
    expect(byTestId(root, "ai-cost-image").getAttribute("data-confidence")).toBe(
      "unpriced",
    );
  });

  it("U-INS6: the video driver polls on the 25-MINUTE budget, not the 300 s default", async () => {
    // D-F, and the reason it exists: `generateVideo` submits an async provider job and
    // polls it with durable ~30 s sleeps for up to 40 attempts — TWENTY MINUTES — while
    // `pollGenerationUntilTerminal` defaults to 300 s. At the default the studio reports a
    // failure four times before the workflow is even finished, and the clip that
    // eventually lands never attaches to the scene.
    //
    // Nothing pinned this. `VIDEO_GENERATION_POLL_TIMEOUT_MS` and the options bag that
    // carries it appear in `studio-context.tsx` and `scene-inspector.tsx` only, in no test
    // file, and `E-AI3` — the one e2e that would exercise it — is `test.todo` because a
    // real text-to-video clip is minutes of wall clock and real money. Deleting the
    // `{ timeoutMs }` argument outright left all 1071 nextjs tests passing.
    //
    // So this drives the REAL button through the REAL driver and asserts the budget
    // reaches the data layer. It is a control-flow claim, which is what this file is for.
    // The studio opens on the SECOND scene (`reducer.ts` seeds `selectedSceneId` from
    // `scenes[1]`), so that is the scene this inspector is showing and the one the button
    // must generate for. Cross-checked below against the scene's own `visualPrompt`, so an
    // off-by-one in the driver cannot satisfy the id assertion by coincidence.
    const inspected = DEMO_STORYBOARD.scenes[1]!;

    fetchModelCatalogue.mockResolvedValue(CATALOGUE);
    createGeneration.mockResolvedValue("gen-vid-1");
    pollGenerationUntilTerminal.mockResolvedValue({
      id: "gen-vid-1",
      projectId: "psalm-121",
      sceneId: inspected.id,
      kind: "video",
      provider: "openrouter",
      model: "vendor/video",
      status: "succeeded",
      resultJson: null,
      resultAssetKey: "assets/psalm-121/gen-vid-1",
      error: null,
      tokenUsage: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    presignDownload.mockResolvedValue("https://s3.example.invalid/clip.mp4");

    const root = await open(realProject());
    byTestId(root, "generate-scene-video").click();
    await flush();

    // The request really is a per-scene VIDEO generation…
    expect(createGeneration).toHaveBeenCalledTimes(1);
    expect(createGeneration.mock.calls[0]![0]).toMatchObject({
      kind: "video",
      projectId: "psalm-121",
      sceneId: inspected.id,
      input: { prompt: inspected.visualPrompt },
    });
    // …and the poll it starts carries the 25-minute budget explicitly. The literal is
    // asserted rather than imported: importing the constant would make the test agree with
    // whatever the module says, including `undefined`.
    expect(pollGenerationUntilTerminal).toHaveBeenCalledTimes(1);
    expect(pollGenerationUntilTerminal.mock.calls[0]).toEqual([
      "gen-vid-1",
      { timeoutMs: 1_500_000 },
    ]);
  });
});
