import type { Metadata } from "next";
import Nav from "../_components/landing/nav";
import Footer from "../_components/landing/footer";
import GalleryBrowser from "../_components/gallery/gallery-browser";

export const metadata: Metadata = {
  title: "Community gallery — Supagloo",
  description:
    "Scripture videos made by the Supagloo community. Sort by most popular, newest or trending, search them, and publish your own.",
};

/**
 * `/gallery` (Turn 15) — a SERVER SHELL hosting the mount-gated client browser (D14).
 *
 * This is the app's one genuinely PUBLIC page: the API's listing route is
 * `optionalAuth`, and `forwardToApi` already omits the bearer when there is no session
 * cookie, so an anonymous visitor rides the ordinary BFF path with no special case.
 *
 * Shell metrics are lifted verbatim from `public-landing.tsx` (the 1320px column, the
 * background/colour/font trio) so the gallery reads as the same site rather than a
 * second one. The nav band and the footer stay server-rendered; `GalleryBrowser`
 * server-renders its header and filter chrome too, and gates only the grid behind mount.
 */
export default function GalleryPage() {
  return (
    <div
      className="min-h-screen w-full flex-1"
      style={{
        background: "var(--sg-bg)",
        color: "var(--sg-fg)",
        fontFamily: "var(--font-barlow)",
      }}
    >
      <div className="mx-auto w-full max-w-[1320px]">
        <Nav active="gallery" />
        <GalleryBrowser />
        <Footer />
      </div>
    </div>
  );
}
