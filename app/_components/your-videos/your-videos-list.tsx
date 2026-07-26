"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Modal from "../modal";
import { useSession } from "../session-provider";
import {
  fetchMyRenders,
  publishRenderToGallery,
  unpublishGalleryItem,
} from "@/lib/gallery/gallery-data";
import { renderToVideoCard, type VideoCard } from "@/lib/your-videos/your-videos-model";
import type { GalleryItemDto, RenderJobDto } from "@/lib/api/contracts";

/**
 * "Your videos" — the mount-gated list behind `/your-videos`.
 *
 * NO WIREFRAME (design-delta §5). The grid, the poster block, the status chip and the
 * footer row are adapted from 10a's `recent-projects.tsx` so this reads as the same
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

          {/* UNDESIGNED (design-delta §5) — empty/loading states are out of scope. */}
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
        `key` IS THE RESET. `PublishDialog` is mounted unconditionally (the only
        visibility gate is `open` on its inner `<Modal>`), so without a key its six
        `useState` initializers run ONCE PER PAGE LOAD and survive every close: the
        second "Share to gallery" opened carrying the FIRST render's title, its scripture
        reference, its translation and any error it had left behind. That is not a
        cosmetic leak — `scriptureReference` is what the server derives `scriptureBook`
        from AND what renders verbatim on the public card, so the likely accident was
        publishing B under A's reference. Exactly the class of lie D7 removed when it
        refused to let the client send `durationSeconds`.

        Keying on the render id is cheaper and harder to get wrong than an effect that
        resets six fields: React unmounts the old instance, so there is no field anyone
        can forget to add to the reset list. `"none"` is the closed state, which means
        closing the dialog is itself a reset.
      */}
      <PublishDialog
        key={publishing?.id ?? "none"}
        render={publishing}
        onClose={() => setPublishing(null)}
        onPublished={(item) => {
          setPublished((p) => ({ ...p, [item.renderJobId]: item }));
          setPublishing(null);
        }}
      />
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

/**
 * UNDESIGNED (design-delta §5) — the publish dialog is explicitly out of scope, so this
 * is the minimal placeholder: the three fields the SERVER cannot derive (title,
 * scripture reference, translation) plus an optional description, and nothing else.
 * `scriptureBook`, `durationSeconds` and both asset keys are derived upstream on
 * purpose — a client that could send a duration could make the `mm:ss` badge lie.
 */
function PublishDialog({
  render,
  onClose,
  onPublished,
}: {
  render: RenderJobDto | null;
  onClose: () => void;
  onPublished: (item: GalleryItemDto) => void;
}) {
  const [title, setTitle] = useState("");
  const [reference, setReference] = useState("");
  const [translation, setTranslation] = useState("BSB");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!render) return;
    setBusy(true);
    setError(null);
    const item = await publishRenderToGallery(render.id, {
      title: title.trim(),
      description: description.trim(),
      scriptureReference: reference.trim(),
      translation: translation.trim(),
      visibility: "public",
    });
    setBusy(false);
    if (!item) {
      setError("That didn't publish. Check the title and reference, then try again.");
      return;
    }
    onPublished(item);
  };

  const ready = title.trim().length > 0 && reference.trim().length > 0 && !busy;

  return (
    <Modal
      open={render !== null}
      onClose={onClose}
      title="SHARE TO GALLERY"
      testId="publish-dialog"
      width={460}
    >
      <div className="flex flex-col" style={{ gap: 12, padding: "18px 22px 22px" }}>
        <Field label="Title" testId="publish-title" value={title} onChange={setTitle} />
        <Field
          label="Scripture reference"
          testId="publish-reference"
          value={reference}
          onChange={setReference}
          placeholder="Matthew 4:1-11"
        />
        <Field
          label="Translation"
          testId="publish-translation"
          value={translation}
          onChange={setTranslation}
        />
        <Field
          label="Description"
          testId="publish-description"
          value={description}
          onChange={setDescription}
        />
        {error && (
          <span data-testid="publish-error" style={{ fontSize: 12.5, color: "var(--sg-red)" }}>
            {error}
          </span>
        )}
        <button
          type="button"
          data-testid="publish-submit"
          disabled={!ready}
          onClick={() => void submit()}
          className="cursor-pointer"
          style={{
            marginTop: 4,
            padding: "12px 18px",
            borderRadius: 12,
            border: "none",
            backgroundImage: "var(--sg-grad)",
            fontWeight: 700,
            fontSize: 14,
            color: "#fff",
            opacity: ready ? 1 : 0.5,
          }}
        >
          {busy ? "Publishing…" : "Publish"}
        </button>
      </div>
    </Modal>
  );
}

function Field({
  label,
  testId,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  testId: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col" style={{ gap: 5 }}>
      <span
        style={{
          fontFamily: "var(--font-barlow-semi)",
          fontWeight: 700,
          fontSize: 10.5,
          letterSpacing: ".14em",
          color: "var(--sg-dim)",
        }}
      >
        {label.toUpperCase()}
      </span>
      <input
        data-testid={testId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "9px 12px",
          borderRadius: 10,
          border: "1px solid var(--sg-line2)",
          background: "var(--sg-bg)",
          fontFamily: "var(--font-barlow)",
          fontSize: 13,
          color: "var(--sg-fg)",
          outline: "none",
        }}
      />
    </label>
  );
}
