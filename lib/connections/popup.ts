/**
 * Opening a provider's OAuth tab, and reporting it honestly when the browser refuses.
 *
 * Two browser facts drive this module, and getting either wrong strands the user on a
 * "Connecting…" spinner that resolves only by timing out:
 *
 * 1. `window.open` signals a refused popup by RETURNING NULL, not by throwing. Code
 *    that only guards with try/catch treats a blocked popup as a successful open.
 * 2. A popup is permitted only under **transient user activation** — the synchronous
 *    continuation of the user's click. Any `await` in between spends it. Safari
 *    enforces this strictly; Chrome is laxer, so an awaited open can pass review and
 *    still fail for real users.
 *
 * Fact 2 is why {@link openBlankTab} exists separately from navigation: a PKCE
 * `code_challenge` needs `crypto.subtle.digest`, so the authorize URL is not known at
 * click time. Claim the tab under the activation first, compute, then point the tab at
 * the URL with {@link navigateTab}.
 */

/** What a caller may pass instead of `window.open` (tests, SSR guards). */
export type TabOpener = (url: string, target?: string) => unknown;

/**
 * The slice of `Window` this module needs. Narrower than the DOM `Window` so a test can
 * stand one up without a browser, and so nothing here can accidentally reach for a
 * capability a cross-origin popup handle would not actually grant.
 */
export type NavigableTab = { location: { href: string } };

/** User-facing copy for a refused popup. Deliberately says what to DO — the previous
 *  behaviour said nothing at all and looked like the product was broken. */
export const POPUP_BLOCKED_MESSAGE =
  "Your browser blocked the sign-in tab. Allow pop-ups for this site, then try again.";

function isNavigable(handle: unknown): handle is NavigableTab {
  return (
    typeof handle === "object" &&
    handle !== null &&
    "location" in handle &&
    typeof (handle as NavigableTab).location === "object" &&
    (handle as NavigableTab).location !== null
  );
}

/**
 * Claim a blank tab under the caller's user activation. MUST be called synchronously
 * from the click handler — see fact 2 above.
 *
 * Returns null when the browser refused, when there is no `window` (SSR), or when the
 * handle is not navigable. Null is the caller's cue to surface
 * {@link POPUP_BLOCKED_MESSAGE} and NOT to begin polling: with no tab there is no
 * callback coming, so a poll can only expire.
 */
export function openBlankTab(open?: TabOpener): NavigableTab | null {
  const opener =
    open ?? (typeof window !== "undefined" ? window.open.bind(window) : undefined);
  if (!opener) return null;
  try {
    const handle = opener("", "_blank");
    return isNavigable(handle) ? handle : null;
  } catch {
    return null;
  }
}

/**
 * Point an already-claimed tab at `url`. Returns false if the assignment was refused,
 * which the caller must treat exactly like a refused open — the tab is blank, so no
 * callback will ever arrive from it.
 */
export function navigateTab(tab: NavigableTab, url: string): boolean {
  try {
    tab.location.href = url;
    return true;
  } catch {
    return false;
  }
}
