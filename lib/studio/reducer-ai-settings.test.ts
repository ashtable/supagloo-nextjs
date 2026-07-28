import { describe, expect, it } from "vitest";

import {
  initialStudioState,
  studioReducer,
  videoSlot,
  videoGenerationOutcome,
  type StudioState,
} from "./reducer";
import { DEMO_STORYBOARD } from "./storyboard";
import type { StudioProject } from "./project";
import type { AiGenerationDto } from "../api/contracts";

/**
 * U-AS11..U-AS13 (the settings actions) and U-SV1 (per-scene video).
 *
 * The one that matters most is U-SV1. `visualAssetKind` has been READ by the renderer
 * (`isVideo ? <OffthreadVideo> : <Img>`) and by the preview since the render-bug run, and
 * written by NOTHING outside test fixtures — `setSceneVisual` wrote only the key. That was
 * harmless while the studio could not request a video at all. Item 4 makes it requestable,
 * and the moment it does, a generated MP4 whose scene has no `visualAssetKind` is fed to
 * `<Img>` and the render shows nothing. So the kind has to be written in the SAME action
 * as the key — never as a follow-up, which a failed dispatch or an early return could skip.
 */

const PROJECT: StudioProject = {
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
};

const start = (): StudioState => initialStudioState(PROJECT);
const sceneById = (s: StudioState, id: string) =>
  s.storyboard.scenes.find((x) => x.id === id)!;

const succeeded = (assetKey: string): AiGenerationDto => ({
  id: "gen-1",
  projectId: "p1",
  sceneId: "s1",
  kind: "video",
  provider: "openrouter",
  model: "vendor/video",
  status: "succeeded",
  resultJson: null,
  resultAssetKey: assetKey,
  error: null,
  tokenUsage: null,
  createdAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
});

describe("AI settings actions (U-AS11..13)", () => {
  it("U-AS11: SET_AI_PROVIDER records the choice and DIRTIES the project", () => {
    // Dirty is the whole persistence mechanism: the setting lives in the manifest, and
    // the manifest only reaches the repo through Commit. A settings change that left the
    // project clean would be a control the Commit button refuses to save.
    const next = studioReducer(start(), {
      type: "SET_AI_PROVIDER",
      kind: "image",
      provider: "gloo",
    });
    expect(next.storyboard.aiSettings?.image?.provider).toBe("gloo");
    expect(next.dirty).toBe(true);
  });

  it("U-AS12: SET_AI_MODEL pins a model under the current provider", () => {
    const withProvider = studioReducer(start(), {
      type: "SET_AI_PROVIDER",
      kind: "image",
      provider: "gloo",
    });
    const next = studioReducer(withProvider, {
      type: "SET_AI_MODEL",
      kind: "image",
      model: "gloo-vendor-flux",
    });
    expect(next.storyboard.aiSettings?.image).toEqual({
      provider: "gloo",
      model: "gloo-vendor-flux",
    });
  });

  it("U-AS13: SET_FAITH_ALIGNMENT stores the value, and null clears it", () => {
    const set = studioReducer(start(), {
      type: "SET_FAITH_ALIGNMENT",
      value: "catholic",
    });
    expect(set.storyboard.aiSettings?.faithAlignment).toBe("catholic");
    expect(set.dirty).toBe(true);

    const cleared = studioReducer(set, { type: "SET_FAITH_ALIGNMENT", value: null });
    expect(cleared.storyboard.aiSettings?.faithAlignment).toBeUndefined();
  });

  it("U-AS13b: switching the last Gloo kind away also clears the faith alignment", () => {
    // The reducer must apply the same rule the pure model states, or the manifest keeps a
    // setting nothing reads which silently comes back into force on the next switch.
    const withGloo = studioReducer(
      studioReducer(start(), { type: "SET_AI_PROVIDER", kind: "image", provider: "gloo" }),
      { type: "SET_FAITH_ALIGNMENT", value: "catholic" },
    );
    expect(withGloo.storyboard.aiSettings?.faithAlignment).toBe("catholic");

    const back = studioReducer(withGloo, {
      type: "SET_AI_PROVIDER",
      kind: "image",
      provider: "openrouter",
    });
    expect(back.storyboard.aiSettings?.faithAlignment).toBeUndefined();
  });

  it("U-AS15: MODELS_LOADED stores the catalogue, dirties nothing, and CANNOT touch a pick", () => {
    // Two claims, and the second is the load-bearing one.
    //
    // (1) A background read is not an edit. Dirtying here would arm the Commit button the
    //     moment the studio opened, and (worse) make "All changes committed" a lie.
    //
    // (2) This action is the ONLY defence against the stale-response race the §2.2 plan
    //     called `U-INS1`: a catalogue request in flight while the user picks a model, and
    //     landing after. That race is prevented STRUCTURALLY, not by timing — the case
    //     returns `{ ...state, modelCatalogue }` and writes no other key, so there is no
    //     ordering that could exhibit it and no timing test that could prove it. The
    //     invariant is "MODELS_LOADED does not write `storyboard.aiSettings`", and it is
    //     assertable right here, on the one line that could break it. See the header of
    //     `tests/unit/ai-settings-panel.test.tsx`.
    const CATALOGUE = {
      // A catalogue that does not even CONTAIN the picked model — the worst case for a
      // reducer that tried to reconcile the two.
      models: [
        {
          id: "vendor/other",
          provider: "openrouter" as const,
          label: "Other",
          kinds: ["image" as const],
          pricing: null,
        },
      ],
      providers: { gloo: true, openrouter: true },
      defaults: { image: { provider: "openrouter" as const, model: "vendor/other" } },
    };

    // (1), from a clean project.
    const clean = studioReducer(start(), { type: "MODELS_LOADED", catalogue: CATALOGUE });
    expect(clean.modelCatalogue).not.toBeNull();
    expect(clean.dirty).toBe(false);

    // (2), underneath a pick the user has already made.
    const picked = studioReducer(
      studioReducer(start(), { type: "SET_AI_PROVIDER", kind: "image", provider: "gloo" }),
      { type: "SET_AI_MODEL", kind: "image", model: "gloo-vendor-flux" },
    );
    const pick = picked.storyboard.aiSettings;
    expect(pick?.image).toEqual({ provider: "gloo", model: "gloo-vendor-flux" });

    const next = studioReducer(picked, { type: "MODELS_LOADED", catalogue: CATALOGUE });
    expect(next.modelCatalogue).not.toBeNull();
    // Unchanged, not `false`: the picks above legitimately dirtied the project, and a
    // background read must neither set nor CLEAR that.
    expect(next.dirty).toBe(picked.dirty);
    // Identity, not deep equality: the object the user's pick lives in is not rebuilt.
    expect(next.storyboard.aiSettings).toBe(pick);
  });
});

