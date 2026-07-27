"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PublishToGalleryDialog from "../gallery/publish-to-gallery-dialog";
import { useSession } from "../session-provider";
import { fetchMyRenders, unpublishGalleryItem } from "@/lib/gallery/gallery-data";
import { renderToVideoCard, type VideoCard } from "@/lib/your-videos/your-videos-model";
import type { GalleryItemDto, RenderJobDto } from "@/lib/api/contracts";

/**
 * "Your videos" — the mount-gated list behind `/your-videos`.
 *
 * NO WIREFRAME (design-delta §2.7 / §9-Q3 — NOT "§5", which is "System architecture
 * (target)" and declares nothing out of scope; miscitation corrected 2026-07-26). Turns
 * 16/17 still do not draw this screen. The grid, the poster block, the status chip and
 * the footer row are adapted from 10a's `recent-projects.tsx` so this reads as the same
 * product; the publish affordance is the MINIMAL one the plan asks for.
 *
 * Two rules it exists to enforce, both from the model:
 *  - a card shows a duration badge ONLY when `framesTotal > 0` — 0 means the worker has
 *    not resolved the composition yet, and `"0:00"` would be a lie about the video;
 *  - "Share to gallery" appears only when the render satisfies the API's OWN three
 *    publish preconditions, so the button is absent rather than present-and-409ing.
 */
