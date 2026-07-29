"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "../modal";
import { fetchDemoStreamUrl } from "@/lib/landing/demo-video";

/**
 * The landing page's "▶ Watch the Genesis demo" player.
 *
 * A MODAL, deliberately, even though the gallery went the other way: `GalleryPlayerModal`
 * was deleted so a card's ▶ navigates to a watch page instead. That is right for the
 * gallery, where the video IS the destination and deserves a URL. It is wrong here — the
 * landing page is a pitch, and the demo is evidence inside it. Navigating away to prove the
 * point loses the point.
 *
 * Native `<video controls>` rather than a custom transport: fullscreen, volume, scrubbing
 * and keyboard control all come free and correct, including on iOS where a custom overlay
 * fights the platform player. The URL is presigned against the PUBLIC S3 endpoint, so the
 * browser streams from the bucket directly and HTTP range requests (seeking) work.
 *
 * MOUNTED ONLY WHILE OPEN (the parent gates it), so mount IS open: a visitor who never
 * clicks the button costs no request, and a 120-second presign fetched at page load would
 * usually be dead before anyone used it. Unmounting on close is also what discards the URL,
 * so a stale presign can never be replayed into the next open.
 */
export default function DemoVideoModal({ onClose }: { onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /** Guards the re-sign below to ONE attempt per open, so an object that is genuinely
   *  gone cannot spin a fetch/error loop against the API. */
  const resignedRef = useRef(false);

  // NO `setFailed(false)` on the way in, and it is not an omission: `failed` is provably
  // already false at every call site. It starts false; the mount effect runs before
  // anything can set it; and the only other caller is the re-sign below, which is reachable
  // only while a <video> is rendering — which requires `src`, which requires not-failed.
  // Resetting it here would be a synchronous setState inside the effect (a cascading
  // render, and a lint error) to restore a value it already holds.
  const load = useCallback(async () => {
    const url = await fetchDemoStreamUrl();
    if (url) {
      setSrc(url);
      return;
    }
    // Clear the source as well as raising the flag. The render picks the video branch on
    // `src`, so leaving a stale URL in place would keep a broken player on screen with the
    // error state invisible behind it — which is how this failed the first time.
    setSrc(null);
    setFailed(true);
  }, []);

  // MOUNT-GATED, not `open`-gated: the parent renders this only while the demo is open, so
  // closing UNMOUNTS it. That is what makes every piece of per-open state — the URL, the
  // failure flag, the re-sign guard — reset for free, and it is why there is no teardown
  // branch here clearing them by hand. A short-lived presign must never survive a close and
  // be replayed into the next open, so "closing throws the state away" is the behaviour we
  // want anyway; letting React's lifecycle express it beats an effect that fights it.
  //
  // The disable is a FALSE POSITIVE, not a waiver: `load`'s first statement is an `await`,
  // so nothing it does runs in the same tick as the effect and no render can cascade. The
  // rule cannot see through the async boundary — it flags the call site because a setState
  // is reachable from it at all. Same shape as `hero-lede.tsx`'s mount gate, which carries
  // the same disable for the same reason.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** A presign that expired mid-session surfaces as a media error, not an HTTP one — the
   *  browser owns the request. One silent re-sign covers the realistic case (the visitor
   *  left the modal open past the TTL, then hit play). */
  const onVideoError = () => {
    if (resignedRef.current) {
      setSrc(null);
      setFailed(true);
      return;
    }
    resignedRef.current = true;
    void load();
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible
      title="GENESIS 1 · DEMO"
      ariaLabel="Watch the Genesis demo"
      testId="demo-video-modal"
      width={420}
    >
      <div style={{ padding: "18px 18px 22px" }}>
        {src ? (
          <video
            data-testid="demo-video"
            src={src}
            controls
            autoPlay
            playsInline
            onError={onVideoError}
            style={{
              display: "block",
              width: "100%",
              // 9:16 source (1080×1920). Capped in vh so the controls stay on-screen on a
              // laptop; the Modal's own body scroll is the backstop on very short viewports.
              maxHeight: "68vh",
              aspectRatio: "9 / 16",
              borderRadius: 12,
              background: "#000",
              outline: "none",
            }}
          />
        ) : (
          <div
            data-testid={failed ? "demo-video-error" : "demo-video-loading"}
            role={failed ? "alert" : "status"}
            style={{
              display: "grid",
              placeItems: "center",
              width: "100%",
              aspectRatio: "9 / 16",
              maxHeight: "68vh",
              borderRadius: 12,
              background: "#0f0b07",
              border: "1px solid rgba(230,180,120,.18)",
              color: failed ? "var(--sg-red)" : "var(--sg-dim)",
              fontSize: 13,
              textAlign: "center",
              padding: 20,
            }}
          >
            {failed
              ? "The demo couldn't be loaded right now. Please try again."
              : "Loading the demo…"}
          </div>
        )}
      </div>
    </Modal>
  );
}
