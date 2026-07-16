import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

/**
 * Turn 5 / Fig 5a "Wilderness Studio" editor E2E.
 *
 * DELIBERATELY Gloo-free: constructed with NO `llmClient`, so `init/goto/
 * evaluate/locator/setViewportSize` all work even while Gloo OAuth is degraded
 * (see memory `test-harness`). Every check here is deterministic — copy anchors,
 * `data-testid`/`data-*` seams, computed styles, bounding rects — so no
 * `extract`/`observe` (the LLM path) is used or needed. The canvas-free Remotion
 * Player renders real DOM, so we assert it MOUNTS (`.__remotion-player`) rather
 * than pixel-inspecting frames.
 *
 * Reuses `tests/e2e/global-setup.ts` (boots/reuses `next dev` on :3000).
 *
 * STEP 7 STATUS: RED by construction — `/studio` does not exist yet (Next serves
 * a 404), so `studio-frame` and all seams are absent. Every test below fails on
 * an assertion (guarded so clicks never throw before their presence check).
 */

const BASE_URL = "http://localhost:3000";
const STUDIO_URL = `${BASE_URL}/studio`;
// The 5a frame is a fixed 1300×950 desktop artifact; give it room.
const VIEWPORT = { width: 1440, height: 1000 };

type StagehandPage = ReturnType<Stagehand["context"]["pages"]>[number];

let stagehand: Stagehand;
let page: StagehandPage;

/**
 * Visible text of the page, robust to controlled form fields. Clones <body>,
 * strips scripts/styles (which embed Next's inline RSC/flight JSON → false
 * positives), reads `textContent` (SOURCE case — matches copy uppercased only in
 * CSS), THEN appends every <textarea>/<input> `.value`, because a React
 * controlled field keeps its text in the `.value` property, not as a child text
 * node (so `textContent` alone would miss the editable SCRIPT / VISUAL PROMPT).
 */
async function readableText(): Promise<string> {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll("script, style, noscript, template")
      .forEach((el) => el.remove());
    let text = clone.textContent ?? "";
    document
      .querySelectorAll<HTMLTextAreaElement | HTMLInputElement>(
        "textarea, input",
      )
      .forEach((el) => {
        if (el.value) text += ` ${el.value}`;
      });
    return text;
  });
}

async function count(css: string): Promise<number> {
  return page.locator(css).count();
}

/**
 * Poll until no element carries `testid`, else throw. The companion popovers
 * (`reroll-menu` / `ship-menu`) are conditionally rendered (`{open && …}`), so on
 * dismiss they DETACH rather than going `display:none`; the understudy's
 * `waitForSelector(state:"hidden")` waits for an attached-but-hidden node and
 * never resolves for a removed one (Playwright treats detached as hidden; the
 * understudy does not). Asserting the node is GONE is the equivalent "closed"
 * guarantee. Same pattern as `landing.e2e.ts`'s `waitForGone` (the mobile sheet).
 */
async function waitForGone(testid: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await page.locator(`[data-testid="${testid}"]`).count()) === 0) return;
    await page.waitForTimeout(100);
  }
  throw new Error(
    `[data-testid="${testid}"] still present after ${timeoutMs}ms (expected gone)`,
  );
}

async function testidText(testid: string): Promise<string> {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    return (el?.textContent ?? "").trim();
  }, testid);
}

/** textContent of the mounted Remotion Player subtree (composition DOM). */
async function playerText(): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".__remotion-player");
    return el?.textContent ?? "";
  });
}

async function dataAttr(testid: string, attr: string): Promise<string | null> {
  return page.evaluate(
    ({ id, a }) =>
      document
        .querySelector<HTMLElement>(`[data-testid="${id}"]`)
        ?.getAttribute(a) ?? null,
    { id: testid, a: attr },
  );
}

async function boxByTestId(
  testid: string,
): Promise<{ width: number; height: number }> {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!el) return { width: 0, height: 0 };
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  }, testid);
}

async function bgColorByTestId(testid: string): Promise<string> {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    return el ? getComputedStyle(el).backgroundColor : "";
  }, testid);
}

