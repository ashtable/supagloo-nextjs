import { describe, expect, it } from "vitest";
import {
  OTHER_TRANSLATION,
  PUBLISH_TRANSLATION_DEFAULTS,
  buildProjectOptions,
  canSubmitPublish,
  manifestPrefill,
  translationOptions,
} from "./publish-options";
import type {
  ProjectDto,
  ProjectManifest,
  ProjectVersionDto,
  RenderJobDto,
} from "../api/contracts";

/**
 * Turn 16b's PROJECT ▾ / TRANSLATION ▾ / submit-gate logic (plan slice C8, §4.9).
 *
 * Everything here is pure, and that is the whole point: the dialog's three genuinely
 * decidable questions — *which renders may I publish and what are they called*, *what
 * belongs in the translation dropdown*, and *may this form be submitted* — are answered
 * without a DOM, a fetch or a React render.
 */

function render(over: Partial<RenderJobDto> & { id: string }): RenderJobDto {
  return {
    projectId: "prj_1",
    versionId: "ver_1",
    status: "completed",
    framesDone: 300,
    framesTotal: 300,
    outputSpec: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16", codec: "h264" },
    outputAssetKey: `renders/${over.id}/output.mp4`,
    thumbnailAssetKey: `renders/${over.id}/thumb.jpg`,
    runInBackground: false,
    error: null,
    createdAt: "2026-07-20T10:00:00.000Z",
    startedAt: "2026-07-20T10:00:00.000Z",
    completedAt: "2026-07-20T10:05:00.000Z",
    ...over,
  };
}

function project(over: Partial<ProjectDto> & { id: string; slug: string }): ProjectDto {
  return {
    name: over.slug,
    repoOwner: "ashsrinivas",
    repoName: over.slug,
    repoVisibility: "private",
    createdFrom: "blank",
    currentBranch: "v0.0.3",
    thumbnailAssetKey: null,
    lastRenderJobId: null,
    lastOpenedAt: "2026-07-20T10:00:00.000Z",
    createdAt: "2026-07-01T10:00:00.000Z",
    ...over,
  };
}

function version(
  over: Partial<ProjectVersionDto> & { id: string; projectId: string; semver: string },
): ProjectVersionDto {
  return {
    branchName: `v${over.semver}`,
    state: "published",
    commitMessage: null,
    autoSummary: null,
    changedFiles: [],
    headCommitSha: null,
    prNumber: null,
    prUrl: null,
    publishedAt: "2026-07-20T10:00:00.000Z",
    ...over,
  };
}

function manifest(scenes: { reference: string; translation: string }[]): ProjectManifest {
  return {
    manifestVersion: 1,
    composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
    narratorVoice: { description: "warm" },
    scenes: scenes.map((s, i) => ({
      id: `s${i}`,
      name: `Scene ${i}`,
      scriptText: "…",
      reference: s.reference,
      translation: s.translation,
      visualPrompt: "…",
      durationSeconds: 4,
      captions: true,
    })),
  };
}

// ── buildProjectOptions — the D8 client-side join ────────────────────────────

describe("buildProjectOptions", () => {
  it("U-PO1: labels a render \"<slug> · v<semver>\" from the three sources", () => {
    const options = buildProjectOptions({
      renders: [render({ id: "rj_1", projectId: "p1", versionId: "v1" })],
      projects: [project({ id: "p1", slug: "psalm-121" })],
      versions: new Map([["p1", [version({ id: "v1", projectId: "p1", semver: "0.0.2" })]]]),
    });

    expect(options).toHaveLength(1);
    expect(options[0].label).toBe("psalm-121 · v0.0.2");
    expect(options[0].renderId).toBe("rj_1");
    expect(options[0].projectId).toBe("p1");
    expect(options[0].thumbnailAssetKey).toBe("renders/rj_1/thumb.jpg");
  });

  it("U-PO2: a render whose project is missing still yields an option with a stable fallback label", () => {
    // A publishable render must NEVER become invisible because a join missed — the
    // render IS publishable; the label is only how we name it.
    const input = {
      renders: [render({ id: "rj_orphan", projectId: "p_gone", versionId: "v_gone" })],
      projects: [] as ProjectDto[],
      versions: new Map<string, ProjectVersionDto[]>(),
    };
    const options = buildProjectOptions(input);

    expect(options).toHaveLength(1);
    expect(options[0].renderId).toBe("rj_orphan");
    expect(options[0].label).toContain("p_gone");
    // Stable: the same input yields the same label, twice.
    expect(buildProjectOptions(input)[0].label).toBe(options[0].label);
    // And it is distinguishable from a fully-joined one.
    expect(options[0].label).not.toBe("p_gone · v");

    // Half a join (project resolved, version not) is still an option.
    const half = buildProjectOptions({
      renders: [render({ id: "rj_1", projectId: "p1", versionId: "v_gone" })],
      projects: [project({ id: "p1", slug: "psalm-121" })],
      versions: new Map([["p1", [version({ id: "v1", projectId: "p1", semver: "0.0.2" })]]]),
    });
    expect(half).toHaveLength(1);
    expect(half[0].label.startsWith("psalm-121 · ")).toBe(true);
    expect(half[0].label).not.toBe("psalm-121 · v0.0.2");
  });

  it("U-PO3: options are deduped per render and ordered newest-completed first", () => {
    const dup = render({ id: "rj_2", completedAt: "2026-07-22T00:00:00.000Z" });
    const options = buildProjectOptions({
      renders: [
        render({ id: "rj_1", completedAt: "2026-07-21T00:00:00.000Z" }),
        dup,
        { ...dup },
        render({ id: "rj_3", completedAt: "2026-07-23T00:00:00.000Z" }),
        // Not completed → not publishable → not offered at all.
        render({ id: "rj_x", status: "encoding", completedAt: null }),
        // Completed but never resolved a frame total → the api would refuse it.
        render({ id: "rj_y", framesTotal: 0 }),
        // Completed with no output object → likewise.
        render({ id: "rj_z", outputAssetKey: null }),
      ],
      projects: [project({ id: "prj_1", slug: "psalm-121" })],
      versions: new Map([
        ["prj_1", [version({ id: "ver_1", projectId: "prj_1", semver: "0.0.2" })]],
      ]),
    });

    expect(options.map((o) => o.renderId)).toEqual(["rj_3", "rj_2", "rj_1"]);
  });
});

