"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useYVAuth } from "@youversion/platform-react-ui";
import SignInButton from "../sign-in-button";
import { heroModel, HERO_COPY } from "@/lib/landing/hero-model";

/**
 * The auth-varying + viewport-varying lede of the hero: eyebrow, headline,
 * sub-copy, and the CTA block. Mount-gated (D4): SSR and the first client render
 * are the SIGNED-OUT (8a/9b) tree, so SSR === initial client render (no
 * hydration mismatch); after mount, if authenticated, it swaps to the SIGNED-IN
 * (9a) tree — an ordinary post-hydration update. Mirrors `nav-auth.tsx`.
 *
 * Viewport differences (D2-a shortened mobile copy, mobile sign-in, mobile
 * CTA stack) are expressed with `md:` visibility so they need no JS. The headline
 * still server-renders (client components SSR their initial HTML) for crawlers.
 */

const eyebrowStyle: CSSProperties = {
  fontFamily: "var(--font-barlow-semi)",
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: ".26em",
  color: "var(--sg-dim)",
  marginBottom: 20,
};

const subCopyStyle: CSSProperties = {
  fontFamily: "var(--font-zilla)",
  fontSize: 18,
  lineHeight: 1.55,
  color: "var(--sg-dim)",
  marginTop: 22,
};

const gradientPill: CSSProperties = {
  gap: 9,
  padding: "14px 26px",
  borderRadius: 13,
  backgroundImage: "var(--sg-grad)",
  boxShadow:
    "inset 0 1px 0 rgba(255,235,205,.4), 0 10px 24px rgba(192,57,43,.34)",
  fontWeight: 700,
  fontSize: 15,
  color: "#fff",
  border: "none",
};

const outlinePill: CSSProperties = {
  gap: 9,
  padding: "14px 22px",
  border: "1px solid var(--sg-line2)",
  borderRadius: 13,
  fontWeight: 700,
  fontSize: 15,
  color: "var(--sg-fg)",
  background: "transparent",
};

const fullWidth: CSSProperties = { width: "100%", boxSizing: "border-box" };

export default function HeroLede() {
  const { auth, userInfo } = useYVAuth();
  const [mounted, setMounted] = useState(false);

  // Post-hydration mount gate — one-shot, intentional (see nav-auth.tsx).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const signedIn = mounted && auth.isAuthenticated;
  const m = heroModel(signedIn, userInfo?.name);

  return (
    <>
      {signedIn ? (
        <div style={eyebrowStyle}>{m.eyebrow}</div>
      ) : (
        <>
          <div
            data-testid="hero-eyebrow-desktop"
            className="hidden md:block"
            style={eyebrowStyle}
          >
            {HERO_COPY.eyebrowSignedOut}
          </div>
          <div
            data-testid="hero-eyebrow-mobile"
            className="md:hidden"
            style={eyebrowStyle}
          >
            {HERO_COPY.eyebrowMobileSignedOut}
          </div>
        </>
      )}

      <h1
        className="max-w-[900px] break-words"
        style={{
          fontFamily: "var(--font-anton)",
          // 74px at the desktop design width; scales down so the Anton headline
          // never clips (74px reached by ~925px via 8vw, so ≥1320px is faithful).
          fontSize: "clamp(2rem, 8vw, 74px)",
          lineHeight: 0.98,
          letterSpacing: ".005em",
        }}
      >
        {"TURN SCRIPTURE INTO"}
        <br />
        <span
          style={{
            backgroundImage: "var(--sg-grad-head)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {"CINEMATIC VIDEO."}
        </span>
      </h1>

      {signedIn ? (
        <p className="max-w-[600px]" style={subCopyStyle}>
          {HERO_COPY.subCopyBase}
        </p>
      ) : (
        <>
          <p
            data-testid="hero-subcopy-desktop"
            className="hidden md:block max-w-[600px]"
            style={subCopyStyle}
          >
            {HERO_COPY.subCopySignedOut}
          </p>
          <p
            data-testid="hero-subcopy-mobile"
            className="md:hidden max-w-[600px]"
            style={{ ...subCopyStyle, fontSize: 15, marginTop: 16 }}
          >
            {HERO_COPY.subCopyMobileSignedOut}
          </p>
        </>
      )}

      {/* Desktop CTA row: signed-in → [gradient Start creating] [outline demo];
          signed-out → [gradient demo] (sole). */}
      <div
        className="hidden md:flex items-center justify-center"
        style={{ gap: 14, marginTop: 34 }}
      >
        {signedIn && (
          <button
            type="button"
            className="flex items-center cursor-pointer"
            style={gradientPill}
          >
            {HERO_COPY.startCreating}
          </button>
        )}
        <button
          type="button"
          data-testid="hero-demo"
          className="flex items-center cursor-pointer"
          style={signedIn ? outlinePill : gradientPill}
        >
          {HERO_COPY.watchDemo}
        </button>
      </div>

      {/* Mobile CTA stack: full-width primary (sign-in when signed-out, else
          Start creating) + full-width outline demo secondary. */}
      <div
        className="flex md:hidden flex-col w-full items-stretch"
        style={{ gap: 10, marginTop: 22 }}
      >
        {m.showHeroSignIn ? (
          <SignInButton variant="heroMobile" />
        ) : (
          <button
            type="button"
            className="flex items-center justify-center cursor-pointer"
            style={{ ...gradientPill, ...fullWidth, padding: "14px" }}
          >
            {HERO_COPY.startCreating}
          </button>
        )}
        <button
          type="button"
          className="flex items-center justify-center cursor-pointer"
          style={{ ...outlinePill, ...fullWidth, padding: "13px" }}
        >
          {HERO_COPY.watchDemo}
        </button>
      </div>
    </>
  );
}
