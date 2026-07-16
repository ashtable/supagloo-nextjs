import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

import { glooLlmClient } from "../../lib/gloo/llm-client";

const BASE_URL = "http://localhost:3000";

// The default LOCAL viewport (chrome-launcher's default window) is ~1288×711 —
// below the 1320px pixel-lock but above md(768)/lg(1024), i.e. the desktop CTA
// layout. The mobile describe overrides this to 390×844 and restores it.
const DESKTOP = { width: 1288, height: 711 };
const MOBILE = { width: 390, height: 844 };

type StagehandPage = ReturnType<Stagehand["context"]["pages"]>[number];

let stagehand: Stagehand;
let page: StagehandPage;

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
 *    middots `·`, en/em dashes, and the "Start from this demo" button whose CSS
 *    `text-transform:uppercase` would alter `innerText` — match verbatim.
 *
 * NOTE: `textContent` includes `display:none` nodes, so under D2-a dual-copy
 * BOTH the desktop and mobile-short strings are present at every viewport. Use
 * `bodyText()` for exact-copy PRESENCE anchors only; prove a mobile SWAP
 * (short shown / long hidden) with `isVisibleByTestId` / `textIsVisible` below.
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
 * expose. Used to wait past the client mount-gate (the "Supagloo" wordmark is
 * server-rendered, so it appears as soon as the correct page renders).
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
 * Bounding-rect width of the first VISIBLE element carrying `testid` (falls back
 * to the first match, else 0). Prefers the visible copy under dual-copy.
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
 * Lets us probe visibility without a testid (e.g. the "Preview scenes ▸" button,
 * which the mock drops on mobile). Iterates ALL matches and returns true iff any
 * is visible — a control can exist in both a hidden desktop copy and a visible
 * mobile copy under dual-copy (the F1 fix).
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

async function innerWidth(): Promise<number> {
  return page.evaluate(() => window.innerWidth);
}

/**
 * Exact-copy anchors asserted against DOM text (not LLM output), because the
 * LLM normalizes punctuation/glyphs. Strings copied verbatim from the wireframe
 * (em dash U+2014, en dash U+2013, middot U+00B7, fullwidth glyphs). Under D2-a
 * the mobile-short variants are added to the DOM too, so they appear here.
 */
const EXACT_ANCHORS: readonly string[] = [
  // nav
  "Supagloo",
  "How it works",
  "Gallery",
  // eyebrow (desktop 8a; "SCRIPTURE VIDEO STUDIO" mobile-short is a substring)
  "SCRIPTURE VIDEO STUDIO · BUILT ON YOUVERSION",
  // headline (two lines)
  "TURN SCRIPTURE INTO",
  "CINEMATIC VIDEO.",
  // sub-copy — signed-out desktop (with the sign-in sentence)
  "Pick a verse — Supagloo storyboards it, narrates it in the voice you describe, and scores it into a share-ready short. Sign in with your YouVersion account to begin.",
  // sub-copy — mobile-short (D2-a; NOT a substring of the desktop copy)
  "Pick a verse — Supagloo storyboards, narrates & scores it into a share-ready short.",
  // sign-in — now the NAV control (desktop) + the mobile hero primary; no longer
  // the desktop hero primary (that becomes the gradient demo CTA under 8a).
  "Sign in with YouVersion",
  // demo CTA
  "▶ Watch the Genesis demo",
  // trust row (mobile-short note is a prefix substring of the full note)
  "✦ 100% FREE",
  "No credit card · Bring your own Gloo AI & OpenRouter.ai keys — mix free & premium models",
  // featured-demo label (mobile-short "⚡ START IN ONE CLICK" is a substring)
  "⚡ START IN ONE CLICK — NO BLANK PAGE",
  // demo poster
  "DEMO",
  "GENESIS 1:1–4 · KJV",
  // demo eyebrow + title
  "FEATURED STARTER SCRIPT",
  "GENESIS · LET THERE BE LIGHT",
  // demo description — desktop
  "The first four verses of creation — the Spirit of God moving over dark waters, then light bursting across the cosmos. Dramatic narration, breathtaking visuals, an austere orchestral score. Already storyboarded and ready to render.",
  // demo description — mobile-short (D2-a; NOT a substring of the desktop copy)
  "The first four verses of creation — already storyboarded and ready to render.",
  // demo tags — desktop
  "🔊 Dramatic baritone",
  "🎬 Cosmic visuals",
  "🎻 Orchestral",
  "⏱ 0:32 · 4 scenes",
  // demo tags — mobile-short (D2-a; "🎬 Cosmic"/"⏱ 0:32" are substrings, "🔊 Baritone" is not)
  "🔊 Baritone",
  // demo buttons
  "▶ Start from this demo",
  "Preview scenes ▸",
  // start-cards
  "OR START YOUR OWN",
  "Verse of the Day",
  "Today's YouVersion verse, auto-loaded.",
  "From a passage",
  "Pick any book, chapter & verses.",
  "Blank canvas",
  "Build the flow from scratch.",
  // footer
  "© 2026 Supagloo",
  "Built on the YouVersion Platform",
];

