"use client";

import { useEffect, useState } from "react";
import { useYVAuth } from "@youversion/platform-react-ui";
import SignInButton from "./sign-in-button";
import ProfileMenu from "./profile-menu";

/**
 * The nav's auth control. Mount-gated (renders null until mounted) because the
 * signed-in and signed-out trees differ and both the auth state and the SDK's
 * "system" theme resolve only on the client — matching the original
 * `auth-button.tsx` pattern to avoid SSR/client hydration mismatches.
 *
 * Signed out → the bespoke gradient sign-in pill.
 * Signed in  → the shared `<ProfileMenu/>` (plan D-NAV). In practice this
 *              branch is legacy/defensive under D-ROUTE: `NavAuth` only ever
 *              renders inside `PublicLanding`, which itself only mounts when
 *              the session is signed out — so a real authed visit swaps to
 *              the workspace (10a) before this branch would show.
 */
export default function NavAuth() {
  const { auth } = useYVAuth();
  const [mounted, setMounted] = useState(false);

  // Intentional post-hydration mount gate: flip `mounted` once, on the client,
  // so the auth-dependent tree (which differs from any server render) only
  // appears after hydration. This is the documented use of a one-shot effect
  // setState, not a cascading-render bug.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  if (!auth.isAuthenticated) {
    return <SignInButton variant="nav" />;
  }

  return <ProfileMenu pillTestId="nav-profile-pill" />;
}
