"use client";

import Modal from "../modal";
import Link from "next/link";

/**
 * UNDESIGNED (design-delta §5) — the publish dialog is explicitly out of scope, so this
 * is the minimal placeholder: it says where publishing actually happens and links there.
 *
 * The real publish flow already exists end to end (`POST /v1/renders/:id/gallery`, wired
 * through `lib/gallery/gallery-data.ts` and `app/_components/your-videos/`), and a
 * finished render is the only thing that CAN be published — which is why this dialog
 * points at "Your videos" rather than inventing a second, worse entry point that would
 * have to re-ask for a render, a title and a reference.
 */
export default function ShareYoursDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="SHARE YOURS"
      testId="gallery-share-dialog"
      width={440}
    >
      <div className="flex flex-col" style={{ gap: 16, padding: "20px 22px 24px" }}>
        <p
          style={{
            fontFamily: "var(--font-zilla)",
            fontSize: 15,
            lineHeight: 1.5,
            color: "var(--sg-dim)",
          }}
        >
          {"You publish a video once it has finished rendering. Open Your videos and pick one."}
        </p>
        <Link
          href="/your-videos"
          data-testid="gallery-share-goto-your-videos"
          className="flex items-center justify-center cursor-pointer"
          style={{
            padding: "12px 18px",
            borderRadius: 12,
            backgroundImage: "var(--sg-grad)",
            boxShadow:
              "inset 0 1px 0 rgba(255,235,205,.4), 0 8px 20px rgba(192,57,43,.3)",
            fontWeight: 700,
            fontSize: 14,
            color: "#fff",
          }}
        >
          {"Open Your videos ▸"}
        </Link>
      </div>
    </Modal>
  );
}
