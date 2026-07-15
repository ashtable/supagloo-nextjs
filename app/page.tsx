import type { Metadata } from "next";
import Nav from "./_components/landing/nav";
import Hero from "./_components/landing/hero";
import FeaturedDemo from "./_components/landing/featured-demo";
import StartCards from "./_components/landing/start-cards";
import Footer from "./_components/landing/footer";

export const metadata: Metadata = {
  title: "Supagloo — Turn Scripture into cinematic video",
  description:
    "Pick a verse — Supagloo storyboards it, narrates it in the voice you describe, and scores it into a share-ready short. Built on the YouVersion Platform.",
};

/**
 * Figure 7a landing page. Static Server Component composing the marketing
 * sections; the only client leaves are the auth controls (`NavAuth`,
 * `SignInButton`). No module-scope data fetch — the landing needs no live verse.
 */
export default function Home() {
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