describe("per-scene video (U-SV1)", () => {
  it("U-SV1: VIDEO_GENERATED writes the asset key AND the kind in ONE action", () => {
    const id = DEMO_STORYBOARD.scenes[0].id;
    const next = studioReducer(start(), {
      type: "VIDEO_GENERATED",
      sceneId: id,
      assetKey: "projects/p1/assets/gen-1",
      url: "https://minio.example/signed",
    });
    const scene = sceneById(next, id);
    expect(scene.visualAssetKey).toBe("projects/p1/assets/gen-1");
    // The half that has never been written by production code. Without it the manifest
    // describes an MP4 and the renderer feeds it to <Img>.
    expect(scene.visualAssetKind).toBe("video");
    expect(scene.visualUrl).toBe("https://minio.example/signed");
    expect(next.dirty).toBe(true);
    expect(next.generations[videoSlot(id)]).toBeUndefined();
  });

  it("U-SV1b: a later IMAGE_GENERATED on the same scene resets the kind to image", () => {
    // The reverse direction, and just as silent: rerolling a still onto a scene that was
    // previously a clip would otherwise leave `visualAssetKind: "video"` in place and send
    // a PNG through <OffthreadVideo>, which refuses stills outright.
    const id = DEMO_STORYBOARD.scenes[0].id;
    const asVideo = studioReducer(start(), {
      type: "VIDEO_GENERATED",
      sceneId: id,
      assetKey: "projects/p1/assets/gen-1",
      url: null,
    });
    const asImage = studioReducer(asVideo, {
      type: "IMAGE_GENERATED",
      sceneId: id,
      assetKey: "projects/p1/assets/gen-2",
      url: null,
    });
    expect(sceneById(asImage, id).visualAssetKind).toBe("image");
  });

  it("U-SV1c: videoGenerationOutcome needs a resultAssetKey, else it is a failure", () => {
    expect(videoGenerationOutcome("s1", succeeded("k"), "u")).toEqual({
      type: "VIDEO_GENERATED",
      sceneId: "s1",
      assetKey: "k",
      url: "u",
    });

    for (const gen of [
      null,
      { ...succeeded("k"), resultAssetKey: null },
      { ...succeeded("k"), status: "failed" as const, error: "boom" },
    ]) {
      const action = videoGenerationOutcome("s1", gen, null);
      expect(action.type).toBe("GENERATION_FAILED");
    }
  });

  it("U-SV1d: the video slot is scene-scoped, like image, not global like music", () => {
    // Video is per-scene by definition (item 4 is "a video per scene"), so two scenes must
    // be able to generate concurrently without one's in-flight state hiding the other's.
    expect(videoSlot("s1")).not.toBe(videoSlot("s2"));
  });
});
