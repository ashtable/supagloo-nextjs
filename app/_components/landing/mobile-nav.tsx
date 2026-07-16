"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useYVAuth } from "@youversion/platform-react-ui";
import SignInButton from "../sign-in-button";
import HolyBibleGlyph from "../holy-bible-glyph";

/**
 * The mobile nav: a hamburger button toggling a dismissible sheet. Below `md`
 * the nav's desktop links + auth pill collapse into this control (the nav wraps
 * it in `md:hidden`). The sheet carries the nav links, the authed-only "Your
 * videos", and the auth action (sign-in when signed-out / sign-out when signed
 * in). Dismissal + a11y are lifted verbatim from `nav-auth.tsx`: close on an
 * outside `pointerdown` or `Escape` (which returns focus to the trigger);
 * `aria-haspopup`/`aria-expanded` on the trigger, `role="menu"`/`menuitem` in
 * the sheet.
 *
 * Not mount-gated: the sheet is closed at SSR (`open=false`), so SSR === first
 * client render (only the hamburger). The auth-dependent sheet body renders only
 * after the user opens it — post-hydration — so there is no mismatch. All links
 * are inert placeholders.
 */

const menuItem: CSSProperties = {
  padding: "9px 11px",
  fontWeight: 600,
  fontSize: 13,
  color: "var(--sg-fg)",
  borderRadius: 8,
  background: "transparent",
  border: "none",
};

const bar: CSSProperties = {
  width: 15,
  height: 2,
  background: "var(--sg-fg)",
  borderRadius: 1,
};

export default function MobileNav() {
  const { auth, signOut } = useYVAuth();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside pointerdown / Escape; listeners exist only while open.
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

  const authed = auth.isAuthenticated;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="nav-hamburger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open menu"
        className="flex flex-col items-center justify-center cursor-pointer"
        style={{
          width: 34,
          height: 34,
          gap: 3,
          border: "1px solid var(--sg-line2)",
          borderRadius: 9,
          background: "transparent",
        }}
      >
        <span aria-hidden style={bar} />
        <span aria-hidden style={bar} />
        <span aria-hidden style={bar} />
      </button>

      {open && (
        <div
          ref={panelRef}
          data-testid="nav-sheet"
          role="menu"
          aria-label="Menu"
          className="absolute right-0 z-50 flex flex-col overflow-hidden"
          style={{
            top: "calc(100% + 8px)",
            width: 240,
            padding: 8,
            gap: 2,
            background: "var(--sg-panel)",
            border: "1px solid var(--sg-line2)",
            borderRadius: 14,
            boxShadow: "0 20px 44px rgba(0,0,0,.35)",
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="text-left cursor-pointer"
            style={menuItem}
          >
            {"How it works"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="text-left cursor-pointer"
            style={menuItem}
          >
            {"Gallery"}
          </button>
          {authed && (
            <button
              type="button"
              role="menuitem"
              className="text-left cursor-pointer"
              style={menuItem}
            >
              {"Your videos"}
            </button>
          )}

          <div
            style={{
              marginTop: 6,
              paddingTop: 8,
              borderTop: "1px solid var(--sg-line)",
            }}
          >
            {authed ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => signOut()}
                className="flex items-center w-full cursor-pointer"
                style={{
                  gap: 9,
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
            ) : (
              <SignInButton variant="nav" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
