import { describe, it, expect, vi } from "vitest";
import { refreshStalePresigns } from "./presign-refresh-driver";
import {
  EMPTY_RESIGN_LEDGER,
  MAX_RESIGN_FAILURES,
  type ResignLedger,
} from "./presign-refresh";
import { studioReducer } from "./reducer";
import type { Storyboard } from "./storyboard";

/**
 * Feature 6 — the refresh pass that keeps the studio's previews alive past 300 s.
 *
 * Expiry is simulated with an injected clock and an injected presign; nothing here waits
 * on a real TTL, and nothing makes a request. (Design-delta §10.6: simulated failure is a
 * unit concern with an injected `fetch` at the call-function level.)
 */

const T0 = Date.parse("2026-07-29T12:00:00.000Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

const scene = (over: Record<string, unknown>) =>
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

const signs = (expiresIn = 300) =>
  vi.fn(async (key: string) => ({
    url: `https://s3/${key}?sig=fresh`,
    expiresAt: at(expiresIn),
  }));

describe("refreshStalePresigns", () => {
  it("U-P16: does nothing at all while every url is fresh", async () => {
    const presign = signs();
    const sb = board({
      scenes: [
        scene({
          visualAssetKey: "k1",
          visualUrl: "https://s3/old",
          visualUrlExpiresAt: at(300),
        }),
      ],
    });
    const out = await refreshStalePresigns({
      storyboard: sb,
      nowMs: T0,
      ledger: EMPTY_RESIGN_LEDGER,
      presign,
    });
    expect(presign).not.toHaveBeenCalled();
    expect(out.actions).toEqual([]);
    expect(out.ledger).toBe(EMPTY_RESIGN_LEDGER);
  });

  it("U-P17: THE FIX — a scene visual about to expire is re-signed and written back", async () => {
    const presign = signs();
    const sb = board({
      scenes: [
        scene({
          visualAssetKey: "k1",
          visualUrl: "https://s3/old",
          visualUrlExpiresAt: at(5), // inside the 15 s safety margin
        }),
      ],
    });
    const out = await refreshStalePresigns({
      storyboard: sb,
      nowMs: T0,
      ledger: EMPTY_RESIGN_LEDGER,
      presign,
    });
    expect(presign).toHaveBeenCalledWith("k1");
    expect(out.actions).toEqual([
      {
        type: "SET_SCENE_VISUAL_URL",
        sceneId: "s1",
        url: "https://s3/k1?sig=fresh",
        urlExpiresAt: at(300),
      },
    ]);
  });

  it("U-P18: the actions actually land on the storyboard AND do not dirty the project", async () => {
    // A refresh is a display-only url swap. If it dirtied the project, simply leaving the
    // studio open would arm Commit and make "All changes committed" a lie about work the
    // user never did.
    const sb = board({
      scenes: [
        scene({
          visualAssetKey: "k1",
          visualUrl: "https://s3/dead",
          visualUrlExpiresAt: at(-60),
        }),
      ],
    });
    const out = await refreshStalePresigns({
      storyboard: sb,
      nowMs: T0,
      ledger: EMPTY_RESIGN_LEDGER,
      presign: signs(),
    });

    let state = {
      storyboard: sb,
      dirty: false,
      generations: {},
      versionMenuOpen: false,
    } as unknown as Parameters<typeof studioReducer>[0];
    for (const action of out.actions) state = studioReducer(state, action);

    expect(state.storyboard.scenes[0].visualUrl).toBe("https://s3/k1?sig=fresh");
    expect(state.storyboard.scenes[0].visualUrlExpiresAt).toBe(at(300));
    expect(state.dirty).toBe(false);
  });

  it("U-P19: refreshes ALL FOUR presigned surfaces, not just the visible frame", async () => {
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
    const out = await refreshStalePresigns({
      storyboard: sb,
      nowMs: T0,
      ledger: EMPTY_RESIGN_LEDGER,
      presign: signs(),
    });
    expect(out.actions.map((a) => a.type)).toEqual([
      "SET_SCENE_VISUAL_URL",
      "SET_SCENE_NARRATION_URL",
      "SET_NARRATION_URL",
      "SET_MUSIC_URL",
    ]);

    let state = {
      storyboard: sb,
      dirty: false,
      generations: {},
      versionMenuOpen: false,
    } as unknown as Parameters<typeof studioReducer>[0];
    for (const action of out.actions) state = studioReducer(state, action);
    expect(state.storyboard.scenes[0].narrationUrl).toBe("https://s3/sn1?sig=fresh");
    expect(state.storyboard.narrationUrl).toBe("https://s3/n1?sig=fresh");
    expect(state.storyboard.musicUrl).toBe("https://s3/m1?sig=fresh");
    expect(state.dirty).toBe(false);
  });

  it("U-P20: a failed re-sign is counted and eventually stops being retried", async () => {
    const presign = vi.fn(async () => null);
    const sb = board({
      scenes: [
        scene({ visualAssetKey: "k1", visualUrl: "u", visualUrlExpiresAt: at(-1) }),
      ],
    });
    let ledger: ResignLedger = EMPTY_RESIGN_LEDGER;
    for (let i = 0; i < MAX_RESIGN_FAILURES; i++) {
      const out = await refreshStalePresigns({
        storyboard: sb,
        nowMs: T0,
        ledger,
        presign,
      });
      expect(out.actions).toEqual([]);
      ledger = out.ledger;
    }
    expect(presign).toHaveBeenCalledTimes(MAX_RESIGN_FAILURES);

    // The ceiling: a permanently-dead key must not cost a request every tick for the rest
    // of the session.
    const after = await refreshStalePresigns({
      storyboard: sb,
      nowMs: T0,
      ledger,
      presign,
    });
    expect(presign).toHaveBeenCalledTimes(MAX_RESIGN_FAILURES);
    expect(after.actions).toEqual([]);
  });

  it("U-P21: one dead asset never blocks a healthy one in the same pass", async () => {
    const presign = vi.fn(async (key: string) =>
      key === "dead" ? null : { url: `https://s3/${key}`, expiresAt: at(300) },
    );
    const sb = board({
      scenes: [
        scene({ id: "s1", visualAssetKey: "dead", visualUrlExpiresAt: at(-1) }),
        scene({ id: "s2", visualAssetKey: "alive", visualUrlExpiresAt: at(-1) }),
      ],
    });
    const out = await refreshStalePresigns({
      storyboard: sb,
      nowMs: T0,
      ledger: EMPTY_RESIGN_LEDGER,
      presign,
    });
    expect(out.actions).toEqual([
      {
        type: "SET_SCENE_VISUAL_URL",
        sceneId: "s2",
        url: "https://s3/alive",
        urlExpiresAt: at(300),
      },
    ]);
    expect(out.ledger.failures["scene-visual:s1"]).toBe(1);
    expect(out.ledger.failures["scene-visual:s2"]).toBeUndefined();
  });
});
