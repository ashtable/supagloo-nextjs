import type { Storyboard } from "./storyboard";

/**
 * Feature 6 — keeping the studio's presigned preview URLs alive.
 *
 * ## The bug
 *
 * `FilesService` signs downloads for **300 seconds** (`api/src/files/files-service.ts:65`;
 * `server.ts` constructs it with no override and there is no env var, so production really
 * does run 300 s). The studio presigns exactly twice — once at hydration
 * (`presignStoryboardAssets`, an effect keyed `[slug]`) and once when a generation lands —
 * and never again. Five minutes into an editing session every preview URL is dead.
 *
 * What makes it worse than a missing preview: `storyboard-video.tsx` branches on
 * `scene.visualUrl ? …`, and an EXPIRED url is still truthy. So the media branch is taken
 * with a URL that 403s, and the `: null` gradient fallback the component already has is
 * unreachable. The studio shows broken media instead of the placeholder it was given.
 *
 * ## The shape of the fix
 *
 * `expiresAt` has ridden the wire end-to-end since task #13 and was discarded by one line
 * in `ai-generation-data.ts`. Carrying it lets the studio do what
 * `lib/gallery/watch-player.ts` already does for the watch page: re-sign BEFORE expiry
 * (proactive), retry on a media error (reactive), and stop after a bounded number of
 * failures so a permanently-dead key cannot thrash.
 *
 * This module is the pure half — no React, no fetch, injected clock.
 *
 * ## Difference from the gallery's version, deliberately
 *
 * `shouldResignStreamUrl` reasons about `{signedAt, now, ttlSeconds}` because the public
 * watch page knows the TTL as a server-side constant and records when it signed. Here the
 * response's own `expiresAt` is available, which is strictly better: it survives a clock
 * that moved, and it cannot drift from whatever TTL the api is actually configured with.
 */

/** Re-sign this long before expiry. A URL valid for another two seconds is not worth
 *  handing to a video element that will still be fetching ranges in ten. Same value as
 *  the gallery's `RESIGN_SAFETY_MARGIN_SECONDS`. */
export const RESIGN_SAFETY_MARGIN_SECONDS = 15;

/** Give up on one target after this many consecutive failures. A key can be permanently
 *  unsignable (deleted object, revoked policy); without a ceiling the refresh loop would
 *  re-request it on every tick for the life of the session. Mirrors the watch view's
 *  `MAX_AGE_RESIGN_FAILURES`. */
export const MAX_RESIGN_FAILURES = 3;

/** A presigned asset as the BFF returns it. */
export interface PresignedAsset {
  url: string;
  /** ISO-8601, straight from `FilePresignDownloadResponseSchema`. */
  expiresAt: string;
}

/**
 * Is this URL too close to expiry (or unusable) to keep?
 *
 * An unanswerable question — no expiry, an empty string, an unparseable date — is
 * answered "stale". That asymmetry is on purpose and matches the gallery's: a needless
 * re-sign costs one request, a stale URL costs a dead player.
 */
export function isPresignStale(
  expiresAt: string | null | undefined,
  nowMs: number,
): boolean {
  if (!expiresAt) return true;
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs) || !Number.isFinite(nowMs)) return true;
  return expiresMs - nowMs <= RESIGN_SAFETY_MARGIN_SECONDS * 1000;
}

/** One thing the studio can re-sign. Four kinds, because four kinds are presigned at
 *  hydration and all four die at the same 300 s. */
export type PresignTarget =
  | { kind: "scene-visual"; sceneId: string; assetKey: string }
  | { kind: "scene-narration"; sceneId: string; assetKey: string }
  | { kind: "narration"; assetKey: string }
  | { kind: "music"; assetKey: string };

/** A stable id for the failure ledger. Includes the KIND, because a scene's visual and
 *  its narration are different assets that can fail independently. */
export function presignTargetId(target: PresignTarget): string {
  return "sceneId" in target ? `${target.kind}:${target.sceneId}` : target.kind;
}

/**
 * Every asset that has a persisted key but no usable preview URL right now.
 *
 * "No usable URL" covers both expired AND absent: a presign can fail at hydration (a 404,
 * a dead API) and absent is exactly as broken as expired — it is the case the gradient
 * fallback exists for, and it should be retried rather than left dead for the session.
 *
 * Order is deterministic (scenes in order, then whole-project narration, then music) so
 * the refresh pass issues the same requests in the same order every tick.
 */
export function stalePresignTargets(
  sb: Storyboard,
  nowMs: number,
): PresignTarget[] {
  const out: PresignTarget[] = [];
  for (const scene of sb.scenes) {
    if (scene.visualAssetKey && isPresignStale(scene.visualUrlExpiresAt, nowMs)) {
      out.push({
        kind: "scene-visual",
        sceneId: scene.id,
        assetKey: scene.visualAssetKey,
      });
    }
    if (
      scene.narrationAssetKey &&
      isPresignStale(scene.narrationUrlExpiresAt, nowMs)
    ) {
      out.push({
        kind: "scene-narration",
        sceneId: scene.id,
        assetKey: scene.narrationAssetKey,
      });
    }
  }
  if (sb.narrationAssetKey && isPresignStale(sb.narrationUrlExpiresAt, nowMs)) {
    out.push({ kind: "narration", assetKey: sb.narrationAssetKey });
  }
  if (sb.musicAssetKey && isPresignStale(sb.musicUrlExpiresAt, nowMs)) {
    out.push({ kind: "music", assetKey: sb.musicAssetKey });
  }
  return out;
}

/** Consecutive re-sign failures per target id. Immutable — it is read during render and
 *  written from an effect, and a shared-mutable map there is a stale-closure bug waiting
 *  to happen. */
export interface ResignLedger {
  failures: Readonly<Record<string, number>>;
}

export const EMPTY_RESIGN_LEDGER: ResignLedger = { failures: {} };

export function canResign(ledger: ResignLedger, targetId: string): boolean {
  return (ledger.failures[targetId] ?? 0) < MAX_RESIGN_FAILURES;
}

export function afterResignFailure(
  ledger: ResignLedger,
  targetId: string,
): ResignLedger {
  return {
    failures: {
      ...ledger.failures,
      [targetId]: (ledger.failures[targetId] ?? 0) + 1,
    },
  };
}

/** A success clears the count, so a transient API outage is not terminal for the rest of
 *  the session. */
export function afterResignSuccess(
  ledger: ResignLedger,
  targetId: string,
): ResignLedger {
  if (ledger.failures[targetId] === undefined) return ledger;
  const next = { ...ledger.failures };
  delete next[targetId];
  return { failures: next };
}
