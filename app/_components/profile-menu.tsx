"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HolyBibleGlyph from "./holy-bible-glyph";
import { useSession } from "./session-provider";
import { initials } from "@/lib/initials";

/**
 * The profile pill + dropdown, extracted from `nav-auth.tsx` (plan D-NAV) so
 * both the landing nav's legacy signed-in branch AND the workspace (10a) nav
 * share one implementation instead of diverging. Reads name/email from
 * `useSession()` (real `userInfo` in prod, the seeded demo identity in demo
 * mode — plan D-DATA), not `useYVAuth()` directly.
 *
 * "Your videos" and "Account settings" were inert stubs before Turn 10/11;
 * both now navigate (ambiguity #8). "Sign out" calls the real `signOut()`.
 */
export default function ProfileMenu({ pillTestId }: { pillTestId: string }) {
  const router = useRouter();
  const { session, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside pointerdown or Escape; listeners only exist while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const name = session.user?.name ?? "";
  const email = session.user?.email ?? "";
  const monogram = initials(name);

  const avatar = (px: number, fontSize: number) => (
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
        ref={triggerRef}
        type="button"
        data-testid={pillTestId}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name ? undefined : "Account menu"}
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
          {"▾"}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          data-testid="profile-menu"
          role="menu"
          aria-label={name || "Account menu"}
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
              role="menuitem"
              data-testid="menu-your-videos"
              onClick={() => {
                setOpen(false);
                router.push("/");
              }}
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
              role="menuitem"
              data-testid="menu-account-settings"
              onClick={() => {
                setOpen(false);
                router.push("/profile");
              }}
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
              role="menuitem"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
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
                <b style={{ fontWeight: 800 }}>{"YouVersion"}</b>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
