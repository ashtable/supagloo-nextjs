import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

import { glooLlmClient } from "../../lib/gloo/llm-client";

const BASE_URL = "http://localhost:3000";

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
 * Exact-copy anchors asserted against DOM text (not LLM output), because the
 * LLM normalizes punctuation/glyphs. Strings copied verbatim from the design
 * source `scratch/design/fig7a.raw.html` (em dash U+2014, en dash U+2013,
 * middot U+00B7). Step 9 must render these byte-for-byte.
 */
const EXACT_ANCHORS: readonly string[] = [
  // nav
  "Supagloo",
  "How it works",
  "Gallery",
  // eyebrow
  "SCRIPTURE VIDEO STUDIO · BUILT ON YOUVERSION",
  // headline (two lines)
  "TURN SCRIPTURE INTO",
  "CINEMATIC VIDEO.",
  // sub-copy
  "Pick a verse — Supagloo storyboards it, narrates it in the voice you describe, and scores it into a share-ready short. Sign in with your YouVersion account to begin.",
  // primary CTA
  "Sign in with YouVersion",
  // secondary CTA
  "▶ Watch the Genesis demo",
  // trust row
  "✦ 100% FREE",
  "No credit card · Bring your own Gloo AI & OpenRouter.ai keys — mix free & premium models",
  // featured-demo label
  "⚡ START IN ONE CLICK — NO BLANK PAGE",
  // demo poster
  "DEMO",
  "GENESIS 1:1–4 · KJV",
  // demo eyebrow + title
  "FEATURED STARTER SCRIPT",
  "GENESIS · LET THERE BE LIGHT",
  // demo description
  "The first four verses of creation — the Spirit of God moving over dark waters, then light bursting across the cosmos. Dramatic narration, breathtaking visuals, an austere orchestral score. Already storyboarded and ready to render.",
  // demo tags
  "🔊 Dramatic baritone",
  "🎬 Cosmic visuals",
  "🎻 Orchestral",
  "⏱ 0:32 · 4 scenes",
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
  await page.goto(BASE_URL, { waitUntil: "load" });
});

afterAll(async () => {
  await stagehand?.close(); // v3 teardown (verified: close(), not done())
});

describe("signed-out landing page (Figure 7a)", () => {
  test("renders the Supagloo landing shell (not the verse page)", async () => {
    // The 'Supagloo' wordmark is server-rendered; wait past the client mount-gate.
    await waitForText("Supagloo");
  });

  test("contains every exact-copy anchor verbatim (glyphs, middots, dashes)", async () => {
    const text = await bodyText();
    const missing = EXACT_ANCHORS.filter((anchor) => !text.includes(anchor));
    expect(
      missing,
      `Missing exact-copy anchors: ${JSON.stringify(missing, null, 2)}`,
    ).toEqual([]);
  });

  test("primary CTA is the real 'Sign in with YouVersion' control", async () => {
    // Semantic: the LLM should locate a sign-in affordance in the hero...
    const actions = await stagehand.observe(
      "the 'Sign in with YouVersion' sign-in button in the hero",
    );
    expect(actions.length).toBeGreaterThanOrEqual(1);
    // ...and it must be the bespoke hero control, tagged for the test seam.
    const heroCtaCount = await page
      .locator('[data-testid="signin-hero"]')
      .count();
    expect(heroCtaCount).toBeGreaterThanOrEqual(1);
  });

  test("hero copy matches the design (semantic extract)", async () => {
    const hero = await stagehand.extract(
      "Extract the hero section: the small uppercase eyebrow label above the big " +
        "headline, the big headline itself, the paragraph of sub-copy beneath it, the " +
        "primary call-to-action button label, and the secondary call-to-action label.",
      z.object({
        eyebrow: z.string(),
        headline: z.string(),
        subCopy: z.string(),
        primaryCta: z.string(),
        secondaryCta: z.string(),
      }),
    );
    expect(hero.eyebrow).toContain("SCRIPTURE VIDEO STUDIO");
    expect(hero.headline).toContain("TURN SCRIPTURE INTO");
    expect(hero.subCopy).toContain("Supagloo storyboards it");
    expect(hero.primaryCta).toContain("Sign in with YouVersion");
    expect(hero.secondaryCta).toContain("Watch the Genesis demo");
  });

  test("the three start cards read in order (semantic extract)", async () => {
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

  test("featured-demo band is present (semantic extract)", async () => {
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
