import { describe, expect, it } from "vitest";

/**
 * Row 41 — the PURE gallery model (plan §5.5 U-M1…U-M7).
 *
 * RED until `./gallery-model` ships. `vitest.config.ts` is `environment: "node"` with
 * no jsdom, so nothing here renders: the browser-side behaviours (grid, badges, pills,
 * search, "Load more") are proven by `tests/e2e/gallery.e2e.ts`. What lives HERE is the
 * arithmetic and the state rules those components must not re-derive:
 *
 *   - the `k`/`m` abbreviation,
 *   - the rank-badge threshold and the trophy,
 *   - the mid-pagination de-dupe (plan D5's mitigation for a mutable sort key),
 *   - the reset-on-filter-change rule (a preserved cursor after a sort change pages a
 *     DIFFERENT ordering — the single most expensive mistake this file exists to make
 *     impossible),
 *   - the query-string escaping,
 *   - the anonymous-vote fork,
 *   - and the optimistic vote/revert round trip.
 *
 * There is NO book filter and no `book=` parameter anywhere (superseding scope decision,
 * plan §5.2): which books exist is a property of the TRANSLATION and the YouVersion API
 * is the authority on it, so the gallery is sorted and free-text searched, never faceted
 * by a canon we hardcode.
 */
import {
  GALLERY_SORTS,
  RANK_BADGE_MAX,
  anonVoteOutcome,
  appendPage,
  buildGalleryQuery,
  formatUpvoteCount,
  galleryDurationLabel,
  initialQueryState,
  nextQueryState,
  optimisticVote,
  rankBadgeFor,
  revertVote,
  upvotePillState,
  voteSnapshot,
  type GallerySort,
} from "./gallery-model";
import { formatTimecode } from "../studio/time";

// ── U-M0: the sort segmented control's data ──────────────────────────────────

describe("GALLERY_SORTS", () => {
  it("is exactly the API's three closed sort values, in wireframe order", () => {
    expect(GALLERY_SORTS.map((s) => s.value)).toEqual([
      "popular",
      "newest",
      "trending",
    ]);
  });

  it("labels match the Turn-15 segmented control verbatim", () => {
    expect(GALLERY_SORTS.map((s) => s.label)).toEqual([
      "▲ Most popular",
      "Newest",
      "Trending",
    ]);
  });

  it("gives every segment a distinct testId (the e2e clicks these)", () => {
    const ids = GALLERY_SORTS.map((s) => s.testId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "gallery-sort-popular",
      "gallery-sort-newest",
      "gallery-sort-trending",
    ]);
  });
});

// ── U-M1: formatUpvoteCount ──────────────────────────────────────────────────

describe("U-M1 formatUpvoteCount", () => {
  it("renders anything under 1000 bare", () => {
    expect(formatUpvoteCount(0)).toBe("0");
    expect(formatUpvoteCount(1)).toBe("1");
    expect(formatUpvoteCount(964)).toBe("964");
    expect(formatUpvoteCount(999)).toBe("999");
  });

  it("switches to one decimal + k at exactly 1000", () => {
    expect(formatUpvoteCount(1000)).toBe("1.0k");
    expect(formatUpvoteCount(2400)).toBe("2.4k");
  });

  it("rounds the tenth rather than truncating it", () => {
    expect(formatUpvoteCount(2449)).toBe("2.4k");
    expect(formatUpvoteCount(2450)).toBe("2.5k");
  });

  it("never renders a 1000.0k artifact — it cascades to m", () => {
    // 999_999/1000 rounds to 1000.0, which is not a legal `k` label.
    expect(formatUpvoteCount(999_999)).toBe("1.0m");
    expect(formatUpvoteCount(1_000_000)).toBe("1.0m");
    expect(formatUpvoteCount(2_450_000)).toBe("2.5m");
  });

  it("floors fractions and clamps a negative to 0 (a count is never negative)", () => {
    expect(formatUpvoteCount(12.9)).toBe("12");
    expect(formatUpvoteCount(-3)).toBe("0");
  });
});

