---
name: auth-integration
description: YouVersion auth wiring, the useYVAuth surface, and the global-header removal decision
metadata:
  type: reference
---

Auth is fully in place — reuse, don't reinvent. `app/providers.tsx` wraps children in
`YouVersionProvider` (`includeAuth`, `theme="system"`, `authRedirectUrl` = env or `window.origin`).
`app/auth-button.tsx` is the canonical **mount-gate** leaf (`useEffect(setMounted)`, return `null`
until mounted) to avoid SSR/client hydration mismatch on client-only auth + system theme.

**API surface (verified from `@youversion/*` .d.ts):**
- `useYVAuth()` → `{ auth, signIn, signOut, processCallback, userInfo, redirectUri }`.
- `auth`: `{ isAuthenticated, isLoading, accessToken, result, error }` (all readonly).
- `signIn(params?: { redirectUrl?; scopes?: ('profile'|'email')[] })` — this is exactly what
  `YouVersionAuthButton` calls internally, so building bespoke controls on `signIn`/`signOut` is NOT
  "reinventing auth".
- `userInfo`: `name?`, **`userId?` (NOT `id`)**, `email?`, and `avatarUrl` getter (`URL | null`,
  `.toString()` for `<img src>`) / `getAvatarUrl(w,h)`. There is **no plain avatar string field**.
- `YouVersionAuthButton` props: `mode:'signIn'|'signOut'|'auto'`, `scopes`, `background`, `radius`,
  `size`, `variant`, `text`; extends `ButtonHTMLAttributes` (so it accepts `className`/`style`).
  It renders only a button — it **cannot** render a profile pill + dropdown.

**Decision (Turn 7 landing):** the global `<header><AuthButton/></header>` in `app/layout.tsx` is
**removed** — the bespoke landing nav owns the auth control (only one route exists, so no double
control / no route-group needed). Bespoke controls are built on `useYVAuth()` directly (signed-out
pill → `signIn({scopes:["profile","email"]})`; signed-in profile pill + dropdown → `signOut()`),
because the stock button can't produce the pill/dropdown. Mount-gate the control that differs by auth
state; a pure sign-in trigger that renders identically both states needs no gate.
**Why:** matches the pixel design, keeps native OAuth, one auth control.
Tested seam: see [[test-harness]] (E2E covers signed-out only; signed-in via `initials()` unit test).

**Step 9 SHIPPED (2026-07-15).** `app/auth-button.tsx` DELETED. Bespoke controls now live in:
- `app/_components/sign-in-button.tsx` (client) — gradient "Sign in with YouVersion" pill,
  `variant:"hero"|"nav"`, sets `data-testid={"signin-"+variant}` (hero instance = the test seam
  `data-testid="signin-hero"`), `onClick`→`useYVAuth().signIn({scopes:["profile","email"]})`. **No
  mount-gate** (identical markup both auth states → no hydration mismatch).
- `app/_components/nav-auth.tsx` (client) — **mount-gated** (null until mounted, same reason as the old
  auth-button). Signed-out → `<SignInButton variant="nav"/>`; signed-in → profile pill (avatar =
  `userInfo.avatarUrl?.toString()` else `initials(userInfo?.name)` monogram + name + ▾) toggling a
  dropdown (name, email ellipsized, inert "Your videos"/"Account settings", real "Sign out of
  YouVersion" → `signOut()`).
Verified live against installed .d.ts: `useYVAuth()`→`{auth,signIn,signOut,processCallback,userInfo,
redirectUri}`; `auth.isAuthenticated:boolean`; `userInfo:YouVersionUserInfo|null` with `name?`,
`userId?`, `email?`, `avatarUrlFormat?`, `getAvatarUrl(w?,h?)`, `get avatarUrl():URL|null` (so
`userInfo?.avatarUrl?.toString()` is `string|undefined`); `signIn(params?)`, `signOut():void`.
The mount-gate effect now needs `// eslint-disable-next-line react-hooks/set-state-in-effect` (see
[[test-harness]]).
