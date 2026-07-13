"use client";

import type { ReactNode } from "react";
import { YouVersionProvider } from "@youversion/platform-react-ui";

export default function Providers({
  appKey,
  children,
}: {
  appKey: string;
  children: ReactNode;
}) {
  // Where YouVersion redirects back after sign-in; must match a callback URL
  // registered in the YouVersion app settings. Defaults to the runtime origin,
  // so it matches whichever host the visitor is on (apex vs. www). `||` (not
  // `??`) means an empty build-time value — what the Docker ARG/ENV yields when
  // NEXT_PUBLIC_YV_AUTH_REDIRECT_URL is unset — also falls back to the origin.
  // During SSR there's no `window`, but the button is client-deferred, so the
  // placeholder is always replaced before any sign-in.
  const authRedirectUrl =
    process.env.NEXT_PUBLIC_YV_AUTH_REDIRECT_URL ||
    (typeof window !== "undefined" ? window.location.origin : "ssr-placeholder");

  return (
    <YouVersionProvider
      appKey={appKey}
      includeAuth
      authRedirectUrl={authRedirectUrl}
      theme="system"
    >
      {children}
    </YouVersionProvider>
  );
}
