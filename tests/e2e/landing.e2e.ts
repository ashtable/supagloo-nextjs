import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

import { glooLlmClient } from "../../lib/gloo/llm-client";
import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";

const BASE_URL = "http://localhost:3000";

// The default LOCAL viewport (chrome-launcher's default window) is ~1288×711 —
// below the 1320px pixel-lock but above md(768)/lg(1024), i.e. the desktop CTA
// layout. The mobile describe overrides this to 390×844 and restores it.
const DESKTOP = { width: 1288, height: 711 };
const MOBILE = { width: 390, height: 844 };

let stagehand: Stagehand;
let page: StagehandPage;

// The shared `evaluate`-based helpers, now lifted into `tests/e2e/helpers.ts`
// and imported by both this (regression control) suite and the Turn 10/11
// workspace/onboarding suites. Bound in `beforeAll` once `page` exists, so every
// call site below reads exactly as it did when these were inlined here.
let bodyText: E2EHelpers["bodyText"];
let waitForText: E2EHelpers["waitForText"];
let isVisibleByTestId: E2EHelpers["isVisibleByTestId"];
let widthByTestId: E2EHelpers["widthByTestId"];
let textIsVisible: E2EHelpers["textIsVisible"];
let waitForGone: E2EHelpers["waitForGone"];

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
  ({
    bodyText,
    waitForText,
    isVisibleByTestId,
    widthByTestId,
    textIsVisible,
    waitForGone,
  } = makeHelpers(page));
  await page.setViewportSize(DESKTOP.width, DESKTOP.height); // pin the desktop state
  await page.goto(BASE_URL, { waitUntil: "load" });
  await waitForText("Supagloo");
  // Wait past the NavAuth mount-gate: the nav sign-in control (and every other
  // auth-dependent leaf) renders null until its client `useEffect` fires, which
  // happens after hydration — later than the server-rendered "Supagloo" wordmark.
  // Asserting before this races the gate and finds 0 controls (the B failure).
  await page.waitForSelector('[data-testid="signin-nav"]', {
    state: "visible",
    timeout: 20_000,
  });
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

  test("C: hero primary CTA is 'Watch the Genesis demo', not sign-in (semantic extract)", async () => {
    // The genuinely-semantic claim for 8a: an LLM looking at the hero identifies
    // the DEMO button (not sign-in) as the primary call-to-action. The eyebrow /
    // headline / sub-copy are covered deterministically by anchor test A, so we
    // don't add flaky LLM fields for them (a 4-field extract intermittently
    // returned an empty eyebrow). One focused field keeps the guarantee robust.
    const { primaryCta } = await stagehand.extract(
      "In the hero section at the top of the page (the one with the huge headline " +
        "'TURN SCRIPTURE INTO CINEMATIC VIDEO.'), extract the text label of the " +
        "primary call-to-action button — the large solid/gradient-filled button " +
        "directly beneath the sub-copy paragraph.",
      z.object({ primaryCta: z.string() }),
    );
    // Under 8a the hero's primary CTA is the gradient demo — sign-in moved to the nav.
    expect(primaryCta).toContain("Watch the Genesis demo");
    expect(primaryCta).not.toContain("Sign in with YouVersion");
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
    // The sheet unmounts, so assert it's GONE (not `state:"hidden"`, which never
    // resolves for a detached node).
    await page.evaluate(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    await waitForGone("nav-sheet");

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
    await waitForGone("nav-sheet");
  });
});
