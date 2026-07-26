"use client";

import Modal from "../modal";
import type { GalleryItemDto } from "@/lib/api/contracts";

/**
 * UNDESIGNED (design-delta §5) — the item detail / watch page is out of scope, so
 * playback ships as this minimal placeholder: the shared `Modal` around a plain
 * `<video controls autoPlay>` pointed at the item's `stream-url`.
 *
 * Deliberately NOT `@remotion/player`: that renders a composition from source and is
 * the studio's PREVIEW tool. What the gallery plays is a finished, encoded mp4 in S3.
 *
 * `src` is a 120-second presigned URL on the PUBLIC S3 endpoint, so the browser fetches
 * the object directly and this app never proxies bytes. `presignPublicKey` signs
 * locally, which means a 200 here says nothing about the object existing — a missing
 * object shows up only as a video stuck at `readyState === 0`.
 */
export default function GalleryPlayerModal({
  item,
  url,
  onClose,
}: {
  item: GalleryItemDto | null;
  url: string | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={item?.scriptureReference ?? "PLAYBACK"}
      testId="gallery-player"
      width={860}
    >
      <div style={{ padding: 18 }}>
        {url ? (
          <video
            data-testid="gallery-player-video"
            src={url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            style={{
              width: "100%",
              borderRadius: 12,
              background: "#000",
              display: "block",
            }}
          />
        ) : (
          <p
            data-testid="gallery-player-loading"
            style={{
              padding: "56px 0",
              textAlign: "center",
              fontFamily: "var(--font-zilla)",
              fontSize: 15,
              color: "var(--sg-dim)",
            }}
          >
            {"Getting the video…"}
          </p>
        )}
        {item && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontFamily: "var(--font-anton)",
                fontSize: 22,
                lineHeight: 1.05,
              }}
            >
              {item.title}
            </div>
            <div
              style={{ marginTop: 6, fontSize: 12.5, color: "var(--sg-dim)" }}
            >
              {item.owner.displayName}
              {" · "}
              {item.scriptureReference}
              {" · "}
              {item.translation}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
