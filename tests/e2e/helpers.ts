import type { Stagehand } from "@browserbasehq/stagehand";

/**
 * Shared Stagehand v3 E2E helpers.
 *
 * These are the reusable `evaluate`-based helpers that were inlined in
 * `landing.e2e.ts`, lifted here VERBATIM (same bodies, now closing over the
 * `page` passed to `makeHelpers`) so the landing suite and the Turn 10/11
 * workspace/onboarding suites share one implementation. The landing suite is the
 * regression control: extracting these must not change its behavior.
 *
 * The Stagehand v3 understudy `Page` has no Playwright-style
 * `getByText`/`innerText`/`locator().waitFor()`; it exposes `evaluate`,
 * `locator`, `goto`, `waitForSelector`, `waitForTimeout`. Everything below is
 * built on `evaluate` + polling.
 */

export type StagehandPage = ReturnType<Stagehand["context"]["pages"]>[number];

export interface E2EHelpers {
  bodyText(): Promise<string>;
  waitForText(needle: string, timeoutMs?: number): Promise<void>;
  isVisibleByTestId(testid: string): Promise<boolean>;
  widthByTestId(testid: string): Promise<number>;
  textIsVisible(label: string): Promise<boolean>;
  waitForGone(testid: string, timeoutMs?: number): Promise<void>;
}

export function makeHelpers(page: StagehandPage): E2EHelpers {
  /**
   * Read the page's visible text. The Stagehand v3 understudy `Page` has no
   * Playwright-style `getByText`/`innerText`; it exposes `evaluate`, `locator`,
   * `goto`, `waitForSelector`. We read via `evaluate`.
   *
   * We clone `<body>`, strip `<script>/<style>/<noscript>/<template>`, then read
   * `textContent`:
   *  - Stripping scripts excludes Next.js's inline RSC/flight JSON, which embeds
   *    metadata (e.g. the "Supagloo" title) that would otherwise cause false
   *    positives against real page copy.
   *  - `textContent` (vs `innerText`) returns SOURCE text, so exact-copy anchors —
   *    middots `·`, en/em dashes, and buttons whose CSS `text-transform:uppercase`
   *    would alter `innerText` — match verbatim.
   *
   * NOTE: `textContent` includes `display:none` nodes, so under dual-copy BOTH
   * the desktop and mobile-short strings are present at every viewport. Use
   * `bodyText()` for exact-copy PRESENCE anchors only; prove a SWAP (shown /
   * hidden) with `isVisibleByTestId` / `textIsVisible` below.
   */
  async function bodyText(): Promise<string> {
    return page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll("script, style, noscript, template")
        .forEach((el) => el.remove());
      return clone.textContent ?? "";
    });
  }

  /**
   * Poll until the rendered text contains `needle`, else throw. Replaces the
   * plan's `getByText(...).waitFor()`, which the v3 understudy page does not
   * expose. Used to wait past the client mount-gate (the server-rendered
   * wordmark appears as soon as the correct page renders).
   */
  async function waitForText(needle: string, timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let seen = "";
    while (Date.now() < deadline) {
      seen = await bodyText();
      if (seen.includes(needle)) return;
      await page.waitForTimeout(500);
    }
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for page text to include ` +
        `${JSON.stringify(needle)}. First 300 chars seen: ` +
        `${JSON.stringify(seen.slice(0, 300))}`,
    );
  }

  /**
   * Is the element carrying `data-testid={testid}` actually rendered on screen?
   * Deterministic (no LLM): fails for a missing element, a `display:none` /
   * `visibility:hidden` element, or one collapsed to a zero box (e.g. an ancestor
   * hidden by a `md:hidden` / `hidden md:*` responsive class). This is how we
   * assert the auth/viewport SWAPS, since `textContent` can't tell shown from
   * hidden under dual-copy.
   */
  async function isVisibleByTestId(testid: string): Promise<boolean> {
    return page.evaluate((id) => {
      const vis = (el: HTMLElement) => {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      // ANY matching element visible — with dual-copy there can be >1 element per
      // testid; a first-match-only check could report the hidden desktop/mobile
      // copy and miss the visible one (the F1 fix).
      return Array.from(
        document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
      ).some(vis);
    }, testid);
  }

  /**
   * Bounding-rect width of the first VISIBLE element carrying `testid` (falls
   * back to the first match, else 0). Prefers the visible copy under dual-copy.
   */
  async function widthByTestId(testid: string): Promise<number> {
    return page.evaluate((id) => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
      );
      const visible = els.find((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const el = visible ?? els[0];
      return el ? el.getBoundingClientRect().width : 0;
    }, testid);
  }

  /**
   * Is there a VISIBLE element whose trimmed textContent exactly equals `label`?
   * Lets us probe visibility without a testid. Iterates ALL matches and returns
   * true iff any is visible — a control can exist in both a hidden desktop copy
   * and a visible mobile copy under dual-copy (the F1 fix).
   */
  async function textIsVisible(label: string): Promise<boolean> {
    return page.evaluate((needle) => {
      const vis = (el: HTMLElement) => {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      return Array.from(
        document.querySelectorAll<HTMLElement>("button, a, span, div"),
      ).some((e) => (e.textContent ?? "").trim() === needle && vis(e));
    }, label);
  }

  /**
   * Poll until no element carries `testid`, else throw. Conditionally rendered
   * UI (`{open && …}`, e.g. the mobile sheet / the wizard overlay / a modal on
   * close) DETACHES rather than going `display:none`; the understudy's
   * `waitForSelector(state:"hidden")` waits for an attached-but-hidden node and
   * never resolves for a removed one. Asserting the node is GONE is the
   * equivalent "closed" guarantee.
   */
  async function waitForGone(testid: string, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await page.locator(`[data-testid="${testid}"]`).count()) === 0)
        return;
      await page.waitForTimeout(100);
    }
    throw new Error(
      `[data-testid="${testid}"] still present after ${timeoutMs}ms (expected gone)`,
    );
  }

  return {
    bodyText,
    waitForText,
    isVisibleByTestId,
    widthByTestId,
    textIsVisible,
    waitForGone,
  };
}
