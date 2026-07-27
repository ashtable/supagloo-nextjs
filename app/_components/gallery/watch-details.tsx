"use client";

import { useCallback, useState } from "react";
import UpvotePill from "./upvote-pill";
import {
  formatRelativeTime,
  galleryDurationLabel,
} from "@/lib/gallery/gallery-model";
import { scenePosterGradient } from "@/lib/gallery/scene-poster";
import type { GalleryItemDetailDto } from "@/lib/api/contracts";

/**
 * Turn 16a's right-hand column (Step 4 §1.4): eyebrow → 52px Anton title → creator +
 * actions row → SCRIPTURE → HOW IT WAS MADE.
 *
 * ── EVERY SECTION BELOW THE CREATOR ROW IS CONDITIONAL, AND THAT IS THE POINT ───
 * `makingOf` is a publish-time snapshot of the project manifest. It is `null` for every
 * item published before this cycle, and for any publish whose best-effort manifest read
 * failed. Those items are not broken and their pages are not degraded: the video, the
 * title, the passage reference, the creator and the upvote are all first-class fields on
 * the row itself. So SCRIPTURE and HOW IT WAS MADE simply are not there, rather than
 * being there and empty.
 *
 * ── WHAT THE DESIGN DRAWS THAT IS DELIBERATELY NOT RENDERED ─────────────────────
 *  - **`@maryk`.** There is no handle column on `User`, and the api's own DTO records
 *    the same gap. The creator line is `displayName · N public videos · shared X ago`.
 *    Printing `@Mary Kanu` would fabricate an identifier nothing can resolve.
 *  - **`🎬 Cosmic visuals`.** No field backs it at any layer — a manifest scene carries
 *    a per-scene `visualPrompt`, which is a prompt, not a style. There is no code path
 *    below that could emit this chip, which is what `U-WV4` asserts.
 *
 * ── WHAT SHIPS VISIBLY DISABLED ────────────────────────────────────────────────
 * `⑂ Remix this`, exactly as §1.4b draws it (`opacity:.5`, `cursor:not-allowed`,
 * `title="Remixing is disabled"`). It follows the house recipe from
 * `start-cards.tsx:150` — `aria-disabled` + `data-disabled`, and **no native `disabled`
 * attribute**, so an e2e click lands and provably does nothing rather than being
 * swallowed by the browser before it reaches the page.
 */
