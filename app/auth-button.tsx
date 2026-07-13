"use client";

import { useEffect, useState } from "react";
import { YouVersionAuthButton, useYVAuth } from "@youversion/platform-react-ui";

export default function AuthButton() {
  const { auth, userInfo } = useYVAuth();
  const [mounted, setMounted] = useState(false);

  // Both the auth state (read from client-stored tokens) and the SDK's
  // "system" theme (resolved via matchMedia) are only known on the client, so
  // defer rendering until after mount to avoid SSR/client hydration mismatches.
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="flex items-center gap-3">
      {auth.isAuthenticated && userInfo?.name && (
        <span className="text-sm text-zinc-600 dark:text-zinc-300">
          {userInfo.name}
        </span>
      )}
      <YouVersionAuthButton mode="auto" scopes={["profile", "email"]} />
    </div>
  );
}
