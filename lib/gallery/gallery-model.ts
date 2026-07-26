/**
 * The pure gallery model (Row 41, plan §5.2) — no React, no DOM. Everything the Turn-15
 * grid needs that is arithmetic or state, kept out of the components so it can be
 * unit-tested in the `environment: "node"` lane and cannot drift between the card, the
 * pill and the badge.
 *
 * THERE IS NO BOOK FILTER, and this file is one of the places that proves it: the query
 * state carries a sort and a free-text `q`, and nothing else. Which books exist is a
 * property of the TRANSLATION, with the YouVersion API as the authority on it, so a
 * facet built from a canon hardcoded in this repo would silently disagree with reality.
 * `scriptureBook` arrives on the DTO and may be printed on a card; it is never a
 * control.
 */
import { formatTimecode } from "../studio/time";
import type { GalleryItemDto, GallerySort } from "../api/contracts";

export type { GallerySort };

// ── the sort segmented control ───────────────────────────────────────────────

export interface GallerySortOption {
  value: GallerySort;
  label: string;
  testId: string;
}

/** The three segments, in wireframe order. `popular` is first because it is also the
 *  API's default — the control and the server agree on the landing state. */
export const GALLERY_SORTS: readonly GallerySortOption[] = [
  { value: "popular", label: "▲ Most popular", testId: "gallery-sort-popular" },
  { value: "newest", label: "Newest", testId: "gallery-sort-newest" },
  { value: "trending", label: "Trending", testId: "gallery-sort-trending" },
];

/** The sort a fresh `/gallery` opens on — the same value the API defaults to. */
export const DEFAULT_GALLERY_SORT: GallerySort = "popular";

// ── counts ───────────────────────────────────────────────────────────────────

/**
 * `964` → `"964"`, `2400` → `"2.4k"`, `1_000_000` → `"1.0m"`.
 *
 * The tenth is ROUNDED, not truncated, with one guard: a value that rounds to
 * `1000.0k` is not a legal `k` label, so it cascades to `m` (999 999 reads "1.0m").
 * Fractions are floored and negatives clamp to 0 — an upvote count is an integer and is
 * never negative, and rendering `-1` would advertise a bug rather than hide one.
 */
export function formatUpvoteCount(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v < 1000) return String(v);

  const thousands = v / 1000;
  if (thousands < 1000) {
    const label = thousands.toFixed(1);
    if (label !== "1000.0") return `${label}k`;
  }
  return `${(v / 1_000_000).toFixed(1)}m`;
}

// ── rank badges ──────────────────────────────────────────────────────────────

/** Ranks past this get no badge. A podium, not a leaderboard. */
export const RANK_BADGE_MAX = 3;

export interface RankBadge {
  kind: "trophy" | "plain";
  label: string;
}

/**
 * The badge for a server-supplied `rank`, or null when there is none.
 *
 * `rank` is non-null ONLY under `sort=popular` and is 1-based and continuous across
 * pages. This function never computes a rank — it only decides how to draw one — which
 * is what stops page 2 from rendering "#1" on its first card.
 */
export function rankBadgeFor(rank: number | null): RankBadge | null {
  if (rank === null || !Number.isFinite(rank) || rank < 1) return null;
  if (rank > RANK_BADGE_MAX) return null;
  return rank === 1
    ? { kind: "trophy", label: "🏆 #1" }
    : { kind: "plain", label: `#${rank}` };
}

// ── pagination ───────────────────────────────────────────────────────────────

/** Anything with an `id`. Kept structural so the de-dupe is testable without a DTO. */
interface Identified {
  id: string;
}

/**
 * Append a freshly-fetched page to what is already on screen, dropping any id already
 * present and KEEPING THE FIRST occurrence.
 *
 * Plan D5's accepted trade-off, mitigated here: `upvoteCount` is a mutable sort key, so
 * a row can legitimately appear on both page 1 and page 2 between two requests. The
 * first copy is the one the user is already looking at; replacing it would make a card
 * visibly jump for no reason the user can see.
 */
export function appendPage<T extends Identified>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of [...existing, ...incoming]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

// ── query state ──────────────────────────────────────────────────────────────

export interface GalleryQueryState<T extends Identified = GalleryItemDto> {
  sort: GallerySort;
  /** The raw search box value. Blank means "no search"; it is never sent. */
  q: string;
  /** The cursor for the NEXT page, or null when exhausted (or not yet paged). */
  cursor: string | null;
  /** Everything fetched so far, in display order. */
  items: readonly T[];
}

export type GalleryQueryChange<T extends Identified = GalleryItemDto> =
  | { kind: "sort"; sort: GallerySort }
  | { kind: "q"; q: string }
  | { kind: "load-more" }
  | { kind: "page-loaded"; items: readonly T[]; nextCursor: string | null };

/** A fresh `/gallery`: the API's default sort, no search, page 1. */
export function initialQueryState<T extends Identified = GalleryItemDto>(): GalleryQueryState<T> {
  return { sort: DEFAULT_GALLERY_SORT, q: "", cursor: null, items: [] };
}

