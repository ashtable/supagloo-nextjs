import { describe, it, expect } from "vitest";
import {
  EMPTY_RESIGN_LEDGER,
  MAX_RESIGN_FAILURES,
  RESIGN_SAFETY_MARGIN_SECONDS,
  afterResignFailure,
  afterResignSuccess,
  canResign,
  isPresignStale,
  presignTargetId,
  stalePresignTargets,
} from "./presign-refresh";
import type { Storyboard } from "./storyboard";

/**
 * Feature 6 — presigned URLs expire and the studio never re-signs them.
 *
 * `FilesService` signs downloads for 300 s (`files-service.ts:65`, no override anywhere).
 * The studio presigns exactly TWICE — once at hydration, once when a generation lands —
 * and `expiresAt` rides the wire the whole way (`FilePresignDownloadResponseSchema`) only
 * to be discarded by one line: `return parsed.success ? parsed.data.url : null;`. The
 * `Promise<string | null>` signature made expiry structurally unrepresentable to every
 * caller.
 *
 * The visible consequence is worse than a missing preview: `storyboard-video.tsx` branches
 * on `scene.visualUrl ?`, and a STALE URL is truthy, so it takes the media branch and the
 * `: null` gradient fallback is unreachable. After five minutes the studio shows broken
 * media rather than the placeholder it has.
 *
 * Simulating expiry is a UNIT concern with an injected clock (design-delta §10.6) — no
 * test waits 300 s for anything.
 */

const T0 = Date.parse("2026-07-29T12:00:00.000Z");
const at = (secondsFromT0: number) =>
  new Date(T0 + secondsFromT0 * 1000).toISOString();

