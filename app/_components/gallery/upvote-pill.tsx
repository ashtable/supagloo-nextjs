"use client";

import { upvotePillState } from "@/lib/gallery/gallery-model";

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
 */
export default function UpvotePill({
  itemId,
  upvoteCount,
  viewerHasUpvoted,
  onVote,
}: {
  itemId: string;
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  onVote: () => void;
}) {
  const pill = upvotePillState({ upvoteCount, viewerHasUpvoted });
  const filled = pill.variant === "filled";

  return (
    <button
      type="button"
      data-testid={`gallery-upvote-${itemId}`}
      data-voted={pill.pressed ? "true" : "false"}
      aria-pressed={pill.pressed}
      aria-label={pill.pressed ? "Remove upvote" : "Upvote"}
      onClick={onVote}
      className="flex items-center cursor-pointer"
      style={{
        gap: 6,
        padding: "5px 11px",
        borderRadius: 20,
        fontWeight: 700,
        fontSize: 12,
        fontFamily: "var(--font-barlow)",
        color: filled ? "#fff" : "var(--sg-dim)",
        border: filled ? "1px solid transparent" : "1px solid var(--sg-line2)",
        backgroundImage: filled ? "var(--sg-grad)" : "none",
        background: filled ? undefined : "transparent",
      }}
    >
      <span aria-hidden>{"▲"}</span>
      {/* The count gets its own testid so a spec reads the NUMBER, not the number with
          the caret glued to it. */}
      <span data-testid={`gallery-upvote-count-${itemId}`}>{pill.count}</span>
    </button>
  );
}
