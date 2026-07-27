"use client";

import Link from "next/link";
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
 *
 * ── THREE ZERO-ITEM STATES, AND ONLY ONE OF THEM IS DESIGNED ───────────────────
 * Turn 17b card 4a draws the EMPTY state (`NOTHING HERE YET.`) and nothing else. Loading
 * and error keep their own shapes on purpose:
 *   - loading is not empty, it is unknown-yet;
 *   - an error is not empty either — it means we do not KNOW whether it is empty, which
 *     is exactly why it keeps a `Try again` and why 4a offers none.
 * `tests/unit/gallery-grid.test.tsx` asserts the three are mutually exclusive, so a
 * later "simplification" cannot quietly merge them.
 */
export default function GalleryGrid({
  items,
  loading,
  error,
  searchTerm,
  voting,
  onRetry,
  onClearFilters,
  onVote,
}: {
  items: readonly GalleryItemDto[];
  loading: boolean;
  error: boolean;
  /** The COMMITTED search term, not a boolean: 4a prints it back inside the copy, so
   *  the component needs the word and not merely the fact that there was one. */
  searchTerm: string;
  /** Ids with a vote request open — those pills render disabled. Per item, so a slow
   *  vote on one card never freezes the rest of the grid. */
  voting: ReadonlySet<string>;
  onRetry: () => void;
  onClearFilters: () => void;
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
              onVote={() => onVote(item)}
            />
          ))}
        </div>
      )}

      {/* Loading stays UNDESIGNED (design-delta §2.7 / §9-Q3 is the deferral authority).
          The empty state below it is Turn 17b card 4a, built. */}
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
        <EmptyState searchTerm={searchTerm} onClearFilters={onClearFilters} />
      )}
    </div>
  );
}

/**
 * Turn 17b card 4a — `NOTHING HERE YET.`
 *
 * TWO deliberate departures from the drawing, both about not lying:
 *
 *  1. **No `GALLERY · NO RESULTS` header strip.** In 17b that eyebrow is the SPEC SHEET's
 *     label for the card — the four states are drawn side by side and each needs naming.
 *     On the actual gallery page the reader is already in the gallery; printing the label
 *     would be chrome describing the chrome.
 *
 *  2. **`Clear filters` renders only when a filter is actually set.** The design draws it
 *     unconditionally, but in the genuinely-empty gallery (nothing published at all) there
 *     is nothing to clear, and a button that does nothing when pressed is precisely the
 *     affordance this codebase refuses to ship. `＋ Create this verse` stays either way —
 *     it is the invitation the copy already makes.
 */
function EmptyState({
  searchTerm,
  onClearFilters,
}: {
  searchTerm: string;
  onClearFilters: () => void;
}) {
  const term = searchTerm.trim();

  return (
    <div data-testid="gallery-empty" style={{ padding: "52px 40px", textAlign: "center" }}>
      <div
        aria-hidden
        style={{
          width: 66,
          height: 66,
          margin: "0 auto",
          borderRadius: 17,
          border: "1.5px dashed var(--sg-line2)",
          display: "grid",
          placeItems: "center",
          fontSize: 26,
          color: "var(--sg-dim)",
        }}
      >
        {"🔍"}
      </div>

      <h2
        data-testid="gallery-empty-title"
        style={{
          fontFamily: "var(--font-anton)",
          fontSize: 28,
          lineHeight: 1.05,
          marginTop: 20,
        }}
      >
        {"NOTHING HERE YET."}
      </h2>

      <p
        data-testid="gallery-empty-copy"
        style={{
          fontFamily: "var(--font-zilla)",
          fontSize: 14.5,
          lineHeight: 1.55,
          color: "var(--sg-dim)",
          marginTop: 10,
          maxWidth: 360,
          marginInline: "auto",
        }}
      >
        {term ? (
          <>
            {'No public videos match "'}
            <b data-testid="gallery-empty-term" style={{ color: "var(--sg-fg)" }}>
              {term}
            </b>
            {'". Try another book — or be the first to make one.'}
          </>
        ) : (
          // No term, so nothing to quote back. The invitation is the whole message.
          "No videos have been published yet. Be the first to make one."
        )}
      </p>

      <div
        className="flex flex-wrap"
        style={{ gap: 10, justifyContent: "center", marginTop: 22 }}
      >
        {term.length > 0 && (
          <button
            type="button"
            data-testid="gallery-clear-filters"
            onClick={onClearFilters}
            className="cursor-pointer"
            style={{
              padding: "12px 20px",
              border: "1px solid var(--sg-line2)",
              borderRadius: 11,
              background: "transparent",
              fontWeight: 700,
              fontSize: 14,
              color: "var(--sg-fg)",
            }}
          >
            {"Clear filters"}
          </button>
        )}
        {/* The workspace is where a verse becomes a project — there is no route that
            takes a passage straight into a new project, so this points at the place
            that CAN start one rather than inventing a deep link that 404s. */}
        <Link
          href="/"
          data-testid="gallery-create-verse"
          className="flex items-center justify-center"
          style={{
            padding: "12px 22px",
            borderRadius: 11,
            backgroundImage: "var(--sg-grad)",
            boxShadow: "0 6px 16px rgba(192,57,43,.3)",
            fontWeight: 700,
            fontSize: 14,
            color: "#fff",
          }}
        >
          {"＋ Create this verse"}
        </Link>
      </div>
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
