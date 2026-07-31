import { describe, expect, it } from "vitest";

import {
  hydrateStoryboard,
  serializeManifest,
} from "@/lib/studio/manifest-adapter";
import { initialStudioState, studioReducer } from "@/lib/studio/reducer";
import { ProjectManifestSchema, type ProjectManifest } from "@/lib/api/contracts";
import type { StudioProject } from "@/lib/studio/project";

/**
 * E-SH2'S ROUND TRIP, IN PURE CODE — the executable form of a diagnosis.
 * =====================================================================
 *
 * On 2026-07-30 `studio-hydration.e2e.ts` E-SH2 executed for the first time in its
 * existence (it had previously guarded its whole body on an env var, and vitest counts a
 * silent `return` as a pass) and failed after 118 s with
 *
 *     expected 'And God saw the light, that it was go…' to contain 'Persisted edit ms8kh8jqapoqqs'
 *
 * Everything before that assertion had passed: the commit settled clean, `data-dirty` went
 * `true` on the edit and back to `false` on the commit, zero `commit-error`. Two
 * hypotheses fitted, and they call for opposite fixes:
 *
 *   (a) the commit payload never carried the edit — `serializeManifest` builds its result
 *       field-by-field with no `...base` spread, so an unnamed field IS dropped on every
 *       commit, and this codebase has shipped that exact bug before;
 *   (b) the re-opened page was showing a DIFFERENT SCENE, and nothing was lost at all.
 *
 * It is (b). Settled first against git — the fixture repo
 * `ashtable/supagloo-e2e-delete-me-hydrate-edit-ms8kh9fca9d2d735`, working branch
 * `v0.0.1`, commit `71cb0f5` "Update scene: The Creation of Light", whose entire diff to
 * `supagloo.project.json` is `scenes[0].scriptText` → `"Persisted edit ms8kh8jqapoqqs"` —
 * and reproduced here so the answer survives the fixture repo being archived.
 *
 * These tests drive the REAL reducer and the REAL adapter through E-SH2's exact sequence.
 * No browser, no stack, no GitHub, ~1 ms. Their point is not that the round trip works
 * (`manifest-adapter.test.ts` covers that): it is to hold the DIFFERENCE between the two
 * hypotheses, so a future reading of the same symptom does not start by rewriting a
 * serializer that was never at fault.
 */

/** The manifest E-SH2's first commit actually wrote (generated storyboard, Genesis 1). */
const COMMITTED: ProjectManifest = {
  manifestVersion: 1,
  composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
  scenes: [
    {
      id: "s1",
      name: "The Creation of Light",
      scriptText: "And God said, Let there be light: and there was light.",
      reference: "Genesis 1:3",
      translation: "King James Version",
      visualPrompt: "A pitch-black screen suddenly explodes with a warm light flare.",
      durationSeconds: 6,
      captions: true,
    },
    {
      id: "s2",
      name: "Separation of Light and Dark",
      scriptText:
        "And God saw the light, that it was good: and God divided the light from the darkness.",
      reference: "Genesis 1:4",
      translation: "King James Version",
      visualPrompt: "Golden light cleaving a field of darkness.",
      durationSeconds: 7,
      captions: true,
    },
    {
      id: "s3",
      name: "The First Day",
      scriptText:
        "And God called the light Day, and the darkness he called Night. And the evening and the morning were the first day.",
      reference: "Genesis 1:5",
      translation: "King James Version",
      visualPrompt: "Dawn breaking over a formless sea.",
      durationSeconds: 8,
      captions: true,
    },
  ],
  narratorVoice: {
    description: "A deep, authoritative, and warm masculine voice with a slow pace.",
    label: "The Narrator",
    assetKey: null,
  },
  music: { style: "Cinematic, swelling orchestral", assetKey: null },
};

const EDIT = "Persisted edit ms8kh8jqapoqqs";

function projectFrom(manifest: ProjectManifest): StudioProject {
  return {
    id: "cuid-genesis",
    slug: "genesis-1",
    projectName: "genesis-1",
    repo: "ashtable/genesis-1",
    versionBranch: "v0.0.1",
    storyboard: hydrateStoryboard(manifest),
    manifest,
  };
}

/**
 * The editing session as E-SH2 leaves it: the storyboard arrived via a generation
 * (`STORYBOARD_GENERATED`, which selects `scenes[0]`), then the script was typed.
 * Returns the manifest that Commit would POST.
 */