beforeAll(async () => {
  stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient: await glooLlmClient(), // Gloo OAuth token obtained here
  });
  await stagehand.init(); // launches a local Chromium
  page = stagehand.context.pages()[0];
  await page.setViewportSize(DESKTOP.width, DESKTOP.height); // pin the desktop state
  await page.goto(BASE_URL, { waitUntil: "load" });
  await waitForText("Supagloo");
});

afterAll(async () => {
  await stagehand?.close(); // v3 teardown (verified: close(), not done())
});

describe("signed-out landing page — desktop (8a)", () => {
  test("F: renders the Supagloo landing shell (not the verse page)", async () => {
    // The 'Supagloo' wordmark is server-rendered; wait past the client mount-gate.
    await waitForText("Supagloo");
  });

  test("A: contains every exact-copy anchor verbatim (glyphs, middots, dashes)", async () => {
    const text = await bodyText();
    const missing = EXACT_ANCHORS.filter((anchor) => !text.includes(anchor));
    expect(
      missing,
      `Missing exact-copy anchors: ${JSON.stringify(missing, null, 2)}`,
    ).toEqual([]);
  });

  test("B: sign-in lives in the nav on desktop — the hero has none (8a)", async () => {
    // The bespoke nav sign-in control is present and visible on desktop...
    const navCount = await page.locator('[data-testid="signin-nav"]').count();
    expect(navCount).toBeGreaterThanOrEqual(1);
    expect(await isVisibleByTestId("signin-nav")).toBe(true);

    // ...and the OLD desktop hero sign-in seam (`signin-hero`) is gone: under 8a
    // the desktop hero shows only the gradient demo CTA (sign-in re-appears in
    // the hero only on mobile 9b, as `signin-hero-mobile`).
    expect(await isVisibleByTestId("signin-hero")).toBe(false);
    // The mobile hero sign-in must NOT be visible at desktop width.
    expect(await isVisibleByTestId("signin-hero-mobile")).toBe(false);
  });

  test("C: hero primary CTA is the gradient demo, not sign-in (semantic extract)", async () => {
    const hero = await stagehand.extract(
      "Extract the hero section: the small uppercase eyebrow label above the big " +
        "headline, the big headline itself, the paragraph of sub-copy beneath it, and " +
        "the primary call-to-action button label.",
      z.object({
        eyebrow: z.string(),
        headline: z.string(),
        subCopy: z.string(),
        primaryCta: z.string(),
      }),
    );
    expect(hero.eyebrow).toContain("SCRIPTURE VIDEO STUDIO");
    expect(hero.headline).toContain("TURN SCRIPTURE INTO");
    expect(hero.subCopy).toContain("Supagloo storyboards it");
    // Under 8a the hero's sole/primary CTA is the gradient "Watch the Genesis
    // demo" — sign-in has moved to the nav.
    expect(hero.primaryCta).toContain("Watch the Genesis demo");
    expect(hero.primaryCta).not.toContain("Sign in with YouVersion");
  });

  test("D: the three start cards read in order (semantic extract)", async () => {
    const { startCards } = await stagehand.extract(
      "Extract the titles of the three 'start your own' option cards, in the order " +
        "they appear left to right.",
      z.object({ startCards: z.array(z.string()) }),
    );
    expect(startCards).toEqual([
      "Verse of the Day",
      "From a passage",
      "Blank canvas",
    ]);
  });

  test("E: featured-demo band is present (semantic extract)", async () => {
    const demo = await stagehand.extract(
      "Extract the featured demo band: the small label above the demo card, and the " +
        "demo's title.",
      z.object({ demoLabel: z.string(), demoTitle: z.string() }),
    );
    expect(demo.demoLabel).toContain("START IN ONE CLICK");
    expect(demo.demoTitle).toContain("GENESIS");
    expect(demo.demoTitle).toContain("LET THERE BE LIGHT");
  });
});

