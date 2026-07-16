---
name: landing-responsive
description: How the Figure-7a landing reflows (R2) and how the nav-auth dropdown dismiss/a11y works (R1)
metadata:
  type: decision
---

Figure 7a is a **FIXED 1320px desktop mock**. Shipped Step 15 (2026-07-15, R1+R2) makes it responsive
WITHOUT regressing the ≥1320px rendering. Stack: Next 16, React 19, **Tailwind v4** (CSS-first via
`@tailwindcss/postcss`, NO `tailwind.config`; default breakpoints sm=640/md=768/lg=1024/xl=1280, and
arbitrary `min-[1320px]:` variants work). The page wrapper is `mx-auto w-full max-w-[1320px]`, so
viewport ≥1320 == the pixel-locked desktop state.

## R2 — responsive layout (verified no horizontal overflow 360→1440; `scrollWidth==innerWidth` at every step)

Heavy **inline styles** here can't be overridden by media-query classes (inline wins), so responsive props
were moved from `style` to className, or done with `clamp()`:
- **hero.tsx**: headline `fontSize: "clamp(2rem, 8vw, 74px)"` (74px from ~925px up → ≥1320 faithful) +
  `break-words` safety; CTA row `flex` → `flex flex-wrap justify-center`; section `px-12` → `px-6 sm:px-12`.
- **featured-demo.tsx**: container `flex` → `flex flex-col lg:flex-row`; poster lost inline `width:462,
  flex:none`, now `w-full h-[240px] lg:w-[462px] lg:h-auto lg:flex-none` (stacked full-width poster below
  lg, since its children are absolutely positioned it needs an explicit height); button row `flex flex-wrap`.
  **Why `lg` (1024) not `min-[1320px]`:** the E2E renders at **1288px** (see [[test-harness]]) — stacking
  there flipped the flaky semantic extract; side-by-side from 1024 matches the stable baseline geometry AND
  looks better than a giant stacked poster on tablets, while ≥1320 stays identical.
- **start-cards.tsx**: row `flex` → `flex flex-wrap`; each card `flex:1` → `flex:"1 1 240px"` (3-up at
  desktop, reflows 3→2→1; `1 1 240px` grows to the same width as `flex:1` at 1320 → pixel-identical).
- **nav.tsx**: `flex flex-wrap items-center min-h-[70px] px-4 sm:px-[34px] py-2 sm:py-0`; the two links
  ("How it works"/"Gallery") wrapped in a `hidden md:flex` subgroup (their text stays in the DOM → exact
  anchors safe); spacer `hidden sm:block flex-1`; right group `ml-auto`. At ≤~388px the auth pill wraps to
  its own row (no overflow). min-h-[70px] renders as exactly 70px at desktop (content < 70).
- **footer.tsx**: `flex flex-wrap items-center px-4 sm:px-[34px] py-3 sm:py-0 min-h-[58px]`; spacer
  `hidden sm:block flex-1`.
- **page.tsx / globals.css: untouched** — no `overflow-x-hidden` band-aid (it would mask real overflow and
  defeat the `scrollWidth<=innerWidth` check); every overflow source was fixed at the source instead.

Restore-at-`sm`/`md`/`lg` (mobile-first) keeps ≥1320 pixel-faithful because the desktop values are the
restored ones. Verify overflow via headless Chrome over CDP (`chrome-launcher` + `ws`, both installed) —
set `Emulation.setDeviceMetricsOverride`, read `document.documentElement.scrollWidth` vs `innerWidth`.

## R1 — nav-auth dropdown dismiss + menu a11y (app/_components/nav-auth.tsx)

Signed-in profile dropdown now closes on **outside pointerdown** and **Escape** (Escape returns focus to
the trigger). Implemented with `triggerRef`/`panelRef` + a `useEffect([open])` that adds document
`pointerdown`+`keydown` listeners only while open and tears them down on close/unmount — **no new dependency**.
Both listener-effect and refs sit BEFORE the `!mounted` / `!isAuthenticated` early returns (Rules of Hooks);
they're inert when signed-out (open stays false). Trigger got `aria-haspopup="menu"`, `aria-expanded={open}`,
and `aria-label={name ? undefined : "Account menu"}` (fallback name only when the visible name is absent);
panel got `role="menu"`; the three items got `role="menuitem"`. All visible text, the mount-gate, `initials()`
avatar/monogram, and `signOut()` behavior unchanged. Signed-out E2E doesn't exercise this branch (see
[[auth-integration]]).
