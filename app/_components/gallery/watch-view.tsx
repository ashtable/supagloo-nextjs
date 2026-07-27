"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import SigninPrompt from "./signin-prompt";
import WatchDetails from "./watch-details";
import WatchPlayer from "./watch-player";
import { useSession } from "../session-provider";
import {
  fetchGalleryItem,
  fetchStreamUrl,
  removeUpvote,
  sendUpvote,
} from "@/lib/gallery/gallery-data";
import {
  anonVoteOutcome,
  optimisticVote,
  revertVote,
  voteSnapshot,
} from "@/lib/gallery/gallery-model";
import { shouldResignStreamUrl } from "@/lib/gallery/watch-player";
import type { GalleryItemDetailDto } from "@/lib/api/contracts";

/**
 * The `/gallery/[id]` client island (Turn 16a) — the watch page's only stateful part.
 *
 * MOUNT-GATED, like `/gallery`'s grid and for the same reason: `data-testid`
 * `gallery-watch` must be an honest POST-HYDRATION signal. A testid a Server Component
 * emits is in the first HTML byte and proves nothing about React having adopted the
 * tree, which is exactly the shape that produced row 68's lost-event failures. The
 * server shell around this island (nav, frame, footer, `generateMetadata`) still renders
 * on the server, so a crawler and a first paint both get the page's chrome and its
 * title.
 *
 * ── THE THREE PIECES OF STATE, AND WHY THEY LIVE HERE ──────────────────────────
 *  1. **The item.** One `fetchGalleryItem` at mount. It never throws, so a 404, a dead
 *     API and a wire-shape drift all arrive as the same `null` and become one honest
 *     not-found state rather than an error boundary on a public URL.
 *  2. **The stream URL.** `GET /v1/gallery/:id/stream-url` answers a **120-second**
 *     presign, and this is the one surface a viewer sits on for longer than that — so
 *     the URL is re-signed BEFORE it dies (a periodic age check against
 *     `shouldResignStreamUrl`) and again if the element errors. The playhead is carried
 *     across the swap; `watch-player.tsx` restores it on the next `loadedmetadata`.
 *  3. **The vote.** Optimistic flip, one open request, reconciled against the server's
 *     re-read — the same rules `gallery-browser.tsx` holds for a card, minus the
 *     per-item set, because there is exactly one item here.
 *
 * The error-driven re-sign happens **at most once per playback attempt**. A genuinely
 * missing object errors every single time, and an unguarded handler would turn that into
 * an unbounded presign loop for as long as the tab is open. Recovery (a `loadedmetadata`
 * on the new URL) re-arms it; a second failure is the error state, which has a way out.
 */
