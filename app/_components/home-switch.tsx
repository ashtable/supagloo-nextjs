"use client";

import type { ReactNode } from "react";
import { useSession } from "./session-provider";

/**
 * `/`'s branch point (plan D-ROUTE). `app/page.tsx` stays a Server Component
 * that passes both trees down as PROPS — a client component can render an
 * RSC given to it as a prop, but can't import one — so `publicLanding` keeps
 * server-rendering the marketing HTML for signed-out visitors + SEO.
 *
 * Mount-gated: SSR and the first client render always show `publicLanding`
 * (the accepted first-paint-signed-out trade-off, matching the landing
 * suite's 9a precedent), swapping to `workspace` only once mounted AND the
 * session resolves to authed.
 */
export default function HomeSwitch({
  publicLanding,
  workspace,
}: {
  publicLanding: ReactNode;
  workspace: ReactNode;
}) {
  const { mounted, session } = useSession();

  if (!mounted || !session.isAuthed) return <>{publicLanding}</>;
  return <>{workspace}</>;
}
