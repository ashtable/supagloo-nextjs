"use client";

import SignInButton from "./sign-in-button";
import ProfileMenu from "./profile-menu";
import { useSession } from "./session-provider";

/**
 * The nav's auth control. Mount-gated (renders null until mounted) because the
 * signed-in and signed-out trees differ and the session resolves only on the client.
 *
 * Reads `useSession()` rather than `useYVAuth()` — the same correction row 41 made to
 * `nav-your-videos.tsx`, and for the same reason. This control used to render only
 * inside `PublicLanding`, which itself only mounts when the session is signed OUT, so
 * the discrepancy was invisible. `/gallery` changed that: it is public, it shows this
 * nav to signed-in and signed-out visitors alike, and gating on YouVersion auth would
 * have shown a signed-in user a "Sign in with YouVersion" pill on a page they are
 * signed in to. `session.isAuthed` is the app's one answer to "is this visitor signed
 * in", however the session was established.
 *
 * Signed out → the bespoke gradient sign-in pill.
 * Signed in  → the shared `<ProfileMenu/>` (plan D-NAV).
 */
export default function NavAuth() {
  const { mounted, session } = useSession();

  if (!mounted) return null;
  if (!session.isAuthed) return <SignInButton variant="nav" />;
  return <ProfileMenu pillTestId="nav-profile-pill" />;
}
