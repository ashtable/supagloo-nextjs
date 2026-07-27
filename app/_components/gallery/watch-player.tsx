"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatPlayerTime,
  progressPercent,
  seekTargetFromClick,
} from "@/lib/gallery/watch-player";

/**
 * Turn 16a's 9:16 player (Step 4 §1.3) — a 400px-wide frame with the transport
 * **overlaid inside it**.
 *
 * That overlay is the design's one real divergence from 13b, which put an identical
 * transport in a separate bar BELOW the frame. 16a's is `left:0;right:0;bottom:0` over a
 * `linear-gradient(transparent,rgba(0,0,0,.7))` scrim, and its scrub fill runs gold→red
 * (13b's runs red→gold). Both differences are deliberate here, not drift.
 *
 * ── WHAT THIS COMPONENT OWNS, AND WHAT IT DOES NOT ──────────────────────────────
 * It owns everything a `<video>` element reports — playing/paused, currentTime,
 * duration, muted — because those change many times a second and nothing above needs to
 * re-render for them. It owns NO network state: the presigned `src` and the decision to
 * re-sign belong to the island (a presign is a round trip through the BFF, and the
 * component that re-signs must also be the one that knows whether the item exists).
 * When the element errors, this component reports the playhead upward and lets the
 * island decide; that is what makes "re-sign once, then show the error state" a single
 * rule in a single place.
 *
 * ── THREE THINGS THE DESIGN DRAWS THAT ARE DELIBERATELY NOT RENDERED ────────────
 *  1. **The burned-in caption.** §1.3 draws `"And God said, Let there be light…"` over
 *     the poster. In the mock that IS the video frame — the renderer burns captions into
 *     the mp4 itself. Drawing a second caption layer over a live video would print the
 *     line twice, and there is no per-frame caption text on the wire to draw it from
 *     (the making-of snapshot carries the passage, not a caption track).
 *  2. **A fixed poster gradient.** The design's radial art stands in for a frame of the
 *     video. The real item has a real `thumbnailUrl`, so the poster is the item's own
 *     first frame when one is signed, and the design's gradient only when it is not.
 *  3. **`38%` of scrub fill.** A drawn number is a drawn state, not a constant.
 *
 * ── INVENTED STATES (the design draws none — Step 4 §8 A12) ─────────────────────
 * Loading reuses the retired modal's exact copy (`Getting the video…`) so the product's
 * vocabulary does not fork; the error state reuses `gallery-grid.tsx`'s retry recipe —
 * one house pattern for one problem.
 */