describe("favicon wiring (7b)", () => {
  test("H: head declares an SVG icon + apple-touch-icon and no legacy .jpg icon", async () => {
    const icons = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          'link[rel~="icon"], link[rel="apple-touch-icon"]',
        ),
      ).map((l) => ({
        rel: l.getAttribute("rel") ?? "",
        href: l.getAttribute("href") ?? "",
        type: l.getAttribute("type") ?? "",
      })),
    );

    // A full-bleed SVG icon (this is the Safari-clip fix).
    const hasSvgIcon = icons.some(
      (i) =>
        i.rel.includes("icon") &&
        (i.type.includes("svg") || i.href.includes(".svg")),
    );
    expect(hasSvgIcon, `icon links: ${JSON.stringify(icons)}`).toBe(true);

    // An apple-touch-icon for iOS home screens.
    const hasAppleIcon = icons.some((i) => i.rel === "apple-touch-icon");
    expect(hasAppleIcon, `icon links: ${JSON.stringify(icons)}`).toBe(true);

    // The clipped `app/icon.jpg` (image/jpeg) must be gone.
    const hasJpegIcon = icons.some(
      (i) => i.type.includes("jpeg") || i.href.includes(".jpg"),
    );
    expect(hasJpegIcon, `icon links: ${JSON.stringify(icons)}`).toBe(false);
  });
});

// Placed LAST: this block overrides the viewport to mobile and restores desktop
// in afterAll, so no later test inherits the 390px override.
describe("signed-out landing page — mobile (9b)", () => {
  beforeAll(async () => {
    await page.setViewportSize(MOBILE.width, MOBILE.height);
    await page.waitForTimeout(600); // let media queries re-evaluate / reflow settle
  });

  afterAll(async () => {
    await page.setViewportSize(DESKTOP.width, DESKTOP.height);
    await page.waitForTimeout(300);
  });

  test("I: nav collapses to a hamburger (desktop auth pill hidden)", async () => {
    expect(await isVisibleByTestId("nav-hamburger")).toBe(true);
    // The nav's desktop sign-in pill must not be visible at mobile width.
    expect(await isVisibleByTestId("signin-nav")).toBe(false);
  });

  test("J: hero surfaces a full-width 'Sign in with YouVersion' primary", async () => {
    expect(await isVisibleByTestId("signin-hero-mobile")).toBe(true);
    const w = await widthByTestId("signin-hero-mobile");
    const vw = await innerWidth();
    // Full-width pill: at least 80% of the viewport width.
    expect(w, `sign-in width=${w} viewport=${vw}`).toBeGreaterThan(vw * 0.8);
    // The demo CTA remains available (outline secondary below the sign-in).
    expect(await textIsVisible("▶ Watch the Genesis demo")).toBe(true);
  });

  test("K: hero uses the shortened mobile eyebrow (desktop eyebrow hidden)", async () => {
    expect(await isVisibleByTestId("hero-eyebrow-mobile")).toBe(true);
    expect(await isVisibleByTestId("hero-eyebrow-desktop")).toBe(false);
  });

  test("L: featured demo drops 'Preview scenes ▸' on mobile (one-button layout)", async () => {
    // The mock shows a single full-width "Start from this demo" and no preview.
    expect(await textIsVisible("Preview scenes ▸")).toBe(false);
    expect(await textIsVisible("▶ Start from this demo")).toBe(true);
  });

  test("M: no horizontal overflow at 390px (regression guard)", async () => {
    const { scrollW, innerW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    }));
    expect(
      scrollW,
      `scrollWidth=${scrollW} innerWidth=${innerW}`,
    ).toBeLessThanOrEqual(innerW);
  });

  test("N: hamburger opens a sheet; menu actions and Escape dismiss it", async () => {
    // RED cleanly (assertion, not a locator throw) while no hamburger exists.
    expect(
      await page.locator('[data-testid="nav-hamburger"]').count(),
    ).toBeGreaterThan(0);

    await page.locator('[data-testid="nav-hamburger"]').click();
    await page.waitForSelector('[data-testid="nav-sheet"]', {
      state: "visible",
      timeout: 5000,
    });
    const sheetText =
      (await page.locator('[data-testid="nav-sheet"]').textContent()) ?? "";
    expect(sheetText).toContain("How it works");
    expect(sheetText).toContain("Gallery");
    expect(sheetText).toContain("Sign in with YouVersion");
    // The sheet's sign-in is a DISTINCT seam from the desktop nav pill (F2): the
    // sheet control is `signin-sheet`; the desktop `signin-nav` stays hidden.
    expect(await isVisibleByTestId("signin-sheet")).toBe(true);
    expect(await isVisibleByTestId("signin-nav")).toBe(false);

    // Escape dismisses (the sheet listens on document keydown, like nav-auth).
    await page.evaluate(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    await page.waitForSelector('[data-testid="nav-sheet"]', {
      state: "hidden",
      timeout: 5000,
    });

    // F3: tapping an inert menu item ("How it works") also closes the sheet.
    await page.locator('[data-testid="nav-hamburger"]').click();
    await page.waitForSelector('[data-testid="nav-sheet"]', {
      state: "visible",
      timeout: 5000,
    });
    await page
      .locator('[data-testid="nav-sheet"] [role="menuitem"]')
      .first()
      .click();
    await page.waitForSelector('[data-testid="nav-sheet"]', {
      state: "hidden",
      timeout: 5000,
    });
  });
});
