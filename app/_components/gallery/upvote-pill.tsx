"use client";

import { formatExactUpvoteCount, upvotePillState } from "@/lib/gallery/gallery-model";

/**
 * The upvote pill. FILLED when the viewer holds a vote on this item, OUTLINED
 * otherwise — the state comes from the server's `viewerHasUpvoted`, optimistically
 * flipped on click and reconciled against the item the vote routes re-read.
 *
 * `aria-pressed` is the a11y truth and `data-voted` is the E2E seam; both say the same
 * thing, deliberately, so a spec can never assert a state the screen reader does not
 * also report.
 *
 * The count is the pill's whole text content, so an E2E reads it with `textContent`
 * and no parsing.
 *
 * `busy` disables it while ITS OWN vote request is open. That is not decoration: the
 * optimistic flip lands before the next click can arrive, so an impatient second click
 * on an enabled pill reads as the OPPOSITE intent and sends a DELETE racing its own
 * POST. The browser's own `disabled` short-circuit is the cheapest correct fence; the
 * caller also holds a synchronous ref, because a disabled attribute is only as current
 * as the last commit.
 *
 * ── TWO PRESENTATIONS, ONE BEHAVIOUR (Turn 16a) ────────────────────────────────
 * `format` and `size` exist because the design draws this control twice, differently:
 * a card renders `▲ 2.4k` at 12px in a 24-wide footer, and the watch page renders
 * `▲ 2,412` at 15px beside a 44px avatar. Both DEFAULT to the card's values, so every
 * existing call site is byte-identical, and the split is presentational only — the
 * optimistic flip, the busy fence and the `aria-pressed`/`data-voted` pair are the same
 * code on both surfaces, which is the whole reason this is one component and not two.
 * The reasoning for the count format itself lives on `formatExactUpvoteCount`.
 */
export default function UpvotePill({
  itemId,
  upvoteCount,
  viewerHasUpvoted,
  busy = false,
  format = "abbreviated",
  size = "small",
  onVote,
}: {
  itemId: string;
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  busy?: boolean;
  /** `abbreviated` = the card's `2.4k`; `exact` = the watch page's `2,412`. */
  format?: "abbreviated" | "exact";
  /** `small` = the card's footer pill; `large` = the watch page's action pill. */
  size?: "small" | "large";
  onVote: () => void;
}) {
  const pill = upvotePillState({ upvoteCount, viewerHasUpvoted });
  const filled = pill.variant === "filled";
  const large = size === "large";
  const count =
    format === "exact" ? formatExactUpvoteCount(upvoteCount) : pill.count;

  return (
    <button
      type="button"
      data-testid={`gallery-upvote-${itemId}`}
      data-voted={pill.pressed ? "true" : "false"}
      aria-pressed={pill.pressed}
      aria-label={pill.pressed ? "Remove upvote" : "Upvote"}
      aria-busy={busy}
      disabled={busy}
      onClick={onVote}
      className={busy ? "flex items-center" : "flex items-center cursor-pointer"}
      style={{
        gap: large ? 8 : 6,
        padding: large ? "11px 18px" : "5px 11px",
        borderRadius: large ? 22 : 20,
        fontWeight: large ? 800 : 700,
        fontSize: large ? 15 : 12,
        whiteSpace: "nowrap",
        fontFamily: "var(--font-barlow)",
        color: filled ? "#fff" : "var(--sg-dim)",
        border: filled ? "1px solid transparent" : "1px solid var(--sg-line2)",
        backgroundImage: filled ? "var(--sg-grad)" : "none",
        background: filled ? undefined : "transparent",
        // The optimistic flip already showed the outcome, so the in-flight state is a
        // whisper, not a spinner: the pill stays legible and simply stops accepting.
        opacity: busy ? 0.72 : 1,
      }}
    >
      <span aria-hidden>{"▲"}</span>
      {/* The count gets its own testid so a spec reads the NUMBER, not the number with
          the caret glued to it. */}
      <span data-testid={`gallery-upvote-count-${itemId}`}>{count}</span>
    </button>
  );
}
