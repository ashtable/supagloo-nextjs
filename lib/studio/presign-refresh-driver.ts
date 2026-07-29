import {
  afterResignFailure,
  afterResignSuccess,
  canResign,
  presignTargetId,
  stalePresignTargets,
  type PresignedAsset,
  type ResignLedger,
} from "./presign-refresh";
import type { StudioAction } from "./reducer";
import type { Storyboard } from "./storyboard";

/**
 * Feature 6 — one refresh pass: find every preview URL that is dead or about to die,
 * re-sign it, and produce the actions that write the fresh URLs back.
 *
 * Separated from the React effect so the whole decision is testable with an injected
 * clock and an injected presign, and so the studio's own effect stays what it should be:
 * a timer that calls this and dispatches what comes back.
 *
 * ## Why a proactive pass rather than an `onError` retry
 *
 * The obvious fix is to hang a re-sign off a media error, but neither `storyboard-video.tsx`
 * nor `player-panel.tsx` has an `onError` to hang it off, and they are inside the Remotion
 * composition tree — threading a dispatch through it costs more than it buys once URLs are
 * replaced fifteen seconds BEFORE they expire. Refreshing early also fixes the case an
 * error handler cannot see: `<OffthreadVideo>` holding an HTTP range session open across
 * the expiry boundary (`files-service.ts` records that the TTL bounds NEW requests, not a
 * stream already being served).
 *
 * ## Why the ledger
 *
 * `watch-view.tsx` learned this the expensive way: a key that can never be signed (a
 * deleted object, a revoked policy) turns a refresh loop into a request every tick for the
 * rest of the session. Failures are counted per target and the pass stops asking after
 * `MAX_RESIGN_FAILURES`; a success clears the count so a transient API outage is not
 * terminal.
 */
export interface RefreshPassArgs {
  storyboard: Storyboard;
  nowMs: number;
  ledger: ResignLedger;
  presign: (assetKey: string) => Promise<PresignedAsset | null>;
}

export interface RefreshPassResult {
  actions: StudioAction[];
  ledger: ResignLedger;
}

export async function refreshStalePresigns(
  args: RefreshPassArgs,
): Promise<RefreshPassResult> {
  const targets = stalePresignTargets(args.storyboard, args.nowMs).filter((t) =>
    canResign(args.ledger, presignTargetId(t)),
  );
  if (targets.length === 0) return { actions: [], ledger: args.ledger };

  // Concurrent: these are independent single-object presigns, and the whole point is to
  // finish before the oldest url dies. Each settles its own outcome, so one failure never
  // costs the others their refresh.
  const signed = await Promise.all(
    targets.map(async (target) => ({
      target,
      asset: await args.presign(target.assetKey),
    })),
  );

  let ledger = args.ledger;
  const actions: StudioAction[] = [];
  for (const { target, asset } of signed) {
    const id = presignTargetId(target);
    if (!asset) {
      ledger = afterResignFailure(ledger, id);
      continue;
    }
    ledger = afterResignSuccess(ledger, id);
    switch (target.kind) {
      case "scene-visual":
        // SET_SCENE_VISUAL_URL, at last used in production. It has existed since task #35
        // with no dispatcher anywhere — hydration calls the PURE `setSceneVisualUrl` on
        // the storyboard before a reducer exists — and it is exactly the seam a refresh
        // loop needs: a display-only url write that must NOT dirty the project.
        actions.push({
          type: "SET_SCENE_VISUAL_URL",
          sceneId: target.sceneId,
          url: asset.url,
          urlExpiresAt: asset.expiresAt,
        });
        break;
      case "scene-narration":
        actions.push({
          type: "SET_SCENE_NARRATION_URL",
          sceneId: target.sceneId,
          url: asset.url,
          urlExpiresAt: asset.expiresAt,
        });
        break;
      case "narration":
        actions.push({
          type: "SET_NARRATION_URL",
          url: asset.url,
          urlExpiresAt: asset.expiresAt,
        });
        break;
      case "music":
        actions.push({
          type: "SET_MUSIC_URL",
          url: asset.url,
          urlExpiresAt: asset.expiresAt,
        });
        break;
    }
  }
  return { actions, ledger };
}
