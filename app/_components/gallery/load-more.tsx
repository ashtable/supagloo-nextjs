"use client";

/**
 * "Load more". Renders NOTHING when `nextCursor === null`.
 *
 * That null is the API's whole pagination contract: it fetches `pageSize + 1` rows and
 * mints a cursor only if the extra row existed, so null means GENUINELY EXHAUSTED
 * rather than "this page was short". Hiding on it is therefore honest — there is no
 * `hasMore` flag that could disagree.
 *
 * The loading + error states are INVENTED (design-delta §5 designs neither).
 */
export default function LoadMore({
  hasMore,
  loading,
  error,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  error: boolean;
  onLoadMore: () => void;
}) {
  if (!hasMore) return null;

  return (
    <div
      className="flex flex-col items-center"
      style={{ gap: 10, padding: "30px 0 54px" }}
    >
      <button
        type="button"
        data-testid="gallery-load-more"
        onClick={onLoadMore}
        disabled={loading}
        className="cursor-pointer"
        style={{
          padding: "11px 26px",
          borderRadius: 12,
          border: "1px solid var(--sg-line2)",
          background: "var(--sg-panel)",
          fontWeight: 700,
          fontSize: 14,
          color: "var(--sg-fg)",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Loading…" : "Load more"}
      </button>
      {error && (
        <span
          data-testid="gallery-load-more-error"
          style={{ fontSize: 12.5, color: "var(--sg-red)" }}
        >
          {"That didn't load. Try again."}
        </span>
      )}
    </div>
  );
}
