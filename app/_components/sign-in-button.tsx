"use client";

import type { CSSProperties } from "react";
import { useYVAuth } from "@youversion/platform-react-ui";
import HolyBibleGlyph from "./holy-bible-glyph";

type Variant = "nav" | "heroMobile";

/**
 * Per-variant config for the gradient "Sign in with YouVersion" pill. The markup
 * is identical regardless of auth state, so this leaf needs NO mount-gate (no
 * hydration mismatch) — unlike `nav-auth`, which renders different trees.
 *
 * - `nav` → the compact desktop nav control (and the mobile sheet's sign-in).
 * - `heroMobile` → the full-width hero primary that re-surfaces on mobile (9b),
 *   since the nav there is a hamburger. The `data-testid` is the E2E seam.
 */
const VARIANTS: Record<
  Variant,
  {
    testId: string;
    glyph: number;
    padding: string;
    gap: number;
    fontSize: number;
    radius: number;
    boxShadow: string;
    fullWidth: boolean;
  }
> = {
  nav: {
    testId: "signin-nav",
    glyph: 26,
    padding: "9px 16px 9px 9px",
    gap: 10,
    fontSize: 14,
    radius: 12,
    boxShadow:
      "inset 0 1px 0 rgba(255,235,205,.4), 0 6px 16px rgba(192,57,43,.28)",
    fullWidth: false,
  },
  heroMobile: {
    testId: "signin-hero-mobile",
    glyph: 26,
    padding: "14px",
    gap: 10,
    fontSize: 15,
    radius: 13,
    boxShadow:
      "inset 0 1px 0 rgba(255,235,205,.4), 0 10px 24px rgba(192,57,43,.34)",
    fullWidth: true,
  },
};

export default function SignInButton({ variant }: { variant: Variant }) {
  const { signIn } = useYVAuth();
  const s = VARIANTS[variant];

  const style: CSSProperties = {
    gap: s.gap,
    padding: s.padding,
    borderRadius: s.radius,
    backgroundImage: "var(--sg-grad)",
    boxShadow: s.boxShadow,
    border: "none",
    ...(s.fullWidth
      ? { width: "100%", boxSizing: "border-box", justifyContent: "center" }
      : null),
  };

  return (
    <button
      type="button"
      data-testid={s.testId}
      onClick={() => signIn({ scopes: ["profile", "email"] })}
      className="flex items-center cursor-pointer"
      style={style}
    >
      <HolyBibleGlyph size={s.glyph} />
      <span
        style={{
          fontFamily: "var(--font-barlow)",
          fontWeight: 700,
          fontSize: s.fontSize,
          color: "#fff",
        }}
      >
        {"Sign in with "}
        <b style={{ fontWeight: 800 }}>YouVersion</b>
      </span>
    </button>
  );
}
