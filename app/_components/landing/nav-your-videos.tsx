"use client";

import { useEffect, useState } from "react";
import { useYVAuth } from "@youversion/platform-react-ui";

/**
 * The authed-only "Your videos" desktop nav link. Mount-gated (renders null
 * until mounted) so the auth-dependent tree only appears after hydration — same
 * reason as `nav-auth.tsx`. Inert placeholder (no route yet).
 */
export default function NavYourVideos() {
  const { auth } = useYVAuth();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted || !auth.isAuthenticated) return null;

  return (
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
      {"Your videos"}
    </button>
  );
}
