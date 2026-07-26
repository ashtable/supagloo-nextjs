import { describe, expect, it } from "vitest";

/**
 * Row 41 — the "Your videos" model (plan §5.5 U-Y1…U-Y3).
 *
 * RED until `./your-videos-model` ships. `/your-videos` has NO wireframe (plan §5.1), so
 * the page adapts 10a's `recent-projects.tsx` grid; the only logic worth a unit test is
 * the mapping from a wire `RenderJobDto` to what a card renders. Everything visual is
 * covered by `tests/e2e/gallery.e2e.ts` E-GU12.
 *
 * The load-bearing rule here is the task-38 lesson, restated: `framesTotal === 0` means
 * INDETERMINATE — the worker has not resolved the composition yet — so a card must show
 * NO duration badge. `"0:00"` would be a lie about the video's length, and it is the
 * exact shape of lie the 14c overlay already had to be corrected for.
 */
import {
  RENDER_CHIPS,
  isPublishable,
  relativeTimeLabel,
  renderToVideoCard,
} from "./your-videos-model";
import type { RenderJobDto, RenderStatus } from "../api/contracts";

const NOW = new Date("2026-07-26T12:00:00.000Z");

function makeRender(overrides: Partial<RenderJobDto> = {}): RenderJobDto {
  return {
    id: "rj_1",
    projectId: "prj_1",
    versionId: "ver_1",
    status: "completed",
    framesDone: 900,
    framesTotal: 900,
    outputSpec: {
      width: 1080,
      height: 1920,
      fps: 30,
      aspectRatio: "9:16",
      codec: "h264",
    },
    outputAssetKey: "renders/rj_1/output.mp4",
    thumbnailAssetKey: "renders/rj_1/thumb.jpg",
    runInBackground: false,
    error: null,
    createdAt: "2026-07-26T11:00:00.000Z",
    startedAt: "2026-07-26T11:00:01.000Z",
    completedAt: "2026-07-26T11:00:30.000Z",
    ...overrides,
  };
}

// ── U-Y1: the status chip, for all 8 RenderStatus values ─────────────────────

describe("U-Y1 renderToVideoCard — the status chip", () => {
  const CASES: [RenderStatus, string][] = [
    ["queued", "RENDERING"],
    ["synthesizing", "RENDERING"],
    ["bundling", "RENDERING"],
    ["encoding", "RENDERING"],
    ["uploading", "RENDERING"],
    ["completed", "RENDERED"],
    ["failed", "FAILED"],
    ["canceled", "CANCELED"],
  ];

  it("covers every RenderStatus the API can send — no default fallthrough", () => {
    // Pins the enumeration itself: an added status must break this test, not silently
    // land in whatever the last branch happened to be.
    expect(CASES.map(([s]) => s).sort()).toEqual(
      [
        "bundling",
        "canceled",
        "completed",
        "encoding",
        "failed",
        "queued",
        "synthesizing",
        "uploading",
      ].sort(),
    );
  });

  for (const [status, chip] of CASES) {
    it(`${status} → ${chip}`, () => {
      expect(renderToVideoCard(makeRender({ status }), NOW).chip).toBe(chip);
    });
  }

  it("keeps CANCELED distinct from FAILED — a deliberate stop is not a defect", () => {
    expect(renderToVideoCard(makeRender({ status: "canceled" }), NOW).chip).not.toBe(
      renderToVideoCard(makeRender({ status: "failed" }), NOW).chip,
    );
  });

  it("gives every chip a declared tone (the card's colour pair)", () => {
    expect(RENDER_CHIPS.RENDERED.tone).toBe("done");
    expect(RENDER_CHIPS.RENDERING.tone).toBe("progress");
    expect(RENDER_CHIPS.FAILED.tone).toBe("error");
    expect(RENDER_CHIPS.CANCELED.tone).toBe("error");
  });
});

// ── U-Y2: the duration badge, and the framesTotal === 0 rule ─────────────────

