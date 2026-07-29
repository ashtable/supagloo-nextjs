/**
 * Feature 7 — the sign-in exchange's token decision, extracted so it can be tested.
 *
 * ## The bug
 *
 * `SessionProvider` gates the `POST /api/auth/session` exchange on
 * `yv.auth.isAuthenticated && accessToken`. In the vendored SDK
 * (`@youversion/platform-react-hooks/src/useYVAuth.ts`) the token is
 *
 * ```ts
 * const authTokens = useMemo(() => {
 *   if (typeof window !== 'undefined') {
 *     return { accessToken: YouVersionPlatformConfiguration.accessToken };
 *   }
 *   return { accessToken: null };
 * }, []);
 * ```
 *
 * — `useMemo(…, [])`, computed ONCE on first render and never recomputed, over
 * `localStorage.getItem('accessToken')`.
 *
 * On the OAuth **callback** load the provider starts `userInfo = null` and only writes
 * the token inside an async `initAuth` effect (`handleAuthCallback()`). So first render
 * memoizes `accessToken = null` PERMANENTLY; `handleAuthCallback` then sets `userInfo`,
 * which flips `isAuthenticated` true — but the token is still the frozen `null`. The
 * gate is false, control falls through to the bare `GET /api/me` probe, no cookie exists
 * (logout deleted it), and `serverUser` stays null for the whole load.
 *
 * That is the entire "all three connections read Not linked and the grid is empty until
 * you reload twice" report: the connections effect early-returns on `!serverUser`, and
 * `GET /api/projects` 401s.
 *
 * ## The fix
 *
 * `isAuthenticated` is `!!userInfo`, and `userInfo` is only set once
 * `handleAuthCallback()` has RESOLVED — which is after the token has been written to
 * storage. So the moment the gate's first half becomes true, the token is readable; only
 * the memo is stale. Re-read it from the SDK's own accessor at that point.
 *
 * Kept pure and injectable because the alternative — asserting this against a real
 * vendored provider — would pin the SDK's internals rather than our decision.
 */
export interface ResolveExchangeTokenArgs {
  /** `yv.auth.isAuthenticated` — `!!userInfo`, and the only trustworthy half. */
  isAuthenticated: boolean;
  /** `yv.auth.accessToken` — correct on a warm load, frozen `null` on the callback load. */
  memoizedToken: string | null | undefined;
  /** The SDK's live accessor over `localStorage`. May throw (disabled storage / SSR). */
  readStoredToken: () => string | null | undefined;
}

/**
 * The access token to exchange, or `null` when there is nothing to exchange.
 *
 * The stored read is the FALLBACK, not the primary: on a warm load the memo is already
 * correct, and preferring storage would add a synchronous `localStorage` hit to every
 * render pass of every page for no gain.
 */
export function resolveExchangeToken(args: ResolveExchangeTokenArgs): string | null {
  // Not signed in with YouVersion ⇒ nothing to exchange, whatever is in storage. A
  // leftover token from a previous session must NOT resurrect a signed-out visitor.
  if (!args.isAuthenticated) return null;

  if (typeof args.memoizedToken === "string" && args.memoizedToken.length > 0) {
    return args.memoizedToken;
  }

  try {
    const stored = args.readStoredToken();
    return typeof stored === "string" && stored.length > 0 ? stored : null;
  } catch {
    // Storage disabled (Safari private mode, a hardened browser). Degrading to the probe
    // is the same outcome as before this fix — never a thrown render.
    return null;
  }
}