export default function WatchView({ itemId }: { itemId: string }) {
  const { session } = useSession();
  const isAuthed = session.isAuthed;

  const [mounted, setMounted] = useState(false);
  /** Captured once, at mount: `shared X ago` must not re-answer itself mid-session. */
  const [now, setNow] = useState(0);
  const [item, setItem] = useState<GalleryItemDetailDto | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [stream, setStream] = useState<StreamState | null>(null);
  const [playerFailed, setPlayerFailed] = useState(false);
  const [voting, setVoting] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  /**
   * The mounted guard. Re-armed in the effect BODY, never cleanup-only: `next dev` runs
   * StrictMode, which mounts → runs the effect → runs its cleanup → runs it again, so a
   * cleanup-only guard is left `false` for the component's whole life and every async
   * continuation below silently no-ops (`tests/unit/mounted-guard-strictmode.test.ts`).
   */
  const aliveRef = useRef(true);
  const streamRef = useRef<StreamState | null>(null);
  const signingRef = useRef(false);
  const errorResignedRef = useRef(false);
  const votingRef = useRef(false);
  /** The playhead, mirrored without state: `timeupdate` fires ~4×/second and nothing
   *  above the player displays it. */
  const currentTimeRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setNow(Date.now());
  }, []);

  // ── the item ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return;
    let active = true;
    // This effect IS the external-system synchronization the rule is about: it starts a
    // network request whose lifecycle React cannot observe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("loading");
    setItem(null);
    setStream(null);
    streamRef.current = null;
    errorResignedRef.current = false;
    setPlayerFailed(false);

    void (async () => {
      const found = await fetchGalleryItem(itemId);
      if (!active || !aliveRef.current) return;
      if (!found) {
        setStatus("missing");
        return;
      }
      setItem(found);
      setStatus("ready");
    })();

    return () => {
      active = false;
    };
  }, [mounted, itemId]);

  // ── the presigned stream URL ───────────────────────────────────────────────
  const sign = useCallback(
    async (resumeAt: number) => {
      // One presign in flight at a time. Both triggers (an element error and the age
      // check) can fire in the same tick, and two concurrent signs would race each
      // other into `setStream`, with the loser's URL potentially the newer one.
      if (signingRef.current) return;
      signingRef.current = true;
      try {
        const signed = await fetchStreamUrl(itemId);
        if (!aliveRef.current) return;
        if (!signed) {
          setPlayerFailed(true);
          return;
        }
        const signedAt = Date.now();
        const expiresAt = Date.parse(signed.expiresAt);
        // Trust the server's own expiry when it parses; fall back to the documented
        // 120 s otherwise. Never feed a NaN TTL to `shouldResignStreamUrl` — it answers
        // "re-sign" to an unanswerable question, which here would be a re-sign loop.
        const ttlSeconds =
          Number.isFinite(expiresAt) && expiresAt > signedAt
            ? (expiresAt - signedAt) / 1000
            : DEFAULT_STREAM_TTL_SECONDS;
        const next: StreamState = { url: signed.url, signedAt, ttlSeconds, resumeAt };
        streamRef.current = next;
        setStream(next);
        setPlayerFailed(false);
      } finally {
        signingRef.current = false;
      }
    },
    [itemId],
  );

  useEffect(() => {
    if (status !== "ready") return;
    void sign(0);
  }, [status, sign]);

  useEffect(() => {
    if (status !== "ready") return;
    const timer = setInterval(() => {
      const current = streamRef.current;
      if (!current) return;
      if (
        shouldResignStreamUrl({
          signedAt: current.signedAt,
          now: Date.now(),
          ttlSeconds: current.ttlSeconds,
        })
      ) {
        void sign(currentTimeRef.current);
      }
    }, RESIGN_POLL_MS);
    return () => clearInterval(timer);
  }, [status, sign]);

  const onNeedsResign = useCallback(
    (currentTimeSeconds: number) => {
      if (!streamRef.current) return;
      if (errorResignedRef.current) {
        // Already tried once for this playback attempt. A missing object errors forever;
        // the honest answer is the error state, not another round trip.
        setPlayerFailed(true);
        return;
      }
      errorResignedRef.current = true;
      void sign(currentTimeSeconds);
    },
    [sign],
  );

  /** The new source became playable — the next error is worth one more re-sign. */
  const onPlayable = useCallback(() => {
    errorResignedRef.current = false;
  }, []);

  const onRetry = useCallback(() => {
    errorResignedRef.current = false;
    setPlayerFailed(false);
    void sign(currentTimeRef.current);
  }, [sign]);

  // ── the vote ───────────────────────────────────────────────────────────────
  const onVote = useCallback(async () => {
    const current = item;
    if (!current) return;

    const outcome = anonVoteOutcome(isAuthed, current.viewerHasUpvoted);
    if (outcome === "prompt") {
      setPromptOpen(true);
      return;
    }

    // A REF, not the `voting` state: it is written synchronously, so a second click
    // cannot get past it even when React batches both into one render. Without it a
    // double-click sends POST and DELETE concurrently — the optimistic flip makes the
    // second click read as an un-vote — and whichever lands last wins, which need not
    // be what the database committed.
    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    try {
      const snapshot = voteSnapshot(current);
      const optimistic = optimisticVote(current, outcome);
      setItem(optimistic);

      const server =
        outcome === "vote" ? await sendUpvote(current.id) : await removeUpvote(current.id);
      if (!aliveRef.current) return;

      if (!server) {
        // Put the pill back exactly as it was, then say why. The likeliest cause of a
        // failed vote for someone who looks signed in is an expired session, and a
        // silently-reverted pill reads as a bug in the button.
        setItem(revertVote(optimistic, snapshot));
        setPromptOpen(true);
        return;
      }

      // ONLY the two vote fields are adopted. The upvote routes answer with the CARD
      // DTO — no `makingOf`, no `owner.publicVideoCount` — so spreading the response
      // over the detail item would blank the HOW IT WAS MADE section and the creator's
      // video count on every vote.
      setItem((prev) =>
        prev
          ? {
              ...prev,
              upvoteCount: server.upvoteCount,
              viewerHasUpvoted: server.viewerHasUpvoted,
            }
          : prev,
      );
    } finally {
      votingRef.current = false;
      setVoting(false);
    }
  }, [item, isAuthed]);

  if (!mounted) return null;

  return (
    <div
      data-testid="gallery-watch"
      className="flex flex-col lg:flex-row px-4 sm:px-[34px]"
      style={{ gap: 34, paddingTop: 30, paddingBottom: 34, minHeight: 240 }}
    >
      {status === "loading" && (
        <p data-testid="gallery-watch-pending" style={CENTRED_NOTE}>
          {"Getting the video…"}
        </p>
      )}

      {status === "missing" && (
        <div data-testid="gallery-watch-notfound" style={CENTRED_NOTE}>
          <p style={{ margin: 0 }}>{"We couldn't find that video."}</p>
          <p style={{ margin: "6px 0 0", fontSize: 13.5 }}>
            {"It may have been unpublished, or the link may be wrong."}
          </p>
          <Link
            href="/gallery"
            data-testid="gallery-watch-notfound-back"
            className="cursor-pointer"
            style={{
              display: "inline-block",
              marginTop: 16,
              padding: "9px 20px",
              borderRadius: 11,
              border: "1px solid var(--sg-line2)",
              background: "var(--sg-panel)",
              fontFamily: "var(--font-barlow)",
              fontWeight: 700,
              fontSize: 13,
              color: "var(--sg-fg)",
            }}
          >
            {"‹ Gallery"}
          </Link>
        </div>
      )}

      {status === "ready" && item && (
        <>
          <div className="w-full lg:w-[400px]" style={{ flex: "none" }}>
            <WatchPlayer
              src={stream?.url ?? null}
              posterUrl={item.thumbnailUrl}
              resumeAt={stream?.resumeAt ?? 0}
              failed={playerFailed}
              title={item.title}
              onNeedsResign={onNeedsResign}
              onPlayable={onPlayable}
              onRetry={onRetry}
              onProgress={(seconds) => {
                currentTimeRef.current = seconds;
              }}
            />
          </div>

          <div
            className="flex flex-col"
            style={{ flex: 1, minWidth: 0, gap: 22 }}
          >
            <WatchDetails
              item={item}
              now={now}
              voting={voting}
              onVote={() => void onVote()}
            />
          </div>
        </>
      )}

      <SigninPrompt open={promptOpen} onClose={() => setPromptOpen(false)} />
    </div>
  );
}

interface StreamState {
  url: string;
  /** Epoch ms this URL was signed at (this client's clock, which is also the clock the
   *  age check reads). */
  signedAt: number;
  ttlSeconds: number;
  /** Where to put the playhead once the new source reports metadata. */
  resumeAt: number;
}

/** `GET /v1/gallery/:id/stream-url`'s documented TTL, used only when the response's own
 *  `expiresAt` cannot be parsed. */
const DEFAULT_STREAM_TTL_SECONDS = 120;

/** How often the age check runs. Well inside the 15 s safety margin, so a re-sign is
 *  decided with room to complete before the URL it replaces expires. */
const RESIGN_POLL_MS = 5_000;

const CENTRED_NOTE = {
  flex: 1,
  padding: "64px 0",
  margin: 0,
  textAlign: "center" as const,
  fontFamily: "var(--font-zilla)",
  fontSize: 15,
  color: "var(--sg-dim)",
};