describe("U-Y2 renderToVideoCard — the duration badge", () => {
  it("derives m:ss from framesTotal / fps", () => {
    // 900 frames at 30fps = 30s.
    expect(renderToVideoCard(makeRender(), NOW).durationLabel).toBe("0:30");
    expect(
      renderToVideoCard(makeRender({ framesTotal: 2490 }), NOW).durationLabel,
    ).toBe("1:23");
  });

  it("shows NO badge when framesTotal is 0 — 0 means indeterminate, never 0:00", () => {
    const card = renderToVideoCard(makeRender({ framesTotal: 0, status: "queued" }), NOW);
    expect(card.durationLabel).toBeNull();
    expect(card.durationLabel).not.toBe("0:00");
  });

  it("shows NO badge for a nonsensical fps rather than dividing by zero", () => {
    const spec = { ...makeRender().outputSpec, fps: 0 };
    expect(
      renderToVideoCard(makeRender({ outputSpec: spec }), NOW).durationLabel,
    ).toBeNull();
  });

  it("floors the fraction (29.97s never reads as 0:30)", () => {
    // 899 frames at 30fps = 29.966…s
    expect(
      renderToVideoCard(makeRender({ framesTotal: 899 }), NOW).durationLabel,
    ).toBe("0:29");
  });
});

// ── U-Y3: isPublishable ──────────────────────────────────────────────────────

describe("U-Y3 isPublishable", () => {
  it("is true only for a completed render with BOTH asset keys and real frames", () => {
    expect(isPublishable(makeRender())).toBe(true);
  });

  it("is false for every non-completed status", () => {
    for (const status of [
      "queued",
      "synthesizing",
      "bundling",
      "encoding",
      "uploading",
      "failed",
      "canceled",
    ] as RenderStatus[]) {
      expect(isPublishable(makeRender({ status })), status).toBe(false);
    }
  });

  it("is false when either asset key is missing", () => {
    expect(isPublishable(makeRender({ outputAssetKey: null }))).toBe(false);
    expect(isPublishable(makeRender({ thumbnailAssetKey: null }))).toBe(false);
  });

  it("is false when framesTotal is 0 — the API's third precondition", () => {
    // Mirrors `GalleryService.publish`: status/asset keys/framesTotal are checked
    // server-side, and a "Share to gallery" button that provokes a 409 is a worse
    // affordance than one that is simply absent.
    expect(isPublishable(makeRender({ framesTotal: 0 }))).toBe(false);
  });

  it("is what the card exposes as `isPublishable`", () => {
    expect(renderToVideoCard(makeRender(), NOW).isPublishable).toBe(true);
    expect(
      renderToVideoCard(makeRender({ status: "encoding" }), NOW).isPublishable,
    ).toBe(false);
  });
});

// ── the rest of the card ─────────────────────────────────────────────────────

describe("renderToVideoCard — the remaining card fields", () => {
  it("carries the ids the card links on, and the server's echoed spec line", () => {
    const card = renderToVideoCard(makeRender(), NOW);
    expect(card.id).toBe("rj_1");
    expect(card.projectId).toBe("prj_1");
    expect(card.specLine).toBe("1080×1920 · 9:16 · 30fps · H.264");
  });

  it("surfaces a failed render's error message and nulls it otherwise", () => {
    expect(
      renderToVideoCard(makeRender({ status: "failed", error: "encode died" }), NOW)
        .error,
    ).toBe("encode died");
    expect(renderToVideoCard(makeRender(), NOW).error).toBeNull();
  });

  it("labels the age from the injected `now`, never a real clock", () => {
    expect(renderToVideoCard(makeRender(), NOW).createdLabel).toBe("1h ago");
  });
});

describe("relativeTimeLabel", () => {
  const at = (iso: string) => relativeTimeLabel(iso, NOW);

  it("reads 'just now' inside a minute", () => {
    expect(at("2026-07-26T11:59:31.000Z")).toBe("just now");
  });

  it("counts minutes, hours and days", () => {
    expect(at("2026-07-26T11:47:00.000Z")).toBe("13m ago");
    expect(at("2026-07-26T09:00:00.000Z")).toBe("3h ago");
    expect(at("2026-07-24T12:00:00.000Z")).toBe("2d ago");
  });

  it("falls back to a plain date past 30 days rather than '97d ago'", () => {
    expect(at("2026-04-20T12:00:00.000Z")).toBe("2026-04-20");
  });

  it("never renders a negative age from a clock skew", () => {
    expect(at("2026-07-26T12:00:30.000Z")).toBe("just now");
  });

  it("returns an empty label for an unparseable timestamp instead of NaN", () => {
    expect(at("not-a-date")).toBe("");
  });
});
