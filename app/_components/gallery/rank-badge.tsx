import { rankBadgeFor } from "@/lib/gallery/gallery-model";

/**
 * The podium badge on a card's poster. Renders NOTHING unless the server sent a rank
 * of 1-3 — `rank` is non-null only under `sort=popular`, is continuous across pages,
 * and is never recomputed here from a list index.
 *
 * #1 reuses the `RENDERED` chip's exact token pair from 10a's `recent-projects.tsx`
 * (`#160f14` on `rgba(255,232,168,.94)`): it is the app's existing "this one is
 * finished / first" colour, so the trophy reads as part of the same system rather than
 * a new accent. #2 and #3 stay quiet on a scrim.
 */
export default function RankBadge({
  rank,
  itemId,
}: {
  rank: number | null;
  itemId: string;
}) {
  const badge = rankBadgeFor(rank);
  if (!badge) return null;

  const trophy = badge.kind === "trophy";
  return (
    <span
      data-testid={`gallery-rank-${itemId}`}
      style={{
        position: "absolute",
        top: 10,
        left: 11,
        padding: "3px 9px",
        borderRadius: 6,
        fontFamily: "var(--font-barlow-semi)",
        fontWeight: 700,
        fontSize: 10.5,
        letterSpacing: ".08em",
        color: trophy ? "#160f14" : "#fff",
        background: trophy ? "rgba(255,232,168,.94)" : "rgba(0,0,0,.55)",
        border: trophy ? "none" : "1px solid rgba(255,255,255,.28)",
      }}
    >
      {badge.label}
    </span>
  );
}
