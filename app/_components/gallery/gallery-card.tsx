"use client";

import RankBadge from "./rank-badge";
import UpvotePill from "./upvote-pill";
import { galleryDurationLabel } from "@/lib/gallery/gallery-model";
import type { GalleryItemDto } from "@/lib/api/contracts";

/**
 * One Turn-15 card: poster + vignette + play affordance, rank badge, duration badge,
 * Anton title, scripture reference, then a footer row of owner + upvote pill.
 *
 * Two notes on what is NOT here:
 *
 *  - **No `@handle`.** The wireframe writes `@name`, but there is no handle column
 *    anywhere in the system; the API's own DTO comment records `displayName` as the
 *    honest stand-in and the missing handle as a design gap. Printing `@Grace Hopper`
 *    would fabricate an identifier that does not exist, so the display name is rendered
 *    plainly.
 *  - **No visibility badge.** An `unlisted` item never reaches this grid, and the
 *    design has no badge for the concept.
 *
 * `scriptureBook` is available on the DTO and deliberately NOT rendered as anything
 * clickable: it is an internal derived code, never a control.
 */
export default function GalleryCard({
  item,
  voting,
  onPlay,
  onVote,
}: {
  item: GalleryItemDto;
  /** This card's vote request is open — the pill is disabled until it settles. */
  voting: boolean;
  onPlay: () => void;
  onVote: () => void;
}) {
  const duration = galleryDurationLabel(item.durationSeconds);

  return (
    <article
      data-testid={`gallery-card-${item.id}`}
      data-item-id={item.id}
      style={{
        border: "1px solid var(--sg-line2)",
        borderRadius: 14,
        overflow: "hidden",
        background: "var(--sg-panel)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: 250,
          position: "relative",
          overflow: "hidden",
          background: item.thumbnailUrl
            ? `center / cover no-repeat url(${JSON.stringify(item.thumbnailUrl)})`
            : "var(--sg-poster)",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            boxShadow: "inset 0 0 70px rgba(20,8,4,.75)",
            background:
              "linear-gradient(to top, rgba(10,6,4,.72) 0%, rgba(10,6,4,0) 46%)",
          }}
        />

        <RankBadge rank={item.rank} itemId={item.id} />

        {duration && (
          <span
            data-testid={`gallery-duration-${item.id}`}
            style={{
              position: "absolute",
              bottom: 10,
              right: 11,
              padding: "2px 7px",
              borderRadius: 5,
              fontFamily: "var(--font-barlow-semi)",
              fontWeight: 700,
              fontSize: 10.5,
              color: "#fff",
              background: "rgba(0,0,0,.62)",
            }}
          >
            {duration}
          </span>
        )}

        <button
          type="button"
          data-testid={`gallery-play-${item.id}`}
          aria-label={`Play ${item.title}`}
          onClick={onPlay}
          className="cursor-pointer"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 46,
            height: 46,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            fontSize: 17,
            background: "rgba(0,0,0,.44)",
            border: "1px solid rgba(255,255,255,.42)",
          }}
        >
          {"▶"}
        </button>

        <div
          style={{
            position: "absolute",
            left: 13,
            bottom: 32,
            right: 60,
            fontFamily: "var(--font-anton)",
            fontSize: 19,
            lineHeight: 1.04,
            color: "#fff",
            textShadow: "0 1px 5px rgba(0,0,0,.65)",
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            position: "absolute",
            left: 13,
            bottom: 13,
            right: 60,
            fontFamily: "var(--font-barlow-semi)",
            fontWeight: 700,
            fontSize: 9,
            letterSpacing: ".14em",
            color: "rgba(255,255,255,.82)",
          }}
        >
          {item.scriptureReference}
        </div>
      </div>

      <div
        className="flex items-center"
        style={{ gap: 9, padding: "11px 13px 12px" }}
      >
        <span
          aria-hidden
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            backgroundImage: "var(--sg-grad)",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 10,
            color: "#fff",
            flex: "none",
          }}
        >
          {item.owner.avatarInitials}
        </span>
        <span
          style={{
            fontSize: 11.5,
            color: "var(--sg-dim)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.owner.displayName}
          {" · "}
          {item.translation}
        </span>
        <div style={{ flex: 1 }} />
        <UpvotePill
          itemId={item.id}
          upvoteCount={item.upvoteCount}
          viewerHasUpvoted={item.viewerHasUpvoted}
          busy={voting}
          onVote={onVote}
        />
      </div>
    </article>
  );
}