function commitAnEditAfterGenerating(): {
  editedSceneId: string;
  committed: ProjectManifest;
} {
  let state = initialStudioState(projectFrom(COMMITTED));
  state = studioReducer(state, {
    type: "STORYBOARD_GENERATED",
    storyboard: hydrateStoryboard(COMMITTED),
  });
  state = studioReducer(state, { type: "EDIT_SCRIPT", script: EDIT });
  return {
    editedSceneId: state.selectedSceneId,
    committed: serializeManifest(state.storyboard, COMMITTED),
  };
}

describe("E-SH2's edit → commit → re-open round trip", () => {
  it("U-RT1: HYPOTHESIS (a) IS FALSE — the commit payload carries the edit, on the edited scene", () => {
    // The single most load-bearing assertion in this file. If `serializeManifest` had
    // dropped the script the way it drops an unnamed field, this is where it would show,
    // and the whole diagnosis would invert.
    const { editedSceneId, committed } = commitAnEditAfterGenerating();
    expect(editedSceneId).toBe("s1");
    expect(committed.scenes.find((s) => s.id === "s1")?.scriptText).toBe(EDIT);
    // …and it is a manifest the api's 422 boundary accepts, so "the commit succeeded"
    // and "the edit is in it" are not in tension.
    expect(ProjectManifestSchema.safeParse(committed).success).toBe(true);
  });

  it("U-RT2: nothing else moved — the other scenes and every non-UI field survive the commit", () => {
    // The four/five/seven-mirror class of defect is silent and TOTAL: no error, no partial
    // write. So the absence of collateral damage is asserted rather than inferred from the
    // one field that was checked. Scene 2 in particular is the one the failing assertion
    // read, and its being untouched is exactly why it still held the generated line.
    const { committed } = commitAnEditAfterGenerating();
    expect(committed.scenes.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(committed.scenes[1]).toEqual(COMMITTED.scenes[1]);
    expect(committed.scenes[2]).toEqual(COMMITTED.scenes[2]);
    expect(committed.composition).toEqual(COMMITTED.composition);
    expect(committed.narratorVoice).toEqual(COMMITTED.narratorVoice);
    expect(committed.music).toEqual(COMMITTED.music);
    // The edited scene keeps everything but its script.
    expect(committed.scenes[0]).toEqual({ ...COMMITTED.scenes[0], scriptText: EDIT });
  });

  it("U-RT3: HYPOTHESIS (b) IS TRUE — a fresh re-open opens on a DIFFERENT scene than the edit", () => {
    // The whole failure, reproduced in three lines. `STORYBOARD_GENERATED` selects
    // `scenes[0]`; `initialStudioState` selects `scenes[1]`. Both are deliberate, and
    // together they mean "the scene the editor was on" and "the scene a re-open shows"
    // are different scenes.
    const { editedSceneId, committed } = commitAnEditAfterGenerating();
    const reopened = initialStudioState(projectFrom(committed));
    expect(editedSceneId).toBe("s1");
    expect(reopened.selectedSceneId).toBe("s2");
    expect(reopened.selectedSceneId).not.toBe(editedSceneId);
  });

  it("U-RT4: the re-opened studio reproduces the failing assertion's string verbatim", () => {
    // Reading the re-opened page's selected scene returns Genesis 1:4 — character for
    // character the value vitest printed. That match is what makes this a reproduction
    // rather than a plausible story.
    const { committed } = commitAnEditAfterGenerating();
    const reopened = initialStudioState(projectFrom(committed));
    const shown = reopened.storyboard.scenes.find(
      (s) => s.id === reopened.selectedSceneId,
    );
    expect(shown?.script.startsWith("And God saw the light, that it was go")).toBe(true);
    expect(shown?.script).not.toContain(EDIT);
  });

  it("U-RT5: …and the edit IS there, on the scene it was made to, after the manifest re-read", () => {
    // The positive control, and the assertion E-SH2 should have been making. Without it
    // U-RT4 alone would be equally consistent with the edit having been lost.
    const { editedSceneId, committed } = commitAnEditAfterGenerating();
    const reopened = initialStudioState(projectFrom(committed));
    const edited = reopened.storyboard.scenes.find((s) => s.id === editedSceneId);
    expect(edited?.script).toBe(EDIT);
  });
});
