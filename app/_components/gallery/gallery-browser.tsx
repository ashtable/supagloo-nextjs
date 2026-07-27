"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GalleryHeader from "./gallery-header";
import GalleryFilterRow from "./gallery-filter-row";
import GalleryGrid from "./gallery-grid";
import LoadMore from "./load-more";
import PublishToGalleryDialog from "./publish-to-gallery-dialog";
import SigninPrompt from "./signin-prompt";
import { useSession } from "../session-provider";
import {
  anonVoteOutcome,
  initialQueryState,
  nextQueryState,
  optimisticVote,
  replaceItem,
  revertVote,
  voteSnapshot,
  type GallerySort,
} from "@/lib/gallery/gallery-model";
import {
  fetchGalleryPage,
  removeUpvote,
  sendUpvote,
} from "@/lib/gallery/gallery-data";
import type { GalleryItemDto } from "@/lib/api/contracts";

/**
 * The `/gallery` client island — the only stateful thing on the page (plan D14).
 *
 * WHAT IS AND IS NOT MOUNT-GATED, and why it matters:
 *   - the header and the filter row render immediately, so they are in the server-sent
 *     HTML (client components still SSR) — good for SEO and first paint;
 *   - the GRID renders only after `mounted`, so `data-testid="gallery-grid"` is an
 *     honest post-hydration signal. An SSR'd grid is exactly the shape that produced
 *     row 68's lost-`input` / zero-layout-box failures.
 *
 * Sort, search, cursor and the viewer's vote state are all client-side and
 * cookie-dependent, so there is nothing to gain from server-rendering the cards anyway.
 *
 * Every mutation of the query state goes through `nextQueryState`, which is where the
 * reset-on-filter-change rule lives: a cursor is minted under one ordering, and carrying
 * it into another pages a DIFFERENT ordering (the API rejects it outright).
 */