// ── U-M2: rankBadgeFor ───────────────────────────────────────────────────────

describe("U-M2 rankBadgeFor", () => {
  it("gives #1 the trophy", () => {
    expect(rankBadgeFor(1)).toEqual({ kind: "trophy", label: "🏆 #1" });
  });

  it("gives #2 and #3 a plain badge", () => {
    expect(rankBadgeFor(2)).toEqual({ kind: "plain", label: "#2" });
    expect(rankBadgeFor(3)).toEqual({ kind: "plain", label: "#3" });
  });

  it("badges nothing past the threshold", () => {
    expect(RANK_BADGE_MAX).toBe(3);
    expect(rankBadgeFor(4)).toBeNull();
    expect(rankBadgeFor(25)).toBeNull();
  });

  it("badges nothing when rank is null — the API sends null off sort=popular", () => {
    // rank is a property of the GLOBAL popular ordering; a "#7" badge under `newest`
    // would assert something untrue, so the API sends null and the UI must render none.
    expect(rankBadgeFor(null)).toBeNull();
  });

  it("badges nothing for a non-positive rank (0, negative)", () => {
    expect(rankBadgeFor(0)).toBeNull();
    expect(rankBadgeFor(-1)).toBeNull();
  });
});

// ── U-M3: appendPage ─────────────────────────────────────────────────────────

const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra });

