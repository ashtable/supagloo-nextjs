import Nav from "./nav";
import Hero from "./hero";
import FeaturedDemo from "./featured-demo";
import StartCards from "./start-cards";
import Footer from "./footer";

/**
 * Figure 7a marketing landing. Verbatim lift of the body that used to live
 * directly in `app/page.tsx` (plan D-ROUTE) — no markup change, just moved so
 * `HomeSwitch` (a client component) can render it as a `publicLanding` prop
 * while keeping it a Server Component (a client module can render an RSC
 * given to it as a prop, but cannot import one). `/` still server-renders
 * this marketing HTML for signed-out visitors + SEO.
 */
export default function PublicLanding() {
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
        <Nav />
        <Hero />
        <FeaturedDemo />
        <StartCards />
        <Footer />
      </div>
    </div>
  );
}
