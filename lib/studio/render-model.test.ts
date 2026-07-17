import { describe, expect, it } from "vitest";

import { initLog, isLogComplete } from "../project-wizard/provisioning-log";
// RED until `lib/studio/render-model.ts` exists (Step 9 → GREEN). The pure
// 14c render model: a frame counter climbing toward the composition's total plus
// a 4-stage checklist (reusing the LogSequence sequencer), and the derived spec
// line. Missing module → clean "Cannot find module './render-model'" RED.
import {
  RENDER_FRAMES_PER_TICK,
  RENDER_STAGE_ROWS,
  RENDER_TICK_MS,
  advanceRender,
  initRender,
  isRenderComplete,
  renderPercent,
  renderSpecLine,
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
      "Bundled composition",
      "Synthesized narration & music",
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