describe("isPresignStale", () => {
  it("U-P1: fresh well before expiry, stale once inside the safety margin", () => {
    // The margin exists because a URL that is valid for another two seconds is not worth
    // handing to a video element that will still be fetching ranges in ten.
    expect(isPresignStale(at(300), T0)).toBe(false);
    expect(isPresignStale(at(RESIGN_SAFETY_MARGIN_SECONDS + 1), T0)).toBe(false);
    expect(isPresignStale(at(RESIGN_SAFETY_MARGIN_SECONDS), T0)).toBe(true);
    expect(isPresignStale(at(RESIGN_SAFETY_MARGIN_SECONDS - 1), T0)).toBe(true);
  });

  it("U-P2: an ALREADY-expired URL is stale", () => {
    expect(isPresignStale(at(-1), T0)).toBe(true);
    expect(isPresignStale(at(-3600), T0)).toBe(true);
  });

  it("U-P3: an unanswerable question is answered the CHEAP way — re-sign", () => {
    // A needless re-sign costs one request; a stale URL costs a dead player. The same
    // deliberate asymmetry `shouldResignStreamUrl` records for the gallery.
    for (const bad of [null, undefined, "", "not-a-date", "2026-13-45T99:99:99Z"]) {
      expect(isPresignStale(bad, T0), String(bad)).toBe(true);
    }
  });

  it("U-P4: an expiry far in the future is fresh, not a clock-skew re-sign loop", () => {
    expect(isPresignStale(at(86_400), T0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

const scene = (over: Partial<Storyboard["scenes"][number]>) =>
  ({
    id: "s1",
    index: 1,
    durationSeconds: 5,
    visualLabel: "l",
    visualPrompt: "p",
    script: "s",
    onScreenText: "text",
    ...over,
  }) as Storyboard["scenes"][number];

const board = (over: Partial<Storyboard> = {}): Storyboard =>
  ({
    title: "",
    dateLabel: "",
    reference: "",
    fps: 30,
    voiceDescription: "v",
    voiceLabel: "",
    musicMood: "",
    scenes: [],
    ...over,
  }) as Storyboard;

describe("stalePresignTargets", () => {
  it("U-P5: returns nothing when every URL is fresh", () => {
    const sb = board({
      scenes: [
        scene({
          visualAssetKey: "k1",
          visualUrl: "https://s3/k1",
          visualUrlExpiresAt: at(300),
        }),
      ],
      narrationAssetKey: "n1",
      narrationUrl: "https://s3/n1",
      narrationUrlExpiresAt: at(300),
    });
    expect(stalePresignTargets(sb, T0)).toEqual([]);
  });

  it("U-P6: finds a stale SCENE VISUAL — the one that renders as broken media", () => {
    const sb = board({
      scenes: [
        scene({
          visualAssetKey: "k1",
          visualUrl: "https://s3/k1",
          visualUrlExpiresAt: at(-1),
        }),
      ],
    });
    expect(stalePresignTargets(sb, T0)).toEqual([
      { kind: "scene-visual", sceneId: "s1", assetKey: "k1" },
    ]);
  });

  it("U-P7: covers EVERY presigned surface, not just the visible frame", () => {
    // A test that claims a class must drive the class: four kinds of asset are presigned
    // at hydration, and all four die at the same 300 s. Fixing only the visual would leave
    // narration and music silently dropping out of the preview five minutes in.
    const sb = board({
      scenes: [
        scene({
          id: "s1",
          visualAssetKey: "v1",
          visualUrl: "u",
          visualUrlExpiresAt: at(-1),
          narrationAssetKey: "sn1",
          narrationUrl: "u",
          narrationUrlExpiresAt: at(-1),
        }),
      ],
      narrationAssetKey: "n1",
      narrationUrl: "u",
      narrationUrlExpiresAt: at(-1),
      musicAssetKey: "m1",
      musicUrl: "u",
      musicUrlExpiresAt: at(-1),
    });
    expect(stalePresignTargets(sb, T0)).toEqual([
      { kind: "scene-visual", sceneId: "s1", assetKey: "v1" },
      { kind: "scene-narration", sceneId: "s1", assetKey: "sn1" },
      { kind: "narration", assetKey: "n1" },
      { kind: "music", assetKey: "m1" },
    ]);
  });

  it("U-P8: an asset with a KEY but no URL yet is a target too", () => {
    // Hydration presigns every persisted key, but a presign can fail (a 404, a dead API).
    // Absent is exactly as broken as expired, and it is the case the gradient fallback
    // was written for — so it should be retried, not left forever.
    const sb = board({
      scenes: [scene({ visualAssetKey: "k1" })],
    });
    expect(stalePresignTargets(sb, T0)).toEqual([
      { kind: "scene-visual", sceneId: "s1", assetKey: "k1" },
    ]);
  });

  it("U-P9: a scene with NO asset key is never a target — there is nothing to sign", () => {
    expect(stalePresignTargets(board({ scenes: [scene({})] }), T0)).toEqual([]);
    expect(
      stalePresignTargets(board({ scenes: [scene({ visualAssetKey: null })] }), T0),
    ).toEqual([]);
  });

  it("U-P10: target ids are stable and distinguish the two per-scene assets", () => {
    const visual = { kind: "scene-visual", sceneId: "s1", assetKey: "a" } as const;
    const narration = { kind: "scene-narration", sceneId: "s1", assetKey: "a" } as const;
    expect(presignTargetId(visual)).toBe(presignTargetId({ ...visual }));
    expect(presignTargetId(visual)).not.toBe(presignTargetId(narration));
  });
});

// ---------------------------------------------------------------------------

describe("the re-sign failure ledger", () => {
  it("U-P11: allows attempts until MAX_RESIGN_FAILURES, then stops", () => {
    // Without this a permanently-failing key (a deleted object, a revoked bucket policy)
    // re-signs on every tick forever — the thrash `watch-view.tsx` already guards against
    // with its once-per-attempt rule and MAX_AGE_RESIGN_FAILURES.
    let ledger = EMPTY_RESIGN_LEDGER;
    for (let i = 0; i < MAX_RESIGN_FAILURES; i++) {
      expect(canResign(ledger, "scene-visual:s1"), `attempt ${i}`).toBe(true);
      ledger = afterResignFailure(ledger, "scene-visual:s1");
    }
    expect(canResign(ledger, "scene-visual:s1")).toBe(false);
  });

  it("U-P12: failures are per-target — one dead asset never blocks the others", () => {
    let ledger = EMPTY_RESIGN_LEDGER;
    for (let i = 0; i < MAX_RESIGN_FAILURES; i++) {
      ledger = afterResignFailure(ledger, "scene-visual:s1");
    }
    expect(canResign(ledger, "scene-visual:s1")).toBe(false);
    expect(canResign(ledger, "scene-visual:s2")).toBe(true);
    expect(canResign(ledger, "music")).toBe(true);
  });

  it("U-P13: a success clears the count, so a transient outage is not terminal", () => {
    let ledger = afterResignFailure(EMPTY_RESIGN_LEDGER, "music");
    ledger = afterResignFailure(ledger, "music");
    ledger = afterResignSuccess(ledger, "music");
    expect(ledger.failures.music).toBeUndefined();
    for (let i = 0; i < MAX_RESIGN_FAILURES; i++) {
      expect(canResign(ledger, "music")).toBe(true);
      ledger = afterResignFailure(ledger, "music");
    }
    expect(canResign(ledger, "music")).toBe(false);
  });

  it("U-P14: the ledger is immutable — no shared-mutable state across renders", () => {
    const before = EMPTY_RESIGN_LEDGER;
    const after = afterResignFailure(before, "music");
    expect(before.failures).toEqual({});
    expect(after).not.toBe(before);
  });
});
