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
  // Where YouVersion redirects back to after sign-in. Must exactly match a
  // redirect URL registered in your YouVersion app settings. Defaults to the
  // current origin so it works across local/preview/production without config;
  // override with NEXT_PUBLIC_YV_AUTH_REDIRECT_URL when needed.
  const authRedirectUrl =
    process.env.NEXT_PUBLIC_YV_AUTH_REDIRECT_URL ??
    (typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000");

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