export default function GalleryBrowser() {
  const { session } = useSession();
  const isAuthed = session.isAuthed;
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState(() => initialQueryState<GalleryItemDto>());
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  /**
   * Bumped to force a re-fetch of page 1.
   *
   * It exists because the effect below keys on `sort` + `q`, and a FAILED first load
   * leaves neither of them changed — so without this, one unlucky request (the API
   * still booting, a dropped connection) left the grid permanently empty with no way
   * back but a browser reload. An error state you cannot retry is a dead end, and it
   * is exactly what a real-stack run caught: every later interaction re-selected the
   * already-active sort, which changed no dependency and therefore re-fetched nothing.
   *
   * Re-selecting the active sort now counts as a refresh for the same reason.
   */
  const [attempt, setAttempt] = useState(0);

  const [promptOpen, setPromptOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  /** Monotonic token for the CURRENT page-1 request. An in-flight fetch whose token is
   *  stale (the user switched sort mid-request) must never write into the grid. */
  const runRef = useRef(0);

  /**
   * The ids whose vote request is open right now.
   *
   * TWO of them on purpose, and they are not redundant:
   *   - `votingRef` is the CORRECTNESS guard. It is mutated synchronously inside the
   *     handler, so a second click cannot get past it no matter what React has or has
   *     not re-rendered yet;
   *   - `voting` is the same set as STATE, and exists only so the pill can render
   *     itself disabled. State alone would be a race (a `setState` is not visible to the
   *     next event until it commits); a ref alone would be invisible to the user.
   *
   * Per ITEM, never global: one slow vote must not freeze every other card's pill.
   */
  const votingRef = useRef<Set<string>>(new Set());
  const [voting, setVoting] = useState<ReadonlySet<string>>(() => new Set());

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Debounce the search box into the committed query. A keystroke must not become a
  // request, and a search must not need a submit either.
  useEffect(() => {
    const trimmed = searchInput.trim();
    const timer = setTimeout(() => {
      setState((s) => (s.q === trimmed ? s : nextQueryState(s, { kind: "q", q: trimmed })));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Page 1, whenever the ordering or the search changes. `state.items` is deliberately
  // NOT a dependency — `nextQueryState` has already cleared it, and depending on it
  // would re-fetch on every append.
  useEffect(() => {
    if (!mounted) return;
    const run = ++runRef.current;
    // This effect IS the external-system synchronization the rule is about: it starts a
    // network request whose lifecycle React cannot observe, so the in-flight flags have
    // to be raised here. They are raised once per ordering change, not per render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setFailed(false);
    let active = true;

    void (async () => {
      const page = await fetchGalleryPage({
        sort: state.sort,
        q: state.q,
        cursor: null,
      });
      if (!active || run !== runRef.current) return;
      if (!page) {
        setFailed(true);
        setLoading(false);
        return;
      }
      setState((s) =>
        nextQueryState(s, {
          kind: "page-loaded",
          items: page.items,
          nextCursor: page.nextCursor,
        }),
      );
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [mounted, state.sort, state.q, attempt]);

  const onSortChange = useCallback((sort: GallerySort) => {
    setState((s) => nextQueryState(s, { kind: "sort", sort }));
    // Also a REFRESH when the chosen sort is the one already active: `state.sort` would
    // not change, so nothing else would re-run, and a user re-clicking the active
    // segment after a failed load would be clicking a dead control.
    setAttempt((a) => a + 1);
  }, []);

  /** The error state's only way out. */
  const onRetry = useCallback(() => setAttempt((a) => a + 1), []);

  /**
   * 4a's `Clear filters`. Resets BOTH halves of the filter — the committed query state
   * AND the search box — because the box is debounced INTO the query: clearing only the
   * query would let the still-populated input re-commit the same term 250 ms later and
   * put the user straight back on the empty state they just left.
   */
  const onClearFilters = useCallback(() => {
    setSearchInput("");
    setState(initialQueryState<GalleryItemDto>());
    setAttempt((a) => a + 1);
  }, []);

  const onLoadMore = useCallback(async () => {
    const cursor = state.cursor;
    if (loadingMore || !cursor) return;
    const run = runRef.current;
    // Says it out loud: "load more" is the ONE change that keeps the cursor and the
    // accumulated items. The reducer returns the same state for it, so this costs no
    // render — it exists so the intent is written down at the call site.
    setState((s) => nextQueryState(s, { kind: "load-more" }));

    setLoadingMore(true);
    setFailed(false);
    try {
      const page = await fetchGalleryPage({
        sort: state.sort,
        q: state.q,
        cursor,
      });
      // A sort/search change while page 2 was in flight supersedes it; writing now would
      // splice rows from the OLD ordering into the new one.
      if (run !== runRef.current) return;
      if (!page) {
        setFailed(true);
        return;
      }
      setState((s) =>
        nextQueryState(s, {
          kind: "page-loaded",
          items: page.items,
          nextCursor: page.nextCursor,
        }),
      );
    } finally {
      // `finally`, not a line before each `return`, and this is the reason: the
      // superseded-run guard above USED to return without clearing the flag. Nothing
      // else ever sets it false — `loadingMore` disables "Load more" AND short-circuits
      // this very callback — so leaking it once left the control permanently dead, for
      // the rest of the session, recoverable only by reloading the page. Changing sort
      // or search while page 2 was in flight was enough to do it.
      setLoadingMore(false);
    }
  }, [loadingMore, state.sort, state.q, state.cursor]);

  const onVote = useCallback(
    async (item: GalleryItemDto) => {
      const outcome = anonVoteOutcome(isAuthed, item.viewerHasUpvoted);
      if (outcome === "prompt") {
        setPromptOpen(true);
        return;
      }

      // ONE open vote request per item, enforced by a REF rather than by `voting` —
      // the ref is written synchronously, so it holds even for two clicks React batches
      // into a single render. Without it a double-click sent POST and DELETE
      // concurrently (the optimistic flip makes the second click read as an un-vote) and
      // the block below then adopted whichever answer landed last, which need not be the
      // state the database committed.
      if (votingRef.current.has(item.id)) return;
      votingRef.current.add(item.id);
      setVoting(new Set(votingRef.current));

      try {
        const snapshot = voteSnapshot(item);
        const optimistic = optimisticVote(item, outcome);
        setState((s) => ({ ...s, items: replaceItem(s.items, optimistic) }));

        const server =
          outcome === "vote" ? await sendUpvote(item.id) : await removeUpvote(item.id);

        if (!server) {
          // Put the pill back exactly as it was, then say why. The most likely cause of a
          // failed vote for a user who looked signed in is an expired session, and a
          // silently-reverted pill would read as a bug in the button.
          setState((s) => ({
            ...s,
            items: replaceItem(s.items, revertVote(optimistic, snapshot)),
          }));
          setPromptOpen(true);
          return;
        }

        // Reconcile against server truth — but KEEP the rank this card is displaying. The
        // vote routes answer with the item, and `rank` is a property of the popular
        // LISTING, so the response carries none; adopting its null would blank a badge
        // whose position on screen has not changed.
        setState((s) => ({
          ...s,
          items: replaceItem(s.items, { ...server, rank: item.rank }),
        }));
      } finally {
        votingRef.current.delete(item.id);
        setVoting(new Set(votingRef.current));
      }
    },
    [isAuthed],
  );

  return (
    <>
      <GalleryHeader onShareYours={() => setShareOpen(true)} />
      <GalleryFilterRow
        sort={state.sort}
        onSortChange={onSortChange}
        search={searchInput}
        onSearchChange={setSearchInput}
      />

      {mounted && (
        <GalleryGrid
          items={state.items}
          loading={loading}
          error={failed}
          searchTerm={state.q}
          voting={voting}
          onRetry={onRetry}
          onClearFilters={onClearFilters}
          onVote={onVote}
        />
      )}

      <LoadMore
        hasMore={mounted && state.cursor !== null}
        loading={loadingMore}
        error={failed && state.items.length > 0}
        onLoadMore={() => void onLoadMore()}
      />

      <SigninPrompt open={promptOpen} onClose={() => setPromptOpen(false)} />
      {/*
        `＋ Share yours` now opens the REAL 16b dialog — with a PROJECT picker, which is
        exactly what retires the placeholder that used to say "go to Your videos and pick
        one". Mounted only while open, so closing it is a full reset of its own state
        (the dialog's inner `key=` handles the switch-project reset while it is open).

        On success we go to the published thing: "Published" that leaves you where you
        were is indistinguishable from nothing having happened, and the watch page is the
        public URL the user is about to share.
      */}
      {shareOpen && (
        <PublishToGalleryDialog
          open
          onClose={() => setShareOpen(false)}
          onPublished={(item) => {
            setShareOpen(false);
            router.push(`/gallery/${item.id}`);
          }}
        />
      )}
    </>
  );
}

/** Long enough that typing a word is one request, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;
