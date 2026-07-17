import type { Metadata } from "next";
import ProfilePage from "../_components/profile/profile-page";

export const metadata: Metadata = {
  title: "Profile & connections — Supagloo",
  description:
    "Link the GitHub, OpenRouter, and Gloo AI accounts Supagloo uses to store your projects and run AI models.",
};

/**
 * `/profile` (10b) — an RSC shell hosting the client `<ProfilePage/>` island,
 * the same server-shell-hosts-client-island shape as `/studio` (plan §2).
 * There's no server session to gate this route with (client-only auth per
 * `[[auth-integration]]`); `ProfilePage` itself redirects signed-out visitors
 * back to `/`.
 */
export default function Profile() {
  return <ProfilePage />;
}
