import { describe, expect, it } from "vitest";

import { initLog, isLogComplete } from "../project-wizard/provisioning-log";
// RED until `lib/studio/render-model.ts` exists (Step 9 → GREEN). The pure
// 14c render model: a frame counter climbing toward the composition's total plus
// a 4-stage checklist (reusing the LogSequence sequencer), and the derived spec
// line. Missing module → clean "Cannot find module './render-model'" RED.
import {
  IDLE_RENDER_RUN_GATE,
  RENDER_FRAMES_PER_TICK,
  RENDER_STAGE_ROWS,
  RENDER_TICK_MS,
  abandonRenderRun,
  advanceRender,
  canStartRender,
  finishRenderRun,
  initRender,
  isActiveRenderRun,
  isRenderComplete,
  renderPercent,
  renderSpecLine,
  startRenderRun,
  type RenderState,
} from "./render-model";

/** A RenderState fixed at `framesDone`, for the pure percent math. */
const at = (framesDone: number): RenderState => ({
  ...initRender(900, "v0.0.2"),
  framesDone,
});

describe("initRender", () => {
  it("U-RM1: seeds 0 frames done, the 4 queued stages, not backgrounded", () => {
    const r = initRender(900, "v0.0.2");
    expect(r.framesDone).toBe(0);
    expect(r.totalFrames).toBe(900);
    expect(r.publishedVersion).toBe("v0.0.2");
    expect(r.backgrounded).toBe(false);
    expect(r.stages).toEqual(initLog(RENDER_STAGE_ROWS));
    expect(RENDER_STAGE_ROWS).toEqual([
      // D7 (plan §1): the wireframe shows bundle-then-synth, but Remotion snapshots
      // public/ assets at BUNDLE time, so the shipped worker (and design-delta §6c,
      // and dbos render.order.test.ts) synthesizes FIRST. The checklist follows the
      // implementation — a checklist that reports a false order is worse than a
      // two-row deviation from a wireframe.
      "Synthesized narration & music",
      "Bundled composition",
      "Encoding video",
      "Upload & finalize share link",
    ]);
  });
});

describe("advanceRender", () => {
  it("U-RM2: each tick climbs framesDone by RENDER_FRAMES_PER_TICK and clamps at the total", () => {
    const first = advanceRender(initRender(900, "v0.0.2"));
    expect(first.framesDone).toBe(Math.min(RENDER_FRAMES_PER_TICK, 900));
    // pure — the input is untouched
    expect(initRender(900, "v0.0.2").framesDone).toBe(0);

    // drive to completion; frames clamp at the total, never overshoot
    let r = initRender(900, "v0.0.2");
    for (let i = 0; i < 100_000 && !isRenderComplete(r); i++) r = advanceRender(r);
    expect(r.framesDone).toBe(900);
    expect(isRenderComplete(r)).toBe(true);
  });

  it("U-RM3: the stage checklist advances monotonically and all complete at the end", () => {
    let r = initRender(900, "v0.0.2");
    expect(r.stages.activeIndex).toBe(0);
    expect(isLogComplete(r.stages)).toBe(false);

    let prev = r.stages.activeIndex;
    for (let i = 0; i < 100_000 && !isRenderComplete(r); i++) {
      r = advanceRender(r);
      expect(r.stages.activeIndex).toBeGreaterThanOrEqual(prev); // never rewinds
      prev = r.stages.activeIndex;
    }
    expect(isLogComplete(r.stages)).toBe(true);
  });
});

describe("renderPercent", () => {
  it("U-RM4: percent = round(framesDone / total * 100)", () => {
    expect(renderPercent(at(0))).toBe(0);
    expect(renderPercent(at(450))).toBe(50);
    expect(renderPercent(at(900))).toBe(100);
    // rounds (not truncates): 5/900 → 0.55 → 1; 1/900 → 0.11 → 0
    expect(renderPercent(at(5))).toBe(1);
    expect(renderPercent(at(1))).toBe(0);
    // D1: an unknown total is 0%, NOT 100% — a real render sits at framesTotal 0 from
    // creation until the worker's bundleComposition resolves the composition, and the
    // overlay must show an indeterminate bar there, never a full one.
    expect(renderPercent({ ...at(0), totalFrames: 0 })).toBe(0);
  });
});