export default function WatchPlayer({
  src,
  posterUrl,
  resumeAt,
  failed,
  title,
  onNeedsResign,
  onPlayable,
  onRetry,
  onProgress,
}: {
  /** The presigned mp4 URL, or null while it is being signed. */
  src: string | null;
  /** The item's own thumbnail, if one could be signed. */
  posterUrl: string | null;
  /** Seconds to restore once the current `src` reports metadata. */
  resumeAt: number;
  /** The island has given up re-signing — render the error state, not the spinner. */
  failed: boolean;
  /** For the `<video>`'s accessible name. */
  title: string;
  /** The element errored at this playhead; the island decides whether to re-sign. */
  onNeedsResign: (currentTimeSeconds: number) => void;
  /** The current source reported metadata — playback recovered, so the island may
   *  spend another error-driven re-sign if this one fails later. */
  onPlayable?: () => void;
  /** The error state's way out. */
  onRetry: () => void;
  /** Playhead updates, for the island's age-based re-sign. A callback rather than
   *  lifted state on purpose: this fires ~4×/second and must not re-render the page. */
  onProgress?: (currentTimeSeconds: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(Number.NaN);

  /** Seconds to seek to on the next `loadedmetadata`. Held in a ref because it is
   *  consumed exactly once, by an event handler, and re-rendering for it would be a
   *  render per source swap for a value nothing displays. */
  const pendingResumeRef = useRef(0);
  /** Was the viewer playing when the source was swapped out from under them? A REF as
   *  well as state: the swap effect must read it without re-running on every play or
   *  pause, and a stale read there would silently drop the viewer back to a paused
   *  player after every re-sign. */
  const playingRef = useRef(false);
  const previousSrcRef = useRef<string | null>(null);

  const setPlayingState = useCallback((next: boolean) => {
    playingRef.current = next;
    setPlaying(next);
  }, []);

  // A new `src` means a new resume target. Setting the attribute is enough to invoke
  // the resource-selection algorithm, but `load()` makes the swap explicit — and it is
  // only called for a REPLACEMENT source, never for the first one (which the element
  // loads on its own).
  useEffect(() => {
    pendingResumeRef.current = resumeAt;
    const previous = previousSrcRef.current;
    previousSrcRef.current = src;
    if (!src || previous === null || previous === src) return;
    const video = videoRef.current;
    if (!video) return;
    playingRef.current = !video.paused;
    video.load();
  }, [src, resumeAt]);

  const attemptPlay = useCallback((video: HTMLVideoElement) => {
    // `play()` returns a promise in browsers and `undefined` in jsdom, and a rejected
    // one (autoplay policy, a source that never became playable) must not surface as an
    // unhandled rejection.
    const started: unknown = video.play();
    if (started && typeof (started as Promise<void>).catch === "function") {
      (started as Promise<void>).catch(() => undefined);
    }
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    onPlayable?.();
    const resume = pendingResumeRef.current;
    pendingResumeRef.current = 0;
    if (resume > 0) {
      // Seeking BEFORE metadata is a no-op in every real browser — the element does not
      // yet know how long it is — which is why the restore waits for this event rather
      // than happening at the moment the URL is swapped.
      video.currentTime = resume;
      setCurrentTime(resume);
      if (playingRef.current) attemptPlay(video);
    }
  }, [attemptPlay, onPlayable]);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    onProgress?.(video.currentTime);
  }, [onProgress]);

  const onError = useCallback(() => {
    const video = videoRef.current;
    onNeedsResign(video?.currentTime ?? 0);
  }, [onNeedsResign]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) attemptPlay(video);
    else video.pause();
  }, [attemptPlay]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (video) video.muted = next;
  }, [muted]);

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // Two vendors, one intent. `requestFullscreen` can reject (no user activation, an
    // iframe without `allowfullscreen`); a rejected fullscreen is not an error worth
    // showing anybody.
    const request = video.requestFullscreen?.bind(video);
    if (!request) return;
    const result: unknown = request();
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch(() => undefined);
    }
  }, []);

  const onSeek = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const track = trackRef.current;
    if (!video || !track) return;
    const rect = track.getBoundingClientRect();
    const target = seekTargetFromClick(event.clientX, rect, video.duration);
    video.currentTime = target;
    setCurrentTime(target);
  }, []);

  const percent = progressPercent(currentTime, duration);
  const ready = src !== null && !failed;

  return (
    <div
      data-testid="gallery-watch-player"
      style={{
        aspectRatio: "9 / 16",
        borderRadius: 14,
        overflow: "hidden",
        position: "relative",
        border: "1px solid var(--sg-line2)",
        boxShadow: "0 24px 60px rgba(0,0,0,.45)",
        background: posterUrl
          ? `center / cover no-repeat url(${JSON.stringify(posterUrl)})`
          : POSTER_ART,
      }}
    >
      {ready && (
        <video
          ref={videoRef}
          data-testid="gallery-watch-video"
          src={src}
          poster={posterUrl ?? undefined}
          title={title}
          playsInline
          preload="metadata"
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onDurationChange={onLoadedMetadata}
          onPlay={() => setPlayingState(true)}
          onPause={() => setPlayingState(false)}
          onEnded={() => setPlayingState(false)}
          onError={onError}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            background: "#000",
          }}
        />
      )}

      {/* Vignette — §1.3's `inset 0 0 120px rgba(20,8,4,.7)`. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: "inset 0 0 120px rgba(20,8,4,.7)",
          pointerEvents: "none",
        }}
      />

      {src === null && !failed && (
        <p
          data-testid="gallery-watch-loading"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            margin: 0,
            fontFamily: "var(--font-zilla)",
            fontSize: 13,
            color: "var(--sg-dim)",
            textShadow: "0 2px 12px rgba(0,0,0,.8)",
          }}
        >
          {"Getting the video…"}
        </p>
      )}

      {failed && (
        <div
          data-testid="gallery-watch-player-error"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 24,
            textAlign: "center",
            background: "rgba(8,5,4,.78)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-zilla)",
              fontSize: 15,
              color: "#fff",
            }}
          >
            {"That video didn't load."}
          </p>
          <button
            type="button"
            data-testid="gallery-watch-player-retry"
            onClick={onRetry}
            className="cursor-pointer"
            style={{
              padding: "9px 20px",
              borderRadius: 11,
              border: "1px solid rgba(255,255,255,.42)",
              background: "transparent",
              fontWeight: 700,
              fontSize: 13,
              color: "#fff",
            }}
          >
            {"Try again"}
          </button>
        </div>
      )}

      {ready && !playing && (
        <button
          type="button"
          data-testid="gallery-watch-playpause"
          aria-label={`Play ${title}`}
          onClick={togglePlay}
          className="cursor-pointer"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 66,
            height: 66,
            borderRadius: "50%",
            background: "rgba(22,17,13,.42)",
            border: "1.5px solid rgba(255,240,220,.8)",
            color: "#fff",
            fontSize: 22,
            paddingLeft: 4,
            display: "grid",
            placeItems: "center",
          }}
        >
          {"▶"}
        </button>
      )}

      {ready && (
        <div
          data-testid="gallery-watch-transport"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "14px 16px",
            background: "linear-gradient(transparent,rgba(0,0,0,.7))",
          }}
        >
          <div
            ref={trackRef}
            data-testid="gallery-watch-scrub"
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            onClick={onSeek}
            className="cursor-pointer"
            style={{
              position: "relative",
              height: 4,
              borderRadius: 3,
              background: "rgba(255,255,255,.28)",
            }}
          >
            <div
              data-testid="gallery-watch-scrub-fill"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${percent}%`,
                // Gold→red, per 16a. 13b draws the reverse; the watch page uses this one.
                background: "linear-gradient(90deg,#d4a24c,#c0392b)",
                borderRadius: 3,
              }}
            />
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: `${percent}%`,
                top: "50%",
                transform: "translate(-50%,-50%)",
                width: 11,
                height: 11,
                borderRadius: "50%",
                background: "#fff",
              }}
            />
          </div>

          <div
            className="flex items-center"
            style={{
              marginTop: 9,
              gap: 10,
              color: "#fff",
              fontFamily: "monospace",
              fontSize: 11,
            }}
          >
            <button
              type="button"
              data-testid="gallery-watch-toggle"
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              className="cursor-pointer"
              style={TRANSPORT_BUTTON}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <span data-testid="gallery-watch-timecode">
              {`${formatPlayerTime(currentTime)} / ${formatPlayerTime(duration)}`}
            </span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              data-testid="gallery-watch-mute"
              aria-label={muted ? "Unmute" : "Mute"}
              aria-pressed={muted}
              onClick={toggleMute}
              className="cursor-pointer"
              style={TRANSPORT_BUTTON}
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              type="button"
              data-testid="gallery-watch-fullscreen"
              aria-label="Fullscreen"
              onClick={toggleFullscreen}
              className="cursor-pointer"
              style={TRANSPORT_BUTTON}
            >
              {"⛶"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** §1.3's poster art, used only when the item has no signed thumbnail of its own. */
const POSTER_ART =
  "radial-gradient(circle at 50% 42%,#ffffff 0%,#ffe8a8 13%,#f0a43a 32%,#8a3a1e 60%,#160f14 90%)";

const TRANSPORT_BUTTON = {
  background: "transparent",
  border: "none",
  color: "#fff",
  fontFamily: "monospace",
  fontSize: 11,
  lineHeight: 1,
  padding: 0,
} as const;
