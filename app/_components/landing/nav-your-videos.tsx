"use client";

import Link from "next/link";
import { useSession } from "../session-provider";

/**
 * The authed-only "Your videos" desktop nav link.
 *
 * IT READS `useSession()`, NOT `useYVAuth()`, and that is load-bearing rather than
 * cosmetic (plan §5.4 / the row-41 risk table). A cookie session — the `?seed=` e2e
 * seam, and equally any session established server-side — carries NO YouVersion auth
 * state, so gating on `useYVAuth().auth.isAuthenticated` left this link permanently
 * invisible for exactly the users who have videos. `home-switch.tsx` already uses the
 * correct hook; this now matches it.
 *
 * Still mount-gated: `useSession()` reports signed-out until its own mount effect
 * fires, so SSR === the first client render and there is no hydration mismatch.
 */
export default function NavYourVideos() {
  const { mounted, session } = useSession();

  if (!mounted || !session.isAuthed) return null;

  return (
    <Link
      href="/your-videos"
      data-testid="nav-your-videos"
      className="cursor-pointer"
      style={{
        fontWeight: 600,
        fontSize: 14,
        color: "var(--sg-dim)",
        background: "transparent",
        border: "none",
      }}
    >
      {"Your videos"}
    </Link>
  );
}