beforeAll(async () => {
  // No llmClient on purpose — deterministic DOM checks only (Gloo-free).
  stagehand = new Stagehand({ env: "LOCAL", verbose: 1 });
  await stagehand.init();
  page = stagehand.context.pages()[0];
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  // `/studio` 404s today; `next dev` still serves a 404 HTML page, so goto
  // resolves and the per-test assertions below are what go RED.
  await page.goto(STUDIO_URL, { waitUntil: "load" });
  await page.waitForTimeout(800); // settle any client mount
});

afterAll(async () => {
  await stagehand?.close();
});

// Always-visible chrome only (source case). Popover-only copy is asserted in E9
// after opening the menus, since the popovers render closed on load.
const EXACT_ANCHORS: readonly string[] = [
  // top bar
  "PREVIEW",
  "VERSE OF THE DAY",
  "· Jul 4",
  "GENERATE",
  "SHARE",
  "9:16",
  "16:9",
  "1:1",
  "↻ Regenerate",
  "Render & Share ▸", // source case; CSS uppercases it
  // player overlay chrome
  "SCENE 02 / 04",
  "🔊 NARRATED · JEJ-STYLE",
  "ROUGH",
  "JOHN 1:23 · KJV",
  "0:30", // transport total + timeline
  // scene inspector
  "SCENE",
  "02",
  "0:05 – 0:14 · 9s",
  "↻ Reroll scene",
  "NARRATION · SCRIPT",
  "of one crying in the wilderness,",
  "NARRATOR VOICE",
  "→ AI VOICE",
  "APPLIES TO WHOLE VIDEO",
  "warm, weathered, resonant baritone — unhurried, reverent, like James Earl Jones narrating scripture",
  "0:09",
  "↻ New take",
  "VISUAL PROMPT",
  "→ SENT TO AI",
  "lone bearded figure walking a desert path, blowing dust, low golden sun, cinematic 35mm, shallow depth of field",
  "ON-SCREEN TEXT",
  "Show text",
  "Voice only",
  "LOWER THIRD · ZILLA SLAB",
  "MUSIC · MOOD",
  "Swelling strings",
  "REFERENCE",
  "＋ Drop image",
  "The plan, not the render — voice, music & captions all set before you spend a generation.",
  // timeline
  "STORYBOARD",
  "4 SCENES · 0:30",
  "🔊 VOICE · JAMES EARL JONES-STYLE",
  "0:00",
  "0:05",
  "0:14",
  "0:22",
  "VISUAL",
  "SCRIPT",
  "VOICE",
  "MUSIC",
  "wilderness · dawn",
  "lone figure · desert path",
  "sunrise · road",
  "verse card",
  "I am the voice of one",
  "🔇 VOICE ONLY",
  "Make straight the way of the Lord.",
  "John 1:23 · KJV",
];

