import type { Metadata } from "next";
import Nav from "../_components/landing/nav";
import Footer from "../_components/landing/footer";
import YourVideosList from "../_components/your-videos/your-videos-list";

export const metadata: Metadata = {
  title: "Your videos — Supagloo",
  description: "Every video you have rendered, and the ones you have published.",
};

/**
 * `/your-videos` — the authed counterpart of `/gallery`. NO WIREFRAME EXISTS for this
 * screen (design-delta §5), so it adapts 10a's `recent-projects.tsx` grid rather than
 * inventing a second visual language; it is flagged for the design pass.
 *
 * Same server-shell + mount-gated-client-island shape as `/gallery`: the list is
 * session-dependent, so it cannot be server-rendered honestly, and its testid must be a
 * genuine post-hydration signal.
 */
export default function YourVideosPage() {
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
        <Nav active="your-videos" />
        <YourVideosList />
        <Footer />
      </div>
    </div>
  );
}
