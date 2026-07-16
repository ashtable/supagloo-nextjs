"use client";

import { useYVAuth } from "@youversion/platform-react-ui";
import HolyBibleGlyph from "./holy-bible-glyph";

type Variant = "hero" | "nav";

/**
 * Per-variant sizing for the gradient "Sign in with YouVersion" pill. The markup
 * is identical regardless of auth state, so this leaf needs NO mount-gate (no
 * hydration mismatch) — unlike `nav-auth`, which renders different trees.
 */
const VARIANTS: Record<
  Variant,
  {
    glyph: number;
    padding: string;
    gap: number;
    fontSize: number;
    radius: number;
    boxShadow: string;
  }
> = {
  hero: {
    glyph: 28,
    padding: "14px 24px 14px 12px",
    gap: 11,
    fontSize: 15,
    radius: 13,
    boxShadow: "inset 0 1px 0 rgba(255,235,205,.4), 0 10px 24px rgba(192,57,43,.34)",
  },
  nav: {
    glyph: 26,
    padding: "9px 16px 9px 9px",
    gap: 10,
    fontSize: 14,
    radius: 12,
    boxShadow: "inset 0 1px 0 rgba(255,235,205,.4), 0 6px 16px rgba(192,57,43,.28)",
  },
};

export default function SignInButton({ variant }: { variant: Variant }) {
  const { signIn } = useYVAuth();
  const s = VARIANTS[variant];

  return (
    <button
      type="button"
      data-testid={`signin-${variant}`}
      onClick={() => signIn({ scopes: ["profile", "email"] })}
      className="flex items-center cursor-pointer"
      style={{
        gap: s.gap,
        padding: s.padding,
        borderRadius: s.radius,
        backgroundImage: "var(--sg-grad)",
        boxShadow: s.boxShadow,
        border: "none",
      }}
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