describe("Wilderness Studio editor (5a)", () => {
  test("E1: /studio renders the studio frame, not the landing", async () => {
    expect(await count('[data-testid="studio-frame"]')).toBeGreaterThan(0);
    const text = await readableText();
    expect(text).toContain("VERSE OF THE DAY");
    expect(text).not.toContain("Supagloo"); // not the landing shell
  });

  test("E2: every glyph-exact copy anchor is present", async () => {
    const text = await readableText();
    const missing = EXACT_ANCHORS.filter((a) => !text.includes(a));
    expect(
      missing,
      `Missing exact-copy anchors: ${JSON.stringify(missing, null, 2)}`,
    ).toEqual([]);
  });

  test("E3: the Remotion Player mounts inside the player panel", async () => {
    expect(await count('[data-testid="player-panel"]')).toBeGreaterThan(0);
    // Remotion's own container class — the Player renders DOM (no <canvas>).
    expect(
      await count('[data-testid="player-panel"] .__remotion-player'),
    ).toBeGreaterThan(0);
  });

  test("E4: the format toggle reshapes the composition + display frame", async () => {
    // presence-guard the interactive controls first (fails RED cleanly)
    expect(await count('[data-testid="aspect-16x9"]')).toBeGreaterThan(0);

    // load state: 9:16 portrait
    expect(await dataAttr("player-panel", "data-aspect")).toBe("9:16");
    expect(Number(await dataAttr("player-panel", "data-comp-w"))).toBe(1080);
    expect(Number(await dataAttr("player-panel", "data-comp-h"))).toBe(1920);
    const portrait = await boxByTestId("player-frame");
    expect(portrait.height).toBeGreaterThan(portrait.width);

    // → 16:9 landscape
    await page.locator('[data-testid="aspect-16x9"]').click();
    await page.waitForTimeout(150);
    expect(await dataAttr("player-panel", "data-aspect")).toBe("16:9");
    expect(Number(await dataAttr("player-panel", "data-comp-w"))).toBe(1920);
    expect(Number(await dataAttr("player-panel", "data-comp-h"))).toBe(1080);
    const landscape = await boxByTestId("player-frame");
    expect(landscape.width).toBeGreaterThan(landscape.height);

    // → 1:1 square
    await page.locator('[data-testid="aspect-1x1"]').click();
    await page.waitForTimeout(150);
    const square = await boxByTestId("player-frame");
    expect(Math.abs(square.width - square.height)).toBeLessThan(2);

    // restore 9:16 for later tests
    await page.locator('[data-testid="aspect-9x16"]').click();
    await page.waitForTimeout(150);
  });

  test("E5: selecting a timeline scene updates the inspector + player chip", async () => {
    expect(await count('[data-testid="scene-seg-s3"]')).toBeGreaterThan(0);
    // initial selected scene = 2
    expect(await testidText("scene-number")).toBe("02");

    await page.locator('[data-testid="scene-seg-s3"]').click();
    await page.waitForTimeout(200);

    expect(await testidText("scene-number")).toBe("03");
    expect(await testidText("scene-range")).toBe("0:14 – 0:22 · 8s");
    expect(await testidText("scene-chip")).toContain("SCENE 03 / 04");

    // restore scene 2
    await page.locator('[data-testid="scene-seg-s2"]').click();
    await page.waitForTimeout(200);
  });

  test("E6: play toggles the transport, and seeking moves the frame", async () => {
    expect(await count('[data-testid="transport-play"]')).toBeGreaterThan(0);
    expect(await dataAttr("player-panel", "data-playing")).toBe("false");

    // (a) Play → Pause flips the transport true → false (playerRef.toggle +
    // play/pause event wiring). Guaranteed deterministically.
    await page.locator('[data-testid="transport-play"]').click();
    await page.waitForTimeout(150);
    expect(await dataAttr("player-panel", "data-playing")).toBe("true");
    await page.locator('[data-testid="transport-play"]').click();
    await page.waitForTimeout(150);
    expect(await dataAttr("player-panel", "data-playing")).toBe("false");

    // (b) The frame CHANGES via a deterministic seek, exercising the
    // `frameupdate → data-current-frame` wiring WITHOUT depending on real-time
    // rAF. Verified in a real browser (2026-07-16): pressing play DOES advance
    // the preview for a user (170 → ~206 over ~1.2s ≈ 30fps), so the product is
    // correct — but real-time playback is rAF-timed and does not advance
    // reliably under the headless understudy. A seek is the same wiring, made
    // deterministic. The understudy clicks an element's visual CENTER, so a
    // scrubber click maps to the timeline midpoint: round(0.5 · 900) = frame 450
    // (the 0:30 @ 30fps demo). Confirmed identical under headed Chrome and the
    // understudy (both land on 450).
    const before = Number(await dataAttr("player-panel", "data-current-frame"));
    await page.locator('[data-testid="player-panel"] [role="slider"]').click();
    await page.waitForTimeout(200);
    const after = Number(await dataAttr("player-panel", "data-current-frame"));
    // The frame moved (the frameupdate wiring fired)...
    expect(after).not.toBe(before);
    // ...and it landed near the timeline MIDPOINT, proving the click POSITION
    // drove the seek (not a reset). A center click ≈ round(0.5 · 900) = frame 450
    // of the 0:30 @ 30fps demo; the band absorbs the driver's sub-pixel
    // center-rounding (the understudy lands ~445).
    expect(after).toBeGreaterThan(400);
    expect(after).toBeLessThan(500);

    // Restore a scene-2 frame: the seek left the Player in scene 3, but E7 asserts
    // scene 2's caption in the composition DOM. Clicking the scene-2 segment
    // re-seeks to its start (the same restore E5 uses), remounting scene 2.
    await page.locator('[data-testid="scene-seg-s2"]').click();
    await page.waitForTimeout(200);
  });

  test("E7: Show text / Voice only toggles the caption in the composition", async () => {
    expect(await count('[data-testid="onscreen-voice"]')).toBeGreaterThan(0);
    // scene 2 (selected) shows its caption in the Player DOM
    expect(await playerText()).toContain("of one crying in the wilderness,");

    await page.locator('[data-testid="onscreen-voice"]').click();
    await page.waitForTimeout(200);
    expect(await playerText()).not.toContain(
      "of one crying in the wilderness,",
    );

    await page.locator('[data-testid="onscreen-show"]').click();
    await page.waitForTimeout(200);
    expect(await playerText()).toContain("of one crying in the wilderness,");
  });

  test("E8: editing the SCRIPT updates the live caption", async () => {
    expect(await count('[data-testid="script-input"]')).toBeGreaterThan(0);
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        '[data-testid="script-input"]',
      );
      if (!ta) return;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(ta, "TEST CAPTION 5A");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(250);
    expect(await playerText()).toContain("TEST CAPTION 5A");
  });

  test("E9: companion popovers open, dismiss, and hold local toggle state", async () => {
    // Reroll → REGENERATE menu
    expect(await count('[data-testid="reroll-scene"]')).toBeGreaterThan(0);
    await page.locator('[data-testid="reroll-scene"]').click();
    await page.waitForSelector('[data-testid="reroll-menu"]', {
      state: "visible",
      timeout: 4000,
    });
    const rerollText = await testidText("reroll-menu");
    expect(rerollText).toContain("REGENERATE");
    expect(rerollText).toContain("This scene's visual");
    expect(rerollText).toContain("Rewrite the script");
    expect(rerollText).toContain("Re-plan all scenes");

    // Escape dismisses. The popover is conditionally rendered, so on close it
    // DETACHES — assert it's GONE (not `state:"hidden"`, which never resolves for
    // a removed node under the understudy). See `waitForGone`.
    await page.evaluate(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    await waitForGone("reroll-menu");

    // Render & Share → SHIP IT menu
    await page.locator('[data-testid="render-share"]').click();
    await page.waitForSelector('[data-testid="ship-menu"]', {
      state: "visible",
      timeout: 4000,
    });
    const shipText = await testidText("ship-menu");
    expect(shipText).toContain("SHIP IT");
    expect(shipText).toContain("TikTok ✓");
    expect(shipText).toContain("YT Shorts ✓");
    expect(shipText).toContain("Post automatically · 6:00 AM");

    // the "post automatically" checkbox holds local toggle state (default off)
    expect(await dataAttr("post-auto", "data-checked")).toBe("false");
    await page.locator('[data-testid="post-auto"]').click();
    await page.waitForTimeout(120);
    expect(await dataAttr("post-auto", "data-checked")).toBe("true");
  });

  test("E10: the Wilderness palette is scoped to the studio (no leak)", async () => {
    expect(await count('[data-testid="studio-frame"]')).toBeGreaterThan(0);
    // #16110d === rgb(22, 17, 13)
    expect(await bgColorByTestId("studio-frame")).toBe("rgb(22, 17, 13)");

    // the landing must NOT inherit the Wilderness tokens: `--ws-*` are declared
    // on the studio wrapper, never on :root.
    await page.goto(BASE_URL, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const wsOnRoot = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ws-bg")
        .trim(),
    );
    expect(wsOnRoot).toBe("");

    // restore for suite hygiene
    await page.goto(STUDIO_URL, { waitUntil: "load" });
    await page.waitForTimeout(400);
  });
});
