"use client";

import { useEffect, useState } from "react";
import { useYVAuth } from "@youversion/platform-react-ui";
import SignInButton from "./sign-in-button";
import HolyBibleGlyph from "./holy-bible-glyph";
import { initials } from "@/lib/initials";

/**
 * The nav's auth control. Mount-gated (renders null until mounted) because the
 * signed-in and signed-out trees differ and both the auth state and the SDK's
 * "system" theme resolve only on the client — matching the original
 * `auth-button.tsx` pattern to avoid SSR/client hydration mismatches.
 *
 * Signed out → the bespoke gradient sign-in pill.
 * Signed in  → a profile pill (avatar + name + ▾) toggling a dropdown with the
 *              name, email, inert "Your videos" / "Account settings" placeholders,
 *              and a real "Sign out of YouVersion" action.
 */
export default function NavAuth() {
  const { auth, userInfo, signOut } = useYVAuth();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

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

  const name = userInfo?.name;
  const email = userInfo?.email;
  const avatarUrl = userInfo?.avatarUrl?.toString();
  const monogram = initials(name);

  const avatar = (px: number, fontSize: number) =>
    avatarUrl ? (
      // Runtime, third-party avatar URL — a plain <img> avoids next/image
      // remotePatterns config for a single dynamic source.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name ?? "Account"}
        width={px}
        height={px}
        style={{ borderRadius: "50%", objectFit: "cover", flex: "none" }}
      />
    ) : (
      <span
        style={{
          width: px,
          height: px,
          borderRadius: "50%",
          backgroundImage: "var(--sg-grad)",
          display: "grid",
          placeItems: "center",
          fontWeight: 800,
          fontSize,
          color: "#fff",
          flex: "none",
        }}
      >
        {monogram}
      </span>
    );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center cursor-pointer"
        style={{
          gap: 9,
          padding: "6px 12px 6px 6px",
          border: "1px solid var(--sg-line2)",
          borderRadius: 22,
          background: "var(--sg-panel)",
        }}
      >
        {avatar(30, 12)}
        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--sg-fg)" }}>
          {name}
        </span>
        <span aria-hidden style={{ fontSize: 10, color: "var(--sg-dim)" }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 overflow-hidden"
          style={{
            top: "calc(100% + 8px)",
            width: 270,
            background: "var(--sg-panel)",
            border: "1px solid var(--sg-line2)",
            borderRadius: 14,
            boxShadow: "0 20px 44px rgba(0,0,0,.35)",
          }}
        >
          <div
            className="flex items-center"
            style={{
              gap: 11,
              padding: 16,
              borderBottom: "1px solid var(--sg-line)",
            }}
          >
            {avatar(42, 16)}
            <div style={{ minWidth: 0 }}>
              <div
                style={{ fontWeight: 700, fontSize: 14, color: "var(--sg-fg)" }}
              >
                {name}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--sg-dim)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {email}
              </div>
            </div>
          </div>

          <div style={{ padding: 6 }}>
            <button
              type="button"
              className="w-full text-left cursor-pointer"
              style={{
                padding: "9px 11px",
                fontWeight: 600,
                fontSize: 13,
                color: "var(--sg-fg)",
                borderRadius: 8,
                background: "transparent",
                border: "none",
              }}
            >
              {"Your videos"}
            </button>
            <button
              type="button"
              className="w-full text-left cursor-pointer"
              style={{
                padding: "9px 11px",
                fontWeight: 600,
                fontSize: 13,
                color: "var(--sg-fg)",
                borderRadius: 8,
                background: "transparent",
                border: "none",
              }}
            >
              {"Account settings"}
            </button>
          </div>

          <div
            style={{
              padding: "6px 6px 12px",
              borderTop: "1px solid var(--sg-line)",
              marginTop: 2,
            }}
          >
            <button
              type="button"
              onClick={() => signOut()}
              className="flex items-center w-full cursor-pointer"
              style={{
                gap: 9,
                margin: "6px 0 0",
                padding: "9px 11px",
                borderRadius: 10,
                background: "var(--sg-bg)",
                border: "1px solid var(--sg-line2)",
              }}
            >
              <HolyBibleGlyph size={24} />
              <span
                style={{ fontWeight: 500, fontSize: 13, color: "var(--sg-fg)" }}
              >
                {"Sign out of "}
                <b style={{ fontWeight: 800 }}>YouVersion</b>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