/**
 * The ONE place a query change is applied — it exists specifically to make the reset
 * impossible to forget.
 *
 * A sort or `q` change CLEARS the cursor and the accumulated items. That is not tidiness:
 * a cursor is minted under one ordering, and carrying it into another pages a different
 * ordering (the API rejects a cursor minted under a different sort outright, so the
 * visible symptom would be an unexplained 400 rather than merely wrong rows).
 *
 * `load-more` is the only change that preserves both.
 */
export function nextQueryState<T extends Identified>(
  current: GalleryQueryState<T>,
  change: GalleryQueryChange<T>,
): GalleryQueryState<T> {
  switch (change.kind) {
    case "sort":
      return { ...current, sort: change.sort, cursor: null, items: [] };
    case "q":
      return { ...current, q: change.q, cursor: null, items: [] };
    case "load-more":
      // The ONE change that preserves both. Returns the SAME object on purpose: it is
      // a statement of intent at the call site, and React bails out of a no-op update,
      // so writing it costs nothing.
      return current;
    case "page-loaded":
      return {
        ...current,
        items: appendPage(current.items, change.items),
        cursor: change.nextCursor,
      };
  }
}

export interface GalleryQueryParams {
  sort: GallerySort;
  q: string;
  cursor: string | null;
}

/**
 * The `GET /api/gallery` query string. `sort` is always sent (it is what any cursor was
 * minted under); `q` and `cursor` are omitted when empty — a blank `q` must never reach
 * the API as a parameter it then has to treat as absent.
 *
 * Every value is `encodeURIComponent`-escaped. There is no `book`.
 */
export function buildGalleryQuery(params: GalleryQueryParams): string {
  const parts = [`sort=${encodeURIComponent(params.sort)}`];
  const q = params.q.trim();
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (params.cursor) parts.push(`cursor=${encodeURIComponent(params.cursor)}`);
  return parts.join("&");
}

// ── voting ───────────────────────────────────────────────────────────────────

export type VoteOutcome = "prompt" | "vote" | "unvote";

/**
 * What clicking an upvote pill should DO.
 *
 * An anonymous viewer always gets the sign-in prompt — in either pill state, because an
 * anonymous listing always reports `viewerHasUpvoted: false` and a signed-out user has
 * no vote to withdraw.
 */
export function anonVoteOutcome(
  isAuthed: boolean,
  viewerHasUpvoted: boolean,
): VoteOutcome {
  if (!isAuthed) return "prompt";
  return viewerHasUpvoted ? "unvote" : "vote";
}

export interface VoteSnapshot {
  upvoteCount: number;
  viewerHasUpvoted: boolean;
}

export interface UpvotePillState {
  variant: "filled" | "outlined";
  pressed: boolean;
  count: string;
}

/** How the pill draws itself. `pressed` is what lands on `aria-pressed`. */
export function upvotePillState(item: VoteSnapshot): UpvotePillState {
  return {
    variant: item.viewerHasUpvoted ? "filled" : "outlined",
    pressed: item.viewerHasUpvoted,
    count: formatUpvoteCount(item.upvoteCount),
  };
}

/** The two fields an optimistic vote touches, captured so `revertVote` can restore them
 *  EXACTLY (not by re-deriving them, which would drift if a reconcile landed between). */
export function voteSnapshot(item: VoteSnapshot): VoteSnapshot {
  return { upvoteCount: item.upvoteCount, viewerHasUpvoted: item.viewerHasUpvoted };
}

/**
 * The optimistic pill+count math. IDEMPOTENT: applying "vote" to an already-voted item
 * is a no-op, so a double click (or a re-render that re-applies the action) can never
 * double-count. The count never goes below zero.
 */
export function optimisticVote<T extends VoteSnapshot>(
  item: T,
  action: "vote" | "unvote",
): T {
  if (action === "vote") {
    if (item.viewerHasUpvoted) return item;
    return { ...item, viewerHasUpvoted: true, upvoteCount: item.upvoteCount + 1 };
  }
  if (!item.viewerHasUpvoted) return item;
  return {
    ...item,
    viewerHasUpvoted: false,
    upvoteCount: Math.max(0, item.upvoteCount - 1),
  };
}

/** Put back exactly what {@link voteSnapshot} captured — what a failed request does. */
export function revertVote<T extends VoteSnapshot>(item: T, snapshot: VoteSnapshot): T {
  return {
    ...item,
    upvoteCount: snapshot.upvoteCount,
    viewerHasUpvoted: snapshot.viewerHasUpvoted,
  };
}

/** Replace one item in a list by id, preserving order. What a server reconcile does. */
export function replaceItem<T extends Identified>(
  items: readonly T[],
  replacement: T,
): T[] {
  return items.map((i) => (i.id === replacement.id ? replacement : i));
}

// ── the duration badge ───────────────────────────────────────────────────────

/**
 * The card's `mm:ss` badge, or null when there is no honest duration to show.
 *
 * Delegates to `lib/studio/time.ts` rather than reimplementing the format, so the badge
 * and the studio transport readout can never disagree. The API clamps `durationSeconds`
 * to >= 1, so a non-positive value can only mean "unknown" — and a `"0:00"` badge would
 * be a lie about the video's length (the task-38 `framesTotal === 0` lesson).
 */
export function galleryDurationLabel(durationSeconds: number): string | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  return formatTimecode(durationSeconds);
}