describe("renderSpecLine", () => {
  it("U-RM5: composes resolution·aspect·fps·codec from aspectDimensions", () => {
    expect(renderSpecLine("9:16", 30)).toBe("1080×1920 · 9:16 · 30fps · H.264");
    expect(renderSpecLine("16:9", 30)).toBe("1920×1080 · 16:9 · 30fps · H.264");
    expect(renderSpecLine("1:1", 30)).toBe("1080×1080 · 1:1 · 30fps · H.264");
  });
});

describe("render ticker constants", () => {
  it("U-RM6: the frames-per-tick and tick interval are positive", () => {
    expect(RENDER_FRAMES_PER_TICK).toBeGreaterThan(0);
    expect(RENDER_TICK_MS).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task #38 — the REAL (polled) render model. The mock ticker above stays: it is
// still the live path for `NEXT_PUBLIC_SUPAGLOO_DEMO=1` catalog projects and is
// pinned by four running e2e specs (E-RND1..4). These add the polled-fixture
// mapping the plan row calls for.
// ─────────────────────────────────────────────────────────────────────────────

import {
  initRealRender,
  renderStageRows,
  renderProgressLabel,
  renderFrameCountLabel,
  renderSpecLineFromSpec,
  renderEtaSeconds,
  isRenderTerminal,
  applyRenderJob,
  pickRenderVersion,
  renderOutputSpecFor,
  type RenderOutputSpecLike,
} from "./render-model";

const SPEC: RenderOutputSpecLike = {
  width: 1080,
  height: 1920,
  fps: 30,
  aspectRatio: "9:16",
  codec: "h264",
};

/** A real RenderState at an arbitrary polled position. */
function real(over: Partial<ReturnType<typeof initRealRender>> = {}) {
  return { ...initRealRender("v0.0.2"), ...over };
}

describe("initRealRender", () => {
  it("U-RM7: seeds a real render with no job yet, nothing done, not backgrounded", () => {
    const r = initRealRender("v0.0.2");
    expect(r.mode).toBe("real");
    expect(r.publishedVersion).toBe("v0.0.2");
    expect(r.renderJobId).toBeNull();
    expect(r.status).toBeNull();
    expect(r.outputSpec).toBeNull();
    expect(r.framesDone).toBe(0);
    expect(r.totalFrames).toBe(0);
    expect(r.started).toBe(false);
    expect(r.error).toBeNull();
    expect(r.downloadUrl).toBeNull();
    expect(r.backgrounded).toBe(false);
  });
});

describe("renderStageRows", () => {
  const labels = (rows: { label: string }[]) => rows.map((r) => r.label);
  const statuses = (rows: { status: string }[]) => rows.map((r) => r.status);

  it("U-RM8a: every status yields the 4 designed rows in the D7 order", () => {
    for (const s of [
      "queued",
      "synthesizing",
      "bundling",
      "encoding",
      "uploading",
      "completed",
      "failed",
      "canceled",
    ] as const) {
      expect(labels(renderStageRows(s)), s).toEqual([...RENDER_STAGE_ROWS]);
    }
  });

  it("U-RM8b: the checklist walks synth → bundle → encode → upload and never rewinds", () => {
    expect(statuses(renderStageRows("queued"))).toEqual([
      "queued",
      "queued",
      "queued",
      "queued",
    ]);
    expect(statuses(renderStageRows("synthesizing"))).toEqual([
      "active",
      "queued",
      "queued",
      "queued",
    ]);
    expect(statuses(renderStageRows("bundling"))).toEqual([
      "completed",
      "active",
      "queued",
      "queued",
    ]);
    expect(statuses(renderStageRows("encoding"))).toEqual([
      "completed",
      "completed",
      "active",
      "queued",
    ]);
    expect(statuses(renderStageRows("uploading"))).toEqual([
      "completed",
      "completed",
      "completed",
      "active",
    ]);
    expect(statuses(renderStageRows("completed"))).toEqual([
      "completed",
      "completed",
      "completed",
      "completed",
    ]);
  });

  it("U-RM8c: a failure marks the stage it died in, keeps earlier stages done, leaves later ones queued", () => {
    // failed while encoding (the 3rd row)
    expect(statuses(renderStageRows("failed", "encoding"))).toEqual([
      "completed",
      "completed",
      "failed",
      "queued",
    ]);
    // canceled while still synthesizing (the 1st row)
    expect(statuses(renderStageRows("canceled", "synthesizing"))).toEqual([
      "failed",
      "queued",
      "queued",
      "queued",
    ]);
    // no last-known phase → the first row carries the failure
    expect(statuses(renderStageRows("failed"))[0]).toBe("failed");
  });
});

describe("renderProgressLabel", () => {
  it("U-RM9: splits the two `queued` states on `started` (task 36 handed this to 38)", () => {
    // queued with NO startedAt — still waiting for a worker (the render queue is 1/worker)
    expect(renderProgressLabel(real({ status: "queued", started: false }))).toBe(
      "Waiting for a render worker",
    );
    // queued WITH startedAt — markRenderStarted ran; the worker is cloning/installing
    expect(renderProgressLabel(real({ status: "queued", started: true }))).toBe(
      "Preparing your project",
    );
  });

  it("U-RM9b: names each working phase, and keeps the designed 'Encoding frames' copy for encoding", () => {
    expect(renderProgressLabel(real({ status: "synthesizing" }))).toBe(
      "Synthesizing narration & music",
    );
    expect(renderProgressLabel(real({ status: "bundling" }))).toBe(
      "Bundling composition",
    );
    expect(renderProgressLabel(real({ status: "encoding" }))).toBe("Encoding frames");
    expect(renderProgressLabel(real({ status: "uploading" }))).toBe(
      "Uploading & finalizing",
    );
  });

  it("U-RM9c: mock mode always reads 'Encoding frames' (unchanged wireframe copy)", () => {
    expect(renderProgressLabel(initRender(900, "v0.0.2"))).toBe("Encoding frames");
  });
});

describe("renderFrameCountLabel", () => {
  it("U-RM10: an unknown total renders an em-dash, a known total renders the real count", () => {
    expect(
      renderFrameCountLabel(real({ framesDone: 0, totalFrames: 0 })),
    ).toBe("0 / —");
    expect(
      renderFrameCountLabel(real({ framesDone: 612, totalFrames: 840 })),
    ).toBe("612 / 840");
    // mock mode is unchanged
    expect(renderFrameCountLabel(initRender(900, "v0.0.2"))).toBe("0 / 900");
  });
});

describe("renderPercent (real mode)", () => {
  it("U-RM11: 0 while the total is unknown, round(done/total*100) after, never over 100", () => {
    expect(renderPercent(real({ framesDone: 0, totalFrames: 0 }))).toBe(0);
    expect(renderPercent(real({ framesDone: 420, totalFrames: 840 }))).toBe(50);
    expect(renderPercent(real({ framesDone: 840, totalFrames: 840 }))).toBe(100);
    expect(renderPercent(real({ framesDone: 900, totalFrames: 840 }))).toBe(100);
  });
});

describe("renderSpecLineFromSpec", () => {
  it("U-RM12: renders the designed spec line from the SERVER's echoed spec", () => {
    expect(renderSpecLineFromSpec(SPEC)).toBe("1080×1920 · 9:16 · 30fps · H.264");
    expect(
      renderSpecLineFromSpec({ ...SPEC, width: 1920, height: 1080, aspectRatio: "16:9" }),
    ).toBe("1920×1080 · 16:9 · 30fps · H.264");
  });

  it("U-RM12b: an unmapped codec falls back to its raw value uppercased (never a lie)", () => {
    expect(renderSpecLineFromSpec({ ...SPEC, codec: "vp9" })).toBe(
      "1080×1920 · 9:16 · 30fps · VP9",
    );
  });
});

describe("renderEtaSeconds", () => {
  it("U-RM13: null until encoding has a measurable rate, then a plausible estimate", () => {
    // nothing encoded yet
    expect(renderEtaSeconds(real({ status: "encoding" }), 10_000)).toBeNull();
    // encoding started at t=0, 300 of 900 frames in 10s → 600 left at 30 fps → 20s
    const s = real({
      status: "encoding",
      framesDone: 300,
      totalFrames: 900,
      encodingSinceMs: 0,
    });
    expect(renderEtaSeconds(s, 10_000)).toBe(20);
    // an unknown total cannot produce an estimate
    expect(
      renderEtaSeconds(real({ status: "encoding", framesDone: 3, encodingSinceMs: 0 }), 1000),
    ).toBeNull();
  });
});

describe("applyRenderJob / isRenderTerminal / isRenderComplete", () => {
  const job = {
    id: "rj_1",
    projectId: "prj_1",
    versionId: "pv_1",
    status: "encoding" as const,
    framesDone: 100,
    framesTotal: 900,
    outputSpec: SPEC,
    outputAssetKey: null,
    thumbnailAssetKey: null,
    runInBackground: false,
    error: null,
    createdAt: "2026-07-24T10:00:00.000Z",
    startedAt: "2026-07-24T10:00:05.000Z",
    completedAt: null,
  };

  it("U-RM14a: applyRenderJob folds a polled DTO into the state (spec, frames, started, error)", () => {
    const next = applyRenderJob(real({ renderJobId: "rj_1" }), job, 5_000);
    expect(next.status).toBe("encoding");
    expect(next.framesDone).toBe(100);
    expect(next.totalFrames).toBe(900);
    expect(next.outputSpec).toEqual(SPEC);
    expect(next.started).toBe(true);
    expect(next.encodingSinceMs).toBe(5_000);
  });

  it("U-RM14b: encodingSinceMs is stamped ONCE (the first encoding sighting wins)", () => {
    const first = applyRenderJob(real({ renderJobId: "rj_1" }), job, 5_000);
    const later = applyRenderJob(first, { ...job, framesDone: 400 }, 9_000);
    expect(later.encodingSinceMs).toBe(5_000);
  });

  it("U-RM14c: terminal/complete key off `status` in real mode and off frames+stages in mock mode", () => {
    const done = applyRenderJob(
      real({ renderJobId: "rj_1" }),
      { ...job, status: "completed", framesDone: 900, completedAt: "2026-07-24T10:04:00.000Z" },
      1,
    );
    expect(isRenderComplete(done)).toBe(true);
    expect(isRenderTerminal(done)).toBe(true);

    for (const status of ["failed", "canceled"] as const) {
      const bad = applyRenderJob(real({ renderJobId: "rj_1" }), { ...job, status }, 1);
      expect(isRenderTerminal(bad)).toBe(true);
      expect(isRenderComplete(bad)).toBe(false);
    }

    expect(isRenderTerminal(real({ status: "encoding" }))).toBe(false);
    // a real render at framesDone 0 / totalFrames 0 must NOT read as complete
    expect(isRenderComplete(real())).toBe(false);

    // mock mode is unchanged
    let m = initRender(900, "v0.0.2");
    expect(isRenderComplete(m)).toBe(false);
    for (let i = 0; i < 100_000 && !isRenderComplete(m); i++) m = advanceRender(m);
    expect(isRenderComplete(m)).toBe(true);
  });
});

describe("pickRenderVersion / renderOutputSpecFor", () => {
  const versions = [
    { id: "pv_3", branchName: "v0.0.3" },
    { id: "pv_2", branchName: "v0.0.2" },
    { id: "pv_1", branchName: "v0.0.1" },
  ];

  it("U-RM15: prefers the just-published tag the 14c eyebrow names, not the new working branch", () => {
    // after publishing v0.0.2 the editor sits on v0.0.3 — but 14c renders v0.0.2
    expect(pickRenderVersion(versions, "v0.0.2", "v0.0.3")?.id).toBe("pv_2");
  });

  it("U-RM16: falls back to the working branch, then the newest version, then null", () => {
    expect(pickRenderVersion(versions, null, "v0.0.1")?.id).toBe("pv_1");
    // nothing matches → newest (the list is already semver-desc)
    expect(pickRenderVersion(versions, "v9.9.9", "v8.8.8")?.id).toBe("pv_3");
    expect(pickRenderVersion([], "v0.0.2", "v0.0.3")).toBeNull();
    expect(pickRenderVersion(null, "v0.0.2", "v0.0.3")).toBeNull();
  });

  it("U-RM17: renderOutputSpecFor derives the request spec from the aspect + composition fps", () => {
    expect(renderOutputSpecFor("9:16", 30)).toEqual({
      width: 1080,
      height: 1920,
      fps: 30,
      aspectRatio: "9:16",
      codec: "h264",
    });
    expect(renderOutputSpecFor("16:9", 24)).toEqual({
      width: 1920,
      height: 1080,
      fps: 24,
      aspectRatio: "16:9",
      codec: "h264",
    });
    // the sent codec is the machine value; the overlay shows the server's echo as H.264
    expect(renderSpecLineFromSpec(renderOutputSpecFor("9:16", 30))).toBe(
      "1080×1920 · 9:16 · 30fps · H.264",
    );
  });
});

describe("applyRenderJob — failure phase + background handoff", () => {
  const base = {
    id: "rj_1",
    projectId: "prj_1",
    versionId: "pv_1",
    framesDone: 100,
    framesTotal: 900,
    outputSpec: SPEC,
    outputAssetKey: null,
    thumbnailAssetKey: null,
    runInBackground: false,
    error: null,
    createdAt: "2026-07-24T10:00:00.000Z",
    startedAt: "2026-07-24T10:00:05.000Z",
    completedAt: null,
  };

  it("U-RM18: remembers the last non-terminal phase so a failure can mark the stage it died in", () => {
    let s = real({ renderJobId: "rj_1" });
    s = applyRenderJob(s, { ...base, status: "encoding" } as never, 1);
    expect(s.lastPhase).toBe("encoding");
    s = applyRenderJob(s, { ...base, status: "failed", error: "boom" } as never, 2);
    // the terminal status does not overwrite the remembered phase
    expect(s.lastPhase).toBe("encoding");
    expect(
      renderStageRows(s.status!, s.lastPhase ?? undefined).map((r) => r.status),
    ).toEqual(["completed", "completed", "failed", "queued"]);
  });

  it("U-RM19: a COMPLETED render un-backgrounds itself (the completion carries the only download CTA)", () => {
    let s = { ...real({ renderJobId: "rj_1" }), backgrounded: true };
    s = applyRenderJob(s, { ...base, status: "encoding" } as never, 1);
    expect(s.backgrounded).toBe(true); // still hidden while it works
    s = applyRenderJob(s, { ...base, status: "completed", framesDone: 900 } as never, 2);
    expect(s.backgrounded).toBe(false);
  });
});

// ── the render RUN GATE (the "Try again ▸" dead-button fix) ──────────────────
describe("render run gate", () => {
  it("U-RM20: a finished run releases the gate, so the failure card's retry can start again", () => {
    // THE BUG THIS PINS: `startRender` used to open with `if (state.render) return`.
    // `startRender` is a function object closed over the `state` snapshot of the render
    // that created it, and the retry handler's `onClose()` only DISPATCHES — it cannot
    // mutate that captured snapshot. So on a failure card (where `state.render` is
    // necessarily non-null) the guard always fired and "Try again ▸" did nothing. The
    // gate lives in a ref instead, and the driver releases it on every exit path.
    let gate = IDLE_RENDER_RUN_GATE;
    expect(canStartRender(gate)).toBe(true);

    const first = startRenderRun(gate);
    gate = first.gate;
    expect(canStartRender(gate)).toBe(false); // one render at a time, still

    // the driver's terminal exit (RENDER_FAILED / renderOutcome / the finally)
    gate = finishRenderRun(gate, first.run);
    expect(canStartRender(gate)).toBe(true);

    const second = startRenderRun(gate);
    expect(second.run).toBeGreaterThan(first.run); // monotonic run tokens
  });

  it("U-RM21: only the ACTIVE run may write — an abandoned driver is gated out", () => {
    const first = startRenderRun(IDLE_RENDER_RUN_GATE);
    // user cancels: the gate is released even though first's poll loop is still running
    // (it can live for the full 30-minute poll budget)
    const idle = abandonRenderRun(first.gate);
    expect(canStartRender(idle)).toBe(true);

    const second = startRenderRun(idle);
    // the abandoned driver can no longer dispatch into the NEW render — this is what
    // protects `renderOutcome` and RENDER_DOWNLOAD_READY, which carry no id guard of
    // their own (RENDER_POLLED has one in the reducer).
    expect(isActiveRenderRun(second.gate, first.run)).toBe(false);
    expect(isActiveRenderRun(second.gate, second.run)).toBe(true);
  });

  it("U-RM22: an abandoned driver's own release cannot clear a NEWER run's gate", () => {
    const first = startRenderRun(IDLE_RENDER_RUN_GATE);
    const second = startRenderRun(abandonRenderRun(first.gate));
    // first's `finally` fires late, after the user already started `second`
    const after = finishRenderRun(second.gate, first.run);
    expect(isActiveRenderRun(after, second.run)).toBe(true);
    expect(canStartRender(after)).toBe(false); // second is still in flight
  });

  it("U-RM23: releasing an already-idle gate is a no-op that preserves run numbering", () => {
    // `closeRender` runs on a TERMINAL card, whose driver has usually already released
    // the gate. Releasing twice must not rewind `lastIssued`, or a late dispatch from an
    // old run could match a reissued token.
    const first = startRenderRun(IDLE_RENDER_RUN_GATE);
    const settled = finishRenderRun(first.gate, first.run);
    const closed = abandonRenderRun(settled);
    expect(canStartRender(closed)).toBe(true);
    expect(startRenderRun(closed).run).toBeGreaterThan(first.run);
  });
});