// ── translationOptions — D10, no closed enum anywhere ────────────────────────

describe("translationOptions", () => {
  it("U-PO4: is the union of {current} ∪ {KJV,BSB} ∪ {manifest}, deduped, in that order, always ending with the Other… escape", () => {
    expect(PUBLISH_TRANSLATION_DEFAULTS).toEqual(["KJV", "BSB"]);

    expect(translationOptions({ current: "NIV", manifest: "NLT" })).toEqual([
      "NIV",
      "KJV",
      "BSB",
      "NLT",
      OTHER_TRANSLATION,
    ]);

    // Deduped, and the FIRST occurrence keeps its position.
    expect(translationOptions({ current: "BSB", manifest: "KJV" })).toEqual([
      "BSB",
      "KJV",
      OTHER_TRANSLATION,
    ]);

    // Nothing to add: still the two documented defaults + the escape.
    expect(translationOptions({ current: "", manifest: null })).toEqual([
      "KJV",
      "BSB",
      OTHER_TRANSLATION,
    ]);

    // Whitespace is not a translation.
    expect(translationOptions({ current: "   ", manifest: "  " })).toEqual([
      "KJV",
      "BSB",
      OTHER_TRANSLATION,
    ]);

    // The escape is always last, never duplicated, even if someone types it.
    const typed = translationOptions({ current: OTHER_TRANSLATION, manifest: null });
    expect(typed[typed.length - 1]).toBe(OTHER_TRANSLATION);
    expect(typed.filter((t) => t === OTHER_TRANSLATION)).toHaveLength(1);
  });
});

// ── canSubmitPublish — the INVENTED gate (the design never draws it) ─────────

describe("canSubmitPublish", () => {
  const ready = {
    renderId: "rj_1",
    title: "The Lord Is My Shepherd",
    passage: "Psalm 23:1–6",
    consent: true,
    busy: false,
  };

  it("U-PO5: is FALSE without consent even when title and passage are filled", () => {
    expect(canSubmitPublish(ready)).toBe(true);
    expect(canSubmitPublish({ ...ready, consent: false })).toBe(false);
  });

  it("U-PO6: is FALSE for a whitespace-only title or passage, and FALSE while busy", () => {
    expect(canSubmitPublish({ ...ready, title: "   " })).toBe(false);
    expect(canSubmitPublish({ ...ready, title: "" })).toBe(false);
    expect(canSubmitPublish({ ...ready, passage: "\t\n " })).toBe(false);
    expect(canSubmitPublish({ ...ready, passage: "" })).toBe(false);
    expect(canSubmitPublish({ ...ready, busy: true })).toBe(false);
    // And there must be something to publish.
    expect(canSubmitPublish({ ...ready, renderId: null })).toBe(false);
  });
});

// ── manifestPrefill — the non-blocking, never-narrower prefill ───────────────

describe("manifestPrefill", () => {
  it("U-PO7: prefills the passage only when every scene names the SAME reference", () => {
    // One scene: its reference IS the whole passage.
    expect(manifestPrefill(manifest([{ reference: "Psalm 23:1", translation: "KJV" }]))).toEqual(
      { passage: "Psalm 23:1", translation: "KJV" },
    );

    // Every scene agrees → still the whole passage.
    expect(
      manifestPrefill(
        manifest([
          { reference: "Psalm 23:1–6", translation: "KJV" },
          { reference: "Psalm 23:1–6", translation: "KJV" },
        ]),
      ),
    ).toEqual({ passage: "Psalm 23:1–6", translation: "KJV" });

    // Scenes disagree: scene 1's `Psalm 23:1` is NARROWER than what the video covers,
    // so prefilling it would put a false claim in a field that ends up on a public card.
    expect(
      manifestPrefill(
        manifest([
          { reference: "Psalm 23:1", translation: "KJV" },
          { reference: "Psalm 23:2", translation: "KJV" },
        ]),
      ),
    ).toEqual({ passage: null, translation: "KJV" });

    // Mixed translations are equally unusable as ONE value.
    expect(
      manifestPrefill(
        manifest([
          { reference: "Psalm 23:1", translation: "KJV" },
          { reference: "Psalm 23:1", translation: "BSB" },
        ]),
      ),
    ).toEqual({ passage: "Psalm 23:1", translation: null });

    // No scenes at all (a freshly-scaffolded project) prefills nothing.
    expect(manifestPrefill(manifest([]))).toEqual({ passage: null, translation: null });
    expect(manifestPrefill(null)).toEqual({ passage: null, translation: null });
  });
});
