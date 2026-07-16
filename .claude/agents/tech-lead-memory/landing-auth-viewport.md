---
name: landing-auth-viewport
description: Turn 8/9 landing — auth×viewport matrix (8a/9a/9b), the hero-model pure seam, mount-gated leaves, md breakpoint, favicon
metadata:
  type: decision
---

Turn 8/9 made the landing **auth-state-aware AND viewport-aware** (was the static 7a hero).
Shipped 2026-07-16; all gates green (unit 13/13, tsc/eslint/build clean, 22/22 Playwright DOM
checks). Full plan: `scratch/turn8-9-landing.md`. Builds on [[landing-responsive]] + [[auth-integration]].

## The matrix
- **8a** desktop signed-out: sign-in is in the NAV only; hero's sole CTA is the gradient
  "▶ Watch the Genesis demo"; full sub-copy (with "Sign in with your YouVersion account to begin.").
- **9a** desktop signed-in: nav profile pill + "Your videos"; hero eyebrow "WELCOME BACK, ASH ·
  READY WHEN YOU ARE"; primary "＋ Start creating" (U+FF0B) + outline demo; sub-copy WITHOUT the
  sign-in sentence.
- **9b** mobile signed-out: nav → hamburger; hero re-surfaces a full-width "Sign in with YouVersion"
  primary + outline demo; **D2-a shortened copy** (short eyebrow/sub-copy/trust-note/demo-label/
  desc/3-chips), stacked poster-over-details, single button (no "Preview scenes ▸"), horizontal
  start cards, centered logo-less footer.

## Key decisions
- **The auth seam is a PURE module** `lib/landing/hero-model.ts` — `heroModel(isAuthed,name)` →
  `{eyebrow,subCopy,primaryCta:"start"|"demo",showHeroSignIn}` + `welcomeEyebrow(name)` + `HERO_COPY`
  (verbatim strings). Unit-tested (`hero-model.test.ts`, U1–U8) — this is how **signed-in (9a) is
  verified without real OAuth** (E2E can't sign in). `welcomeEyebrow(undefined)` → "WELCOME BACK ·
  READY WHEN YOU ARE" (no dangling comma).
- **D4 hydration:** `hero-lede.tsx` (client) is mount-gated — SSR + first client render = signed-out
  (8a/9b), swap to 9a only when `mounted && auth.isAuthenticated`. `hero.tsx` stays a Server
  Component (section shell + viewport-only trust row). Mirrors nav-auth's gate (+ same eslint-disable).
- **D1 one breakpoint = `md` (768).** Nav hamburger, hero desktop-vs-mobile CTA split, hero mobile
  sign-in, AND the 9b content/layout swaps all key off `md`. Moved featured-demo stacking lg→md
  (safe: E2E/desktop @1288 stays side-by-side since 1288>md). Viewport variants are CSS
  (`hidden md:block` / `md:hidden`) — no JS; dual-copy keeps BOTH strings in `textContent`.
- **New components:** `hero-lede.tsx` (client, mount-gated), `mobile-nav.tsx` (client hamburger +
  dismissible sheet — outside-pointerdown/Escape/a11y lifted from nav-auth), `nav-your-videos.tsx`
  (client, authed-only desktop link). `sign-in-button.tsx` variants are now **`nav`** (testid
  `signin-nav`) + **`heroMobile`** (testid `signin-hero-mobile`, full-width) — the old `hero` variant
  is GONE (desktop hero has no sign-in under 8a).
- **testids (E2E/Playwright seams):** `signin-nav`, `signin-hero-mobile`, `hero-eyebrow-desktop`,
  `hero-eyebrow-mobile`, `hero-demo`, `demo-preview`, `nav-hamburger`, `nav-sheet`.

## Favicon (7b) — Next 16 file conventions, SHIPPED
`app/icon.svg` (verbatim copy of the design project's `favicon.canonical.svg` — full-bleed 512
rounded-square gradient + white cross) → `<link rel="icon" type="image/svg+xml">`. `app/apple-icon.tsx`
(`next/og` `ImageResponse`, 180×180, same mark reproduced with divs, full-bleed no-radius so iOS masks
it) → `<link rel="apple-touch-icon">`. **Deleted `app/icon.jpg`** (the clipped photo = the Safari bug).
Kept `app/favicon.ico`. Verified emitted head links: favicon.ico (image/x-icon) + icon.svg
(image/svg+xml) + apple-icon (image/png), no jpeg. No `app/layout.tsx` change — conventions auto-wire.
