import type { CSSProperties } from "react";

/**
 * The public source repository, linked from every nav.
 *
 * This replaced an inert "How it works" control that appeared in all three navs
 * (`landing/nav.tsx` as a `<button>`, `landing/mobile-nav.tsx` as a menu `<button>`,
 * `workspace/workspace-nav.tsx` as a `<span>`) and had no handler in any of them —
 * it rendered, it was styled like a link, and clicking it did nothing. Nothing in
 * `tests/` or `lib/` anchored that string, so replacing it costs no coverage.
 *
 * ── WHY NO STAR COUNT ────────────────────────────────────────────────────────
 * The obvious read of "make it look like shadcn's" is icon + star count, because
 * that is the distinctive thing in their header. It is deliberately NOT copied:
 * `ashtable/supagloo` has 0 stars, so the count would render `0` and turn a
 * social-proof affordance into the opposite. It also costs a live `api.github.com`
 * fetch on a component that renders on every page.
 *
 * `stars` exists so wiring one later is a prop, not a refactor: pass it and the
 * count renders in a divided cell the way shadcn's does. Anything falsy renders
 * the plain label, so `stars={0}` is also correctly treated as "not worth showing".
 */
export const SOURCE_REPO_URL = "https://github.com/ashtable/supagloo";

/** GitHub's own mark (octicons `mark-github`, 16px grid), inheriting `currentColor`. */
function GithubMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Compact display form, matching shadcn's header: 1200 -> "1.2k". */
function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 100 | 0) / 10}k` : String(n);
}

export default function GithubSourceLink({
  variant = "nav",
  stars,
  onNavigate,
  style,
  testId,
}: {
  /** `nav` — the inline ghost pill. `menu` — a full-width row in the mobile sheet. */
  variant?: "nav" | "menu";
  /** Optional star count. Falsy renders the plain label; see the note above. */
  stars?: number;
  /** `menu` only — the sheet closes itself on navigate, as its siblings do. */
  onNavigate?: () => void;
  /** `menu` only — receives the sheet's shared `menuItem` style. */
  style?: CSSProperties;
  testId?: string;
} = {}) {
  const showStars = typeof stars === "number" && stars > 0;

  if (variant === "menu") {
    return (
      <a
        href={SOURCE_REPO_URL}
        target="_blank"
        rel="noreferrer noopener"
        role="menuitem"
        data-testid={testId ?? "nav-sheet-github"}
        onClick={onNavigate}
        className="sg-ghost-link flex items-center text-left cursor-pointer"
        style={{ ...style, gap: 9 }}
      >
        <GithubMark size={15} />
        <span>{"Source"}</span>
        {showStars && (
          <span style={{ marginLeft: "auto", opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
            {formatStars(stars)}
          </span>
        )}
      </a>
    );
  }

  return (
    <a
      href={SOURCE_REPO_URL}
      target="_blank"
      rel="noreferrer noopener"
      data-testid={testId ?? "nav-github"}
      aria-label="Supagloo source code on GitHub"
      title="Source on GitHub"
      className="sg-ghost-link inline-flex items-center cursor-pointer"
      style={{
        gap: 7,
        // -7px/-9px keeps the text baseline aligned with the sibling nav links: the
        // hover background is padding, so without the pull-in it would shift the row.
        margin: "-7px -9px",
        padding: "7px 9px",
        borderRadius: 9,
        fontWeight: 600,
        fontSize: 14,
        whiteSpace: "nowrap",
      }}
    >
      <GithubMark size={16} />
      <span>{"GitHub"}</span>
      {showStars && (
        <>
          <span
            aria-hidden="true"
            style={{ width: 1, height: 13, background: "var(--sg-line2)", marginInline: 2 }}
          />
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatStars(stars)}</span>
        </>
      )}
    </a>
  );
}