describe("U-M3 appendPage", () => {
  it("concatenates two disjoint pages in order", () => {
    expect(appendPage([row("a"), row("b")], [row("c")]).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("drops a duplicate id and KEEPS THE FIRST occurrence", () => {
    // Plan D5: `upvoteCount` is a mutable sort key, so a row can legitimately appear on
    // both page 1 and page 2. The first copy is the one already on screen — replacing it
    // would make a card jump.
    const first = row("a", { upvoteCount: 9 });
    const stale = row("a", { upvoteCount: 4 });
    const merged = appendPage([first, row("b")], [stale, row("c")]);
    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(merged[0]).toBe(first);
  });

  it("de-dupes WITHIN the incoming page too", () => {
    const merged = appendPage([row("a")], [row("b"), row("b"), row("c")]);
    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op for an empty incoming page and returns a fresh array", () => {
    const existing = [row("a"), row("b")];
    const merged = appendPage(existing, []);
    expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
    expect(merged).not.toBe(existing);
  });

  it("does not mutate either input", () => {
    const existing = [row("a")];
    const incoming = [row("b")];
    appendPage(existing, incoming);
    expect(existing).toHaveLength(1);
    expect(incoming).toHaveLength(1);
  });
});

// ── U-M4: nextQueryState ─────────────────────────────────────────────────────

describe("U-M4 nextQueryState", () => {
  const loaded = {
    ...initialQueryState(),
    cursor: "cursor-page-2",
    items: [row("a"), row("b")],
  };

  it("starts at the API's default sort with no query, no cursor and no items", () => {
    expect(initialQueryState()).toEqual({
      sort: "popular",
      q: "",
      cursor: null,
      items: [],
    });
  });

  it("a SORT change clears the cursor and the accumulated items", () => {
    // A cursor is minted under one ordering. Carrying it into another pages a DIFFERENT
    // ordering and silently skips or duplicates rows — the API rejects it outright.
    const next = nextQueryState(loaded, { kind: "sort", sort: "newest" });
    expect(next.sort).toBe("newest");
    expect(next.cursor).toBeNull();
    expect(next.items).toEqual([]);
    expect(next.q).toBe("");
  });

  it("a Q change clears the cursor and the accumulated items", () => {
    const next = nextQueryState(loaded, { kind: "q", q: "wilderness" });
    expect(next.q).toBe("wilderness");
    expect(next.cursor).toBeNull();
    expect(next.items).toEqual([]);
    expect(next.sort).toBe("popular");
  });

  it("a LOAD-MORE preserves the cursor AND the accumulated items", () => {
    const next = nextQueryState(loaded, { kind: "load-more" });
    expect(next.cursor).toBe("cursor-page-2");
    expect(next.items.map((r) => r.id)).toEqual(["a", "b"]);
    expect(next.sort).toBe("popular");
  });

  it("a PAGE-LOADED appends (de-duping) and adopts the server's nextCursor", () => {
    const next = nextQueryState(loaded, {
      kind: "page-loaded",
      items: [row("b"), row("c")],
      nextCursor: null,
    });
    expect(next.items.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(next.cursor).toBeNull();
  });

  it("re-selecting the SAME sort still resets (a re-fetch is a fresh page 1)", () => {
    const next = nextQueryState(loaded, { kind: "sort", sort: "popular" });
    expect(next.cursor).toBeNull();
    expect(next.items).toEqual([]);
  });

  it("never mutates the state handed to it", () => {
    nextQueryState(loaded, { kind: "sort", sort: "trending" });
    expect(loaded.cursor).toBe("cursor-page-2");
    expect(loaded.items).toHaveLength(2);
  });
});

// ── U-M5: buildGalleryQuery ──────────────────────────────────────────────────

describe("U-M5 buildGalleryQuery", () => {
  it("always carries the sort (it is what the cursor was minted under)", () => {
    expect(buildGalleryQuery({ sort: "popular", q: "", cursor: null })).toBe(
      "sort=popular",
    );
    expect(buildGalleryQuery({ sort: "trending", q: "", cursor: null })).toBe(
      "sort=trending",
    );
  });

  it("omits an empty or whitespace-only q rather than sending a blank one", () => {
    expect(buildGalleryQuery({ sort: "newest", q: "   ", cursor: null })).toBe(
      "sort=newest",
    );
  });

  it("appends q and cursor when present, in a stable order", () => {
    expect(
      buildGalleryQuery({ sort: "newest", q: "psalm", cursor: "abc123" }),
    ).toBe("sort=newest&q=psalm&cursor=abc123");
  });

  it("percent-escapes every value", () => {
    expect(
      buildGalleryQuery({ sort: "popular", q: "a&b=c d%", cursor: null }),
    ).toBe("sort=popular&q=a%26b%3Dc%20d%25");
    expect(
      buildGalleryQuery({ sort: "popular", q: "", cursor: "a+b/c=" }),
    ).toBe("sort=popular&cursor=a%2Bb%2Fc%3D");
  });

  it("sends NO book parameter — the book filter does not exist (§5.2)", () => {
    const qs = buildGalleryQuery({ sort: "popular", q: "genesis", cursor: null });
    expect(qs).not.toContain("book");
  });
});

// ── U-M6: anonVoteOutcome + the pill ─────────────────────────────────────────

describe("U-M6 anonVoteOutcome", () => {
  it("an anonymous viewer always gets the sign-in prompt, in EITHER pill state", () => {
    expect(anonVoteOutcome(false, false)).toBe("prompt");
    expect(anonVoteOutcome(false, true)).toBe("prompt");
  });

  it("an authed viewer who has not voted votes", () => {
    expect(anonVoteOutcome(true, false)).toBe("vote");
  });

  it("an authed viewer who has voted un-votes", () => {
    expect(anonVoteOutcome(true, true)).toBe("unvote");
  });
});

describe("upvotePillState", () => {
  it("an un-voted item renders outlined, aria-pressed=false, count formatted", () => {
    expect(upvotePillState({ upvoteCount: 2400, viewerHasUpvoted: false })).toEqual({
      variant: "outlined",
      pressed: false,
      count: "2.4k",
    });
  });

  it("a voted item renders filled, aria-pressed=true", () => {
    expect(upvotePillState({ upvoteCount: 7, viewerHasUpvoted: true })).toEqual({
      variant: "filled",
      pressed: true,
      count: "7",
    });
  });
});

// ── U-M7: optimisticVote / revertVote ────────────────────────────────────────

describe("U-M7 optimisticVote / revertVote", () => {
  const item = { id: "g1", upvoteCount: 41, viewerHasUpvoted: false };

  it("voting fills the pill and increments the count by exactly 1", () => {
    expect(optimisticVote(item, "vote")).toEqual({
      id: "g1",
      upvoteCount: 42,
      viewerHasUpvoted: true,
    });
  });

  it("un-voting empties the pill and decrements the count by exactly 1", () => {
    const voted = { ...item, upvoteCount: 42, viewerHasUpvoted: true };
    expect(optimisticVote(voted, "unvote")).toEqual({
      id: "g1",
      upvoteCount: 41,
      viewerHasUpvoted: false,
    });
  });

  it("is idempotent — re-voting an already-voted item does not double-count", () => {
    const voted = { ...item, upvoteCount: 42, viewerHasUpvoted: true };
    expect(optimisticVote(voted, "vote")).toEqual(voted);
    expect(optimisticVote(item, "unvote")).toEqual(item);
  });

  it("never drives the count below zero", () => {
    const zero = { id: "g1", upvoteCount: 0, viewerHasUpvoted: true };
    expect(optimisticVote(zero, "unvote").upvoteCount).toBe(0);
  });

  it("vote → revert restores the EXACT original count and pill state", () => {
    const snapshot = voteSnapshot(item);
    const optimistic = optimisticVote(item, "vote");
    expect(revertVote(optimistic, snapshot)).toEqual(item);
  });

  it("unvote → revert restores the EXACT original count and pill state", () => {
    const voted = { ...item, upvoteCount: 42, viewerHasUpvoted: true };
    const snapshot = voteSnapshot(voted);
    const optimistic = optimisticVote(voted, "unvote");
    expect(revertVote(optimistic, snapshot)).toEqual(voted);
  });

  it("preserves every other field on the item (it is a spread, not a rebuild)", () => {
    const rich = { ...item, title: "Wilderness", rank: 1 as number | null };
    expect(optimisticVote(rich, "vote").title).toBe("Wilderness");
    expect(optimisticVote(rich, "vote").rank).toBe(1);
  });
});

// ── duration formatting (the badge) ──────────────────────────────────────────

describe("galleryDurationLabel", () => {
  it("renders the card's mm:ss badge", () => {
    expect(galleryDurationLabel(45)).toBe("0:45");
    expect(galleryDurationLabel(83)).toBe("1:23");
    expect(galleryDurationLabel(223)).toBe("3:43");
  });

  it("REUSES lib/studio/time.ts rather than reimplementing the format", () => {
    // The badge must not drift from the studio transport readout. Asserting equality
    // against the shipped formatter is what pins the reuse.
    for (const s of [1, 45, 60, 83, 599, 600, 3599]) {
      expect(galleryDurationLabel(s)).toBe(formatTimecode(s));
    }
  });

  it("floors a fractional second (never rounds a 0:59.9 up to 1:00)", () => {
    expect(galleryDurationLabel(59.9)).toBe("0:59");
  });

  it("suppresses the badge for a non-positive duration", () => {
    // The API clamps `durationSeconds` to >= 1, so 0 can only mean "unknown". A "0:00"
    // badge would be a lie about the video's length (the task-38 framesTotal lesson).
    expect(galleryDurationLabel(0)).toBeNull();
    expect(galleryDurationLabel(-5)).toBeNull();
  });
});

// ── type-level guard: the sort union is the API's closed enum ────────────────

describe("GallerySort", () => {
  it("accepts exactly the API's three values", () => {
    const all: GallerySort[] = ["popular", "newest", "trending"];
    expect(all).toHaveLength(3);
  });
});
