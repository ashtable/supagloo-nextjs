import Link from "next/link";
import LogoMark from "../logo-mark";
import NavAuth from "../nav-auth";
import NavYourVideos from "./nav-your-videos";
import MobileNav from "./mobile-nav";

/**
 * Top nav. Desktop (≥md): brand + links + authed-only "Your videos" + the auth
 * control (`NavAuth`). Mobile (<md): brand + a hamburger (`MobileNav`) that collapses
 * the links + auth control into a dismissible sheet.
 *
 * Row 41: "Gallery" stopped being an inert placeholder and became a real `<Link>` to
 * `/gallery`. `active` marks the current section so the gallery page's own nav item
 * reads as selected. The rendered TEXT is unchanged, which is what keeps the mock-lane
 * landing specs green: their `textIsVisible` helper queries `button, a, span, div`, so
 * an anchor still matches.
 */
export default function Nav({
  active,
}: {
  active?: "gallery" | "your-videos";
} = {}) {
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
