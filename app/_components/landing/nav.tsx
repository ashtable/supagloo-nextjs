import Link from "next/link";
import LogoMark from "../logo-mark";
import NavAuth from "../nav-auth";
import NavYourVideos from "./nav-your-videos";
import MobileNav from "./mobile-nav";

/**
 * Top nav, in two variants.
 *
 * **`site`** (the default, every screen up to Turn 15): brand + links + authed-only
 * "Your videos" + the auth control (`NavAuth`). Mobile (<md): brand + a hamburger
 * (`MobileNav`) that collapses the links + auth control into a dismissible sheet.
 * `active` marks the current section so the gallery page's own nav item reads as
 * selected. The rendered TEXT is unchanged from row 41, which is what keeps the mock-lane
 * landing specs green: their `textIsVisible` helper queries `button, a, span, div`, so an
 * anchor still matches.
 *
 * **`watch`** (Turn 16a §1.1): a back link, a CENTRED logo lockup, and the user pill.
 * **No `Gallery` / `How it works` / `Your videos` links at all** — the back link replaces
 * them, because the watch page is a place you arrive at from somewhere and leave back to.
 *
 * ── WHY THIS IS A `variant`, NOT A THIRD `active` VALUE ─────────────────────────
 * The obvious reading of "widen `Nav.active`" is `active="watch"`. It is wrong: `active`
 * answers *which section is current*, and the watch page **is** the gallery section. A
 * third value would make `active="watch"` and `active="gallery"` mutually exclusive when
 * both are true, and the first thing anyone building a creator profile or a playlist
 * page would hit is the same collision again. `variant` answers a different question —
 * *which chrome does this page wear* — and the two compose.
 *
 * The `‹` here is U+2039, per §1.1, not the `←` 12b uses for "choose another". The
 * design draws the new glyph and it is a different gesture: `←` steps back inside a
 * flow, `‹` leaves for the listing.
 */
export default function Nav({
  active,
  variant = "site",
  back,
}: {
  active?: "gallery" | "your-videos";
  variant?: "site" | "watch";
  /** `watch` only — where the back link goes and what it says. */
  back?: { href: string; label: string };
} = {}) {
  if (variant === "watch") {
    return (
      <nav
        className="flex items-center min-h-[70px] px-4 sm:px-[34px]"
        style={{ gap: 18, borderBottom: "1px solid var(--sg-line)" }}
      >
        <Link
          href={back?.href ?? "/gallery"}
          data-testid="nav-back"
          className="cursor-pointer"
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--sg-dim)",
            whiteSpace: "nowrap",
          }}
        >
          {back?.label ?? "‹ Gallery"}
        </Link>

        <div style={{ flex: 1 }} />

        {/* Centred between two flexible spacers — 15a anchors the same lockup left.
            30px badge / 18px wordmark here, against 15a's 34px / 20px. */}
        <Link
          href="/"
          data-testid="nav-brand"
          className="flex items-center"
          style={{ gap: 11 }}
        >
          <LogoMark size={30} />
          <span
            className="hidden sm:inline"
            style={{
              fontFamily: "var(--font-barlow)",
              fontWeight: 800,
              fontSize: 18,
              letterSpacing: "-.01em",
              color: "var(--sg-fg)",
            }}
          >
            {"Supagloo"}
          </span>
        </Link>

        <div style={{ flex: 1 }} />

        <NavAuth />
      </nav>
    );
  }

  return (
    <nav
      className="flex flex-wrap items-center min-h-[70px] px-4 sm:px-[34px] py-2 sm:py-0"
      style={{ gap: 18, borderBottom: "1px solid var(--sg-line)" }}
    >
      <div className="flex items-center" style={{ gap: 11 }}>
        <LogoMark size={34} />
        <span
          style={{
            fontFamily: "var(--font-barlow)",
            fontWeight: 800,
            fontSize: 20,
            letterSpacing: "-.01em",
            color: "var(--sg-fg)",
          }}
        >
          {"Supagloo"}
        </span>
      </div>

      <div className="hidden sm:block flex-1" />

      {/* Desktop cluster — collapses into the hamburger below md. The two links'
          text stays in the DOM even when hidden, so exact-copy anchors are safe. */}
      <div
        className="hidden md:flex items-center ml-auto mr-2"
        style={{ gap: 28 }}
      >
        <button
          type="button"
          className="cursor-pointer"
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: "var(--sg-dim)",
            background: "transparent",
            border: "none",
          }}
        >
          {"How it works"}
        </button>
        <Link
          href="/gallery"
          data-testid="nav-gallery"
          aria-current={active === "gallery" ? "page" : undefined}
          className="cursor-pointer"
          style={{
            fontWeight: active === "gallery" ? 700 : 600,
            fontSize: 14,
            color: active === "gallery" ? "var(--sg-fg)" : "var(--sg-dim)",
            background: "transparent",
            border: "none",
          }}
        >
          {"Gallery"}
        </Link>
        <NavYourVideos />
        <NavAuth />
      </div>

      {/* Mobile hamburger — hidden at md+. */}
      <div className="md:hidden ml-auto">
        <MobileNav />
      </div>
    </nav>
  );
}