export default function YourVideosList() {
  const { session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [renders, setRenders] = useState<RenderJobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<RenderJobDto | null>(null);
  /** renderJobId → the gallery item it was published to, for the ones published in
   *  THIS session. The render DTO carries no gallery link, so this is the only thing we
   *  can honestly say about publication state without a second endpoint. */
  const [published, setPublished] = useState<Record<string, GalleryItemDto>>({});
  /** renderJobId → why the last un-publish attempt did not take. A refused DELETE used
   *  to return silently, which reads as a dead button on a card that still says
   *  "Remove from gallery". */
  const [unpublishError, setUnpublishError] = useState<Record<string, string>>({});

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const reload = useCallback(async () => {
    setLoading(true);
    const list = await fetchMyRenders();
    setRenders(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Starting a fetch is the external-system synchronization this effect exists for;
    // `reload` is a stable callback, so it runs once per mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [mounted, reload]);

  const cards: { dto: RenderJobDto; card: VideoCard }[] = renders.map((dto) => ({
    dto,
    card: renderToVideoCard(dto),
  }));

  return (
    <>
      <header
        className="px-4 sm:px-[34px]"
        style={{ paddingTop: 46, paddingBottom: 24 }}
      >
        <div
          style={{
            fontFamily: "var(--font-barlow-semi)",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: ".26em",
            color: "var(--sg-dim)",
            marginBottom: 14,
          }}
        >
          {"YOUR LIBRARY"}
        </div>
        <h1
          style={{
            fontFamily: "var(--font-anton)",
            fontSize: "clamp(2rem, 6vw, 46px)",
            lineHeight: 0.98,
            letterSpacing: ".005em",
          }}
        >
          {"YOUR VIDEOS."}
        </h1>
      </header>

      {mounted && (
        <div data-testid="your-videos-list" className="px-4 sm:px-[34px]">
          {cards.length > 0 && (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              style={{ gap: 16 }}
            >
              {cards.map(({ dto, card }) => (
                <article
                  key={card.id}
                  data-testid={`your-videos-card-${card.id}`}
                  data-render-id={card.id}
                  style={{
                    border: "1px solid var(--sg-line2)",
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "var(--sg-panel)",
                  }}
                >
                  <div
                    style={{
                      height: 118,
                      position: "relative",
                      overflow: "hidden",
                      background: "var(--sg-poster)",
                    }}
                  >
                    <div
                      aria-hidden
                      style={{
                        position: "absolute",
                        inset: 0,
                        boxShadow: "inset 0 0 70px rgba(20,8,4,.7)",
                      }}
                    />
                    <span
                      data-testid={`your-videos-chip-${card.id}`}
                      style={{
                        position: "absolute",
                        top: 9,
                        right: 10,
                        fontWeight: 700,
                        fontSize: 9,
                        letterSpacing: ".1em",
                        padding: "3px 8px",
                        borderRadius: 5,
                        ...CHIP_TONES[card.tone],
                      }}
                    >
                      {card.chip}
                    </span>
                    {card.durationLabel && (
                      <span
                        data-testid={`your-videos-duration-${card.id}`}
                        style={{
                          position: "absolute",
                          bottom: 9,
                          right: 10,
                          padding: "2px 7px",
                          borderRadius: 5,
                          fontFamily: "var(--font-barlow-semi)",
                          fontWeight: 700,
                          fontSize: 10.5,
                          color: "#fff",
                          background: "rgba(0,0,0,.62)",
                        }}
                      >
                        {card.durationLabel}
                      </span>
                    )}
                  </div>

                  <div style={{ padding: "13px 15px 14px" }}>
                    <div style={{ fontSize: 12, color: "var(--sg-dim)" }}>
                      {card.specLine}
                    </div>
                    {card.error && (
                      <div
                        data-testid={`your-videos-error-${card.id}`}
                        style={{ marginTop: 6, fontSize: 12, color: "var(--sg-red)" }}
                      >
                        {card.error}
                      </div>
                    )}
                    <div
                      className="flex items-center"
                      style={{
                        gap: 10,
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: "1px solid var(--sg-line)",
                        fontSize: 11.5,
                        color: "var(--sg-dim)",
                      }}
                    >
                      <span>{card.createdLabel}</span>
                      <div style={{ flex: 1 }} />
                      {published[card.id] ? (
                        <button
                          type="button"
                          data-testid={`your-videos-unpublish-${card.id}`}
                          onClick={() => void onUnpublish(card.id)}
                          className="cursor-pointer"
                          style={linkButton}
                        >
                          {"Remove from gallery"}
                        </button>
                      ) : card.isPublishable ? (
                        <button
                          type="button"
                          data-testid={`your-videos-publish-${card.id}`}
                          onClick={() => setPublishing(dto)}
                          className="cursor-pointer"
                          style={{ ...linkButton, color: "var(--sg-red)" }}
                        >
                          {"Share to gallery ▸"}
                        </button>
                      ) : (
                        <Link
                          href={`/studio/${card.projectId}`}
                          data-testid={`your-videos-open-${card.id}`}
                          style={{ fontWeight: 700, color: "var(--sg-dim)" }}
                        >
                          {"Open project ▸"}
                        </Link>
                      )}
                    </div>
                    {unpublishError[card.id] && (
                      <div
                        data-testid={`your-videos-unpublish-error-${card.id}`}
                        style={{ marginTop: 8, fontSize: 11.5, color: "var(--sg-red)" }}
                      >
                        {unpublishError[card.id]}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* UNDESIGNED (design-delta §2.7 / §9-Q3 — NOT "§5"; miscitation corrected
              2026-07-26). Turn 17b's card 4a designs an empty state for the PUBLIC
              gallery grid, not for this authed list, so this stays a placeholder. */}
          {cards.length === 0 && (
            <p
              data-testid={loading ? "your-videos-loading" : "your-videos-empty"}
              style={{
                padding: "44px 0",
                textAlign: "center",
                fontFamily: "var(--font-zilla)",
                fontSize: 15,
                color: "var(--sg-dim)",
              }}
            >
              {loading
                ? "Loading your videos…"
                : session.isAuthed
                  ? "You haven't rendered a video yet. Open a project and render one."
                  : "Sign in to see the videos you've rendered."}
            </p>
          )}
        </div>
      )}

      {/*
        THE SAME DIALOG THE GALLERY HEADER OPENS (Turn 16b), with this row's render
        preselected. There is no second publish surface any more: the local
        `PublishDialog` that used to live at the bottom of this file is deleted.

        `key` IS STILL THE RESET, and the rule it protects is unchanged — six `useState`
        initializers live inside that dialog, and a leak between two opens means the
        second render gets published under the FIRST one's `scriptureReference`, the
        string the server derives `scriptureBook` from AND the string that prints
        verbatim on a public card. Keying is cheaper and harder to get wrong than an
        effect that resets six fields: React unmounts the old instance, so there is no
        field anyone can forget to add to a reset list.

        Two things moved WITH the dialog rather than staying here:
          - `"none"` as the closed state is now expressed by not mounting it at all,
            which is a strictly stronger reset;
          - the SWITCH-PROJECT reset (16b lets you change the render from inside the
            dialog, which this screen never could) lives in the dialog's own `key=`,
            covered by `tests/unit/publish-to-gallery-dialog.test.tsx` U-PD2.

        Publishing from HERE deliberately does not navigate away, unlike the gallery
        header's CTA: this is the library screen, the card immediately gains its
        "Remove from gallery" undo, and teleporting someone out of their own library
        after one action would take that undo with it.
      */}
      {publishing && (
        <PublishToGalleryDialog
          key={publishing.id}
          open
          initialRenderId={publishing.id}
          onClose={() => setPublishing(null)}
          onPublished={(item) => {
            setPublished((p) => ({ ...p, [item.renderJobId]: item }));
            setPublishing(null);
          }}
        />
      )}
    </>
  );

  async function onUnpublish(renderId: string) {
    const item = published[renderId];
    if (!item) return;
    setUnpublishError((e) => (renderId in e ? omit(e, renderId) : e));
    if (!(await unpublishGalleryItem(item.id))) {
      // Say it. The item genuinely IS still in the gallery, the button stays in place,
      // and the user gets to try again — a bare `return` here left a card insisting
      // "Remove from gallery" while the click did nothing observable at all.
      setUnpublishError((e) => ({
        ...e,
        [renderId]: "That didn't remove it — it's still in the gallery. Try again.",
      }));
      return;
    }
    setPublished((p) => omit(p, renderId));
  }
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

const linkButton = {
  background: "transparent",
  border: "none",
  padding: 0,
  fontWeight: 700,
  fontSize: 11.5,
  color: "var(--sg-dim)",
};

const CHIP_TONES: Record<
  "done" | "progress" | "error",
  { color: string; background: string }
> = {
  done: { color: "#160f14", background: "rgba(255,232,168,.94)" },
  progress: { color: "#fff", background: "rgba(201,154,63,.9)" },
  error: { color: "#fff", background: "rgba(192,57,43,.9)" },
};
