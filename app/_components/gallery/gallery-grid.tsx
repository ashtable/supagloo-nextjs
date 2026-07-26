"use client";

import GalleryCard from "./gallery-card";
import type { GalleryItemDto } from "@/lib/api/contracts";

/**
 * THE MOUNT-GATED GRID (plan D14).
 *
 * `data-testid="gallery-grid"` is rendered only by the client browser after mount, so
 * its presence is an honest POST-HYDRATION signal — which is the whole point. An SSR'd
 * grid testid is in the first HTML byte and proves nothing about React having adopted
 * the tree; that is precisely the shape that produced row 68's lost-`input` and
 * `-32000 Node does not have a layout object` failures.
 *
 * The container renders even when there are no cards, so the hydration gate stays stable
 * across an empty search — an E2E must not have to guess whether the grid is missing or
 * simply empty.
 *
 * 4 columns at the designed 1320px, collapsing to 1. The responsive steps are INVENTED
 * (only the desktop width is drawn).
 */
export default function GalleryGrid({
  items,
  loading,
  error,
  searching,
  voting,
  onRetry,
  onPlay,
  onVote,
}: {
  items: readonly GalleryItemDto[];
  loading: boolean;
  error: boolean;
  searching: boolean;
  /** Ids with a vote request open — those pills render disabled. Per item, so a slow
   *  vote on one card never freezes the rest of the grid. */
  voting: ReadonlySet<string>;
  onRetry: () => void;
  onPlay: (item: GalleryItemDto) => void;
  onVote: (item: GalleryItemDto) => void;
}) {
  return (
    <div
      data-testid="gallery-grid"
      className="px-4 sm:px-[34px]"
      style={{ minHeight: 120 }}
    >
      {items.length > 0 && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          style={{ gap: 18 }}
        >
          {items.map((item) => (
            <GalleryCard
              key={item.id}
              item={item}
              voting={voting.has(item.id)}
              onPlay={() => onPlay(item)}
              onVote={() => onVote(item)}
            />
          ))}
        </div>
      )}

      {/* UNDESIGNED (design-delta §5) — empty/loading/error states are out of scope;
          these are minimal placeholders, flagged for the design pass. */}
      {items.length === 0 && loading && (
        <p data-testid="gallery-loading" style={emptyStyle}>
          {"Loading the gallery…"}
        </p>
      )}
      {items.length === 0 && !loading && error && (
        <div data-testid="gallery-error" style={emptyStyle}>
          <p>{"The gallery didn't load."}</p>
          {/* An error state with no way out is a dead end — this is the way out. */}
          <button
            type="button"
            data-testid="gallery-retry"
            onClick={onRetry}
            className="cursor-pointer"
            style={{
              marginTop: 12,
              padding: "9px 20px",
              borderRadius: 11,
              border: "1px solid var(--sg-line2)",
              background: "var(--sg-panel)",
              fontWeight: 700,
              fontSize: 13,
              color: "var(--sg-fg)",
            }}
          >
            {"Try again"}
          </button>
        </div>
      )}
      {items.length === 0 && !loading && !error && (
        <p data-testid="gallery-empty" style={emptyStyle}>
          {searching ? "No videos match that search." : "Nothing published yet."}
        </p>
      )}
    </div>
  );
}

const emptyStyle = {
  padding: "44px 0",
  textAlign: "center" as const,
  fontFamily: "var(--font-zilla)",
  fontSize: 15,
  color: "var(--sg-dim)",
};