export default function WatchDetails({
  item,
  now,
  voting,
  onVote,
}: {
  item: GalleryItemDetailDto;
  /** Epoch ms captured once at mount, so `shared X ago` cannot re-render into a
   *  different answer mid-session or differ between server and client. */
  now: number;
  voting: boolean;
  onVote: () => void;
}) {
  const duration = galleryDurationLabel(item.durationSeconds);
  const shared = formatRelativeTime(item.publishedAt, now);
  const making = item.makingOf;

  const eyebrow = [
    item.scriptureReference.toUpperCase(),
    item.translation.toUpperCase(),
    duration,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const meta = [
    `${item.owner.publicVideoCount} public video${item.owner.publicVideoCount === 1 ? "" : "s"}`,
    shared ? `shared ${shared}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const chips: { key: string; label: string }[] = [];
  if (making?.narratorVoiceLabel) {
    chips.push({ key: "voice", label: `🔊 ${making.narratorVoiceLabel}` });
  }
  if (making?.musicStyle) {
    chips.push({ key: "music", label: `🎻 ${making.musicStyle}` });
  }
  if (making?.captionsOn) {
    chips.push({ key: "captions", label: "✎ Captions on" });
  }
  const scenes = making?.scenes ?? [];
  const hasMadeOf = chips.length > 0 || scenes.length > 0;

  return (
    <>
      <div>
        <div data-testid="gallery-watch-eyebrow" style={EYEBROW}>
          {eyebrow}
        </div>
        <h1
          data-testid="gallery-watch-title"
          style={{
            fontFamily: "var(--font-anton)",
            fontSize: "clamp(2rem, 5vw, 52px)",
            lineHeight: 0.98,
            margin: 0,
          }}
        >
          {item.title}
        </h1>
      </div>

      <div
        data-testid="gallery-watch-creator"
        className="flex flex-wrap items-center"
        style={{
          gap: 14,
          paddingBottom: 20,
          borderBottom: "1px solid var(--sg-line)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "linear-gradient(150deg,#6d3b26,#c99a3f)",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 15,
            color: "#fff",
            flex: "none",
          }}
        >
          {item.owner.avatarInitials}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            data-testid="gallery-watch-creator-name"
            style={{ fontWeight: 700, fontSize: 15 }}
          >
            {item.owner.displayName}
          </div>
          <div
            data-testid="gallery-watch-creator-meta"
            style={{ fontSize: 12.5, color: "var(--sg-dim)" }}
          >
            {meta}
          </div>
        </div>

        <UpvotePill
          itemId={item.id}
          upvoteCount={item.upvoteCount}
          viewerHasUpvoted={item.viewerHasUpvoted}
          busy={voting}
          format="exact"
          size="large"
          onVote={onVote}
        />

        <ShareButton title={item.title} />

        <span
          data-testid="gallery-watch-remix"
          role="button"
          aria-disabled="true"
          data-disabled="true"
          title="Remixing is disabled"
          className="flex items-center"
          style={{
            gap: 8,
            padding: "11px 20px",
            borderRadius: 11,
            border: "1px solid var(--sg-line2)",
            background: "var(--sg-panel)",
            fontWeight: 700,
            fontSize: 14,
            color: "var(--sg-dim)",
            opacity: 0.5,
            cursor: "not-allowed",
          }}
        >
          {"⑂ Remix this"}
        </span>
      </div>

      {making?.scriptureText && (
        <section>
          <div style={SECTION_EYEBROW}>{"SCRIPTURE"}</div>
          <p
            data-testid="gallery-watch-scripture"
            style={{
              // Upright, NOT italic: 13b's inspector italicises quoted scripture and
              // 16a does not. On a page whose whole subject is one passage, italics
              // would set the passage apart from itself.
              fontFamily: "var(--font-zilla)",
              fontSize: 17,
              lineHeight: 1.6,
              borderLeft: "3px solid var(--sg-red)",
              paddingLeft: 16,
              margin: 0,
              color: "var(--sg-fg)",
            }}
          >
            {making.scriptureText}
          </p>
        </section>
      )}

      {hasMadeOf && (
        <section data-testid="gallery-watch-madeof">
          <div style={SECTION_EYEBROW}>{"HOW IT WAS MADE"}</div>

          {chips.length > 0 && (
            <div
              className="flex flex-wrap"
              style={{ gap: 10, marginBottom: 14 }}
            >
              {chips.map((chip) => (
                <span
                  key={chip.key}
                  data-testid={`gallery-watch-chip-${chip.key}`}
                  style={{
                    padding: "7px 13px",
                    borderRadius: 20,
                    border: "1px solid var(--sg-line2)",
                    fontWeight: 600,
                    fontSize: 12.5,
                    color: "var(--sg-dim)",
                  }}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          )}

          {scenes.length > 0 && (
            <div
              data-testid="gallery-watch-scenes"
              className="grid grid-cols-2 sm:grid-cols-4"
              style={{ gap: 10 }}
            >
              {scenes.map((scene, position) => (
                <div
                  key={`${scene.index}-${position}`}
                  data-testid={`gallery-watch-scene-${scene.index}`}
                  style={{
                    border: "1px solid var(--sg-line)",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "var(--sg-panel)",
                  }}
                >
                  <div
                    aria-hidden
                    data-testid={`gallery-watch-poster-${scene.index}`}
                    style={{
                      height: 70,
                      // The ramp is STRETCHED across however many scenes there are, so
                      // a 7-scene item still runs darkest → brightest instead of
                      // wrapping back to the start halfway through.
                      background: scenePosterGradient(position + 1, scenes.length),
                    }}
                  />
                  <div style={{ padding: "9px 10px" }}>
                    <div style={{ fontWeight: 700, fontSize: 11.5 }}>
                      {`${String(scene.index).padStart(2, "0")} · ${scene.name}`}
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--sg-dim)",
                        marginTop: 2,
                      }}
                    >
                      {`${scene.durationSeconds.toFixed(1)}s`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

/**
 * `↗ Share` — copies this page's URL.
 *
 * The design draws no success state (§1.5 leaves both outcomes blank), and a control
 * that copies something silently is indistinguishable from one that is broken. So the
 * label reports what happened, in the same vocabulary as the action, and returns to
 * itself. A refused clipboard (an insecure origin, a denied permission) says so rather
 * than pretending; there is nothing to retry and nothing to apologise for.
 */
function ShareButton({ title }: { title: string }) {
  const [label, setLabel] = useState<string | null>(null);

  const onShare = useCallback(async () => {
    const url = typeof window === "undefined" ? "" : window.location.href;
    try {
      const share = navigator.share?.bind(navigator);
      if (share) {
        await share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setLabel("✓ Link copied");
    } catch {
      setLabel("Copy the address bar");
    } finally {
      setTimeout(() => setLabel(null), 2500);
    }
  }, [title]);

  return (
    <button
      type="button"
      data-testid="gallery-watch-share"
      onClick={() => void onShare()}
      className="cursor-pointer"
      style={{
        padding: "11px 16px",
        border: "1px solid var(--sg-line2)",
        borderRadius: 11,
        background: "transparent",
        fontWeight: 700,
        fontSize: 14,
        color: "var(--sg-fg)",
        whiteSpace: "nowrap",
      }}
    >
      {label ?? "↗ Share"}
    </button>
  );
}

const EYEBROW = {
  fontFamily: "var(--font-barlow-semi)",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: ".22em",
  color: "var(--sg-dim)",
  marginBottom: 9,
} as const;

const SECTION_EYEBROW = {
  fontFamily: "var(--font-barlow-semi)",
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: ".18em",
  color: "var(--sg-dim)",
  marginBottom: 10,
} as const;
