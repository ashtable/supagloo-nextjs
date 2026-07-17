import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";

/**
 * Turn 14 — the three overlays that hang off the already-built 13b `/studio/[id]`
 * top bar: 14a the Publish wizard (from the Publish button), 14b the version
 * dropdown (from the chip's ▾), 14c the render-progress overlay (from 14a step
 * 3's "Render & share ▸" CTA).
 *
 * DELIBERATELY Gloo-free (memory `test-harness`): NO `llmClient`, so `init/goto/
 * evaluate/locator/setViewportSize` all work even while Gloo OAuth is degraded.
 * Every check is deterministic — glyph-exact copy, `data-testid`/`data-*` seams,
 * derived numbers — so NO `extract`/`observe`. The publish PR dance and the
 * render progress are mocked pending→settled reducer transitions driven by
 * component-owned timers, so the flow is reachable by stepping fixed-copy buttons
 * and POLLED for terminal state / increasing progress (never a fixed sleep).
 *
 * `/studio/[id]` is left UNGATED (R-AUTH), so this suite `goto`s a valid id
 * directly — no `?mock=` needed.
 *
 * Reuses `tests/e2e/global-setup.ts` + `tests/e2e/helpers.ts`.
 *
 * STEP 7 STATUS: RED by construction — none of the 14a/14b/14c overlays exist
 * yet. `publish-button` still DIRECTLY bumps the version (old 13b behavior), the
 * chip's ▾ is an inert glyph (no `version-menu-trigger` button), and there is no
 * publish wizard / version menu / render overlay. So every wizard/menu/overlay
 * seam below is absent → each test fails RED at its first `waitForTestId` for a
 * missing seam. The failures are clean "never appeared" assertions, NOT harness
 * errors (Stagehand init/goto/evaluate/locator all connect Gloo-free, the studio
 * frame renders, and the reused 5a seams — render-share/ship-menu/aspect — are
 * present).
 *
 * ── data-testid contract Step 9 must implement (this file is the spec) ────────
 *  14a — Publish wizard:
 *   publish-wizard          the 14a backdrop-modal card (present iff the flow is open)
 *   publish-backdrop        the dimmer behind it (step-1 backdrop-dismissible)
 *   publish-review          the step-1 review pane (chip transition + diff)
 *   publish-commit-message  the mock commit title/body (non-empty)
 *   publish-changes         the diff-file list container
 *   publish-diff-row        one changed file; +data-tone="code"|"data" (D-DIFF-TONE)
 *   publish-cancel          step-1 "Cancel" (closes the wizard)
 *   publish-confirm         step-1 "Publish v0.0.2 ▸" (→ PUBLISH_BEGIN)
 *   publish-close           the ✕ (present in step 1 + step 3; ABSENT in step 2)
 *   publishing-log          the step-2 log container (log-row + data-status)
 *   publish-published-card  the step-3 terminal card ("v0.0.2 PUBLISHED.")
 *   publish-view-github     step-3 "View on GitHub" outline button
 *   publish-render-share    step-3 "Render & share ▸" gradient button (→ 14c)
 *  14b — Version dropdown:
 *   version-menu-trigger    the chip's ▾ button (data-menu-trigger, toggles the menu)
 *   version-menu            the anchored popover (data-menu-panel)
 *   version-compare         the "⇄ Compare" stub (INERT, D-14B-INERT)
 *   version-row             one version; +data-state (working|live|archived|template) +data-branch
 *   version-live-pill       "LIVE ON MAIN" on the live row
 *   version-restore         the "restore" link on an archived row (INERT)
 *   version-menu-note       the footer note
 *  14c — Render overlay:
 *   render-overlay          the full-frame overlay card
 *   render-dimmer           the overlay's dimmer
 *   render-eyebrow          "RENDERING · v0.0.2"
 *   render-title            the project name, uppercased ("PSALM-121")
 *   render-spec             "1080×1920 · 9:16 · 30fps · H.264" (derived)
 *   render-progress-label   the progress caption
 *   render-frame-count      "<framesDone> / 900" (derived total — NOT 840)
 *   render-percent          the percent readout
 *   render-bar-fill         the progress-bar fill
 *   render-stage            one stage row; +data-status
 *   render-cancel           "Cancel render" (outline; clears the render)
 *   render-background       "Run in background" (filled; hides + keeps rendering)
 *  Reused/existing (13b + 5a): studio-frame, version-branch-chip (+data-dirty),
 *   publish-button, script-input, aspect-9x16/16x9/1x1, render-share, ship-menu,
 *   regenerate.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BASE_URL = "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 1000 };

let stagehand: Stagehand;
let page: StagehandPage;
let h: E2EHelpers;

async function countTestId(testid: string): Promise<number> {
  return page.locator(`[data-testid="${testid}"]`).count();
}
/** Click a testid, retrying a transient Stagehand-understudy CDP race. Clicking
 *  a control that then unmounts its own subtree (e.g. publish-confirm swaps the
 *  wizard's review pane for the publishing step) intermittently makes the
 *  understudy's `DOM.getBoxModel` come back "-32000 Node does not have a layout
 *  object". `getBoxModel` runs BEFORE the synthetic mouse dispatch, so a rejected
 *  click performed NO action — retrying re-resolves the (now-stable) node and
 *  cannot double-fire. Pure test-infra resilience; the assertions are unchanged. */
async function clickTestId(testid: string): Promise<void> {
  const sel = `[data-testid="${testid}"]`;
  for (let attempt = 0; ; attempt++) {
    try {
      await page.locator(sel).click();
      return;
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (attempt < 3 && /layout object|not (found|visible)/i.test(msg)) {
        await page.waitForTimeout(150);
        continue;
      }
      throw err;
    }
  }
}
async function testidText(testid: string): Promise<string> {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    return (el?.textContent ?? "").trim();
  }, testid);
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
/** All `data-tone` values, in DOM order, across the `publish-diff-row`s. */
async function diffTones(): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="publish-diff-row"]',
      ),
    ).map((el) => el.getAttribute("data-tone") ?? ""),
  );
}
/** Read `attr` off every element carrying `testid`, in DOM order. */
async function dataAttrAll(testid: string, attr: string): Promise<string[]> {
  return page.evaluate(
    ({ id, a }) =>
      Array.from(
        document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
      ).map((el) => el.getAttribute(a) ?? ""),
    { id: testid, a: attr },
  );
}
/** Joined textContent of every element carrying `testid`. */
async function allTestidText(testid: string): Promise<string> {
  return page.evaluate((id) => {
    return Array.from(
      document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
    )
      .map((el) => (el.textContent ?? "").trim())
      .join(" · ");
  }, testid);
}
/** First integer parsed out of a testid's text (e.g. "132 / 900" → 132). */
async function firstIntIn(testid: string): Promise<number> {
  const text = await testidText(testid);
  const m = /\d+/.exec(text);
  return m ? Number(m[0]) : NaN;
}
async function waitForTestId(testid: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(testid)) > 0) return;
    await page.waitForTimeout(100);
  }
  throw new Error(
    `[data-testid="${testid}"] never appeared within ${timeoutMs}ms`,
  );
}
async function waitForTestidTextContains(
  testid: string,
  needle: string,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await testidText(testid);
    if (last.includes(needle)) return;
    await page.waitForTimeout(100);
  }
  throw new Error(
    `[data-testid="${testid}"] text never contained ${JSON.stringify(needle)} within ${timeoutMs}ms (last: ${JSON.stringify(last)})`,
  );
}
/** Type into the SCRIPT textarea via the native value setter + `input` event —
 *  the exact controlled-field seam `studio.e2e.ts`/`studio-project.e2e.ts` use. */
async function typeIntoScript(value: string): Promise<void> {
  await page.evaluate((v) => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="script-input"]',
    );
    if (!ta) return;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    setter.call(ta, v);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
/** Navigate to a studio id and settle past the client mount (studio-frame). The
 *  studio island is SSR'd, so `studio-frame` is in the DOM BEFORE React hydrates
 *  and attaches the button onClicks — clicking `publish-button` in that window is
 *  a no-op and the wizard never opens (the mount-gate race, memory `test-harness`).
 *  So after the frame appears, settle briefly to let hydration wire the handlers. */
async function gotoStudio(path: string): Promise<void> {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "load" });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if ((await countTestId("studio-frame")) > 0) {
      await page.waitForTimeout(700); // let the client island hydrate before clicks
      return;
    }
    await page.waitForTimeout(200);
  }
}

// ── shared flow drivers (each polls; RED at the first missing seam) ────────────

/** Open psalm-121 and step into the 14a review pane. */
async function openPublishReview(): Promise<void> {
  await gotoStudio("/studio/psalm-121");
  await clickTestId("publish-button");
  await waitForTestId("publish-wizard");
  await waitForTestId("publish-review");
}
/** Drive the full 14a flow (psalm-121) to the step-3 published card. */
async function publishToStep3(): Promise<void> {
  await openPublishReview();
  await clickTestId("publish-confirm");
  await waitForTestId("publish-published-card", 12_000);
}
/** Drive to step 3 then open the 14c render overlay from the terminal CTA. */
async function publishThenRender(): Promise<void> {
  await publishToStep3();
  await clickTestId("publish-render-share");
  await waitForTestId("render-overlay");
}
/** Open the 14b version dropdown on the currently-loaded studio page. */
async function openVersionMenu(): Promise<void> {
  await clickTestId("version-menu-trigger");
  await waitForTestId("version-menu");
}

beforeAll(async () => {
  stagehand = new Stagehand({ env: "LOCAL", verbose: 1 }); // Gloo-free
  await stagehand.init();
  page = stagehand.context.pages()[0];
  h = makeHelpers(page);
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
});

afterAll(async () => {
  await stagehand?.close();
});

describe("Studio /studio/[id] — 14a Publish wizard", () => {
  test("E-PUB1: Publish opens the review step (chip transition, commit message, diff) and does NOT bump the chip", async () => {
    await gotoStudio("/studio/psalm-121");
    expect(await countTestId("publish-button")).toBeGreaterThan(0);
    expect(await testidText("version-branch-chip")).toContain("v0.0.1");

    await clickTestId("publish-button");
    await waitForTestId("publish-wizard");
    expect(await countTestId("publish-backdrop")).toBeGreaterThan(0);
    await waitForTestId("publish-review");

    // the version transition v0.0.1 → v0.0.2 · merges to main
    const review = await testidText("publish-review");
    expect(review).toContain("v0.0.1");
    expect(review).toContain("→");
    expect(review).toContain("v0.0.2");
    expect(review).toContain("merges to main");

    // a non-empty mock commit message
    expect((await testidText("publish-commit-message")).length).toBeGreaterThan(0);

    // 3 diff rows — 2 code (green) + 1 data (gold); the data path is derived
    expect(await countTestId("publish-diff-row")).toBe(3);
    const tones = await diffTones();
    expect(tones.filter((t) => t === "code")).toHaveLength(2);
    expect(tones.filter((t) => t === "data")).toHaveLength(1);
    expect(await testidText("publish-changes")).toContain("psalm-121");

    // CTAs
    expect(await testidText("publish-confirm")).toBe("Publish v0.0.2 ▸");
    expect(await countTestId("publish-cancel")).toBeGreaterThan(0);
    expect(await countTestId("publish-close")).toBeGreaterThan(0);

    // NOTHING published yet — the chip is still on the working branch
    expect(await testidText("version-branch-chip")).toContain("v0.0.1");
  });

  test("E-PUB2: Confirm runs the publishing log (non-dismissible) then shows the published card", async () => {
    await openPublishReview();
    await clickTestId("publish-confirm");

    // step 2 — the publishing log; mid-flight there is NO ✕ (can't abort a git op)
    await waitForTestId("publishing-log");
    await waitForTestidTextContains("publishing-log", "Committed to v0.0.1");
    await waitForTestidTextContains(
      "publishing-log",
      "Merging PR & tagging v0.0.2",
    );
    expect(await testidText("publishing-log")).toContain("v0.0.3"); // footnote
    expect(await countTestId("publish-close")).toBe(0);

    // step 3 — the published card
    await waitForTestId("publish-published-card", 12_000);
    const card = await testidText("publish-published-card");
    expect(card).toContain("v0.0.2 PUBLISHED");
    expect(card).toContain("v0.0.3"); // now editing on the new working branch
    expect(await countTestId("publish-view-github")).toBeGreaterThan(0);
    expect(await countTestId("publish-render-share")).toBeGreaterThan(0);
  });

  test("E-PUB3: dismissal — ✕/Cancel close step 1, step 2 is non-dismissible, backdrop only dismisses step 1", async () => {
    // (i) the ✕ closes the wizard
    await openPublishReview();
    await clickTestId("publish-close");
    await h.waitForGone("publish-wizard");

    // (ii) Cancel closes the wizard
    await openPublishReview();
    await clickTestId("publish-cancel");
    await h.waitForGone("publish-wizard");

    // (iii) mid-flight (step 2) there is no ✕ to abort the git op
    await openPublishReview();
    await clickTestId("publish-confirm");
    await waitForTestId("publishing-log");
    expect(await countTestId("publish-close")).toBe(0);

    // (iv) a backdrop click dismisses step 1 but NOT step 2
    await openPublishReview();
    await clickTestId("publish-backdrop");
    await h.waitForGone("publish-wizard");
  });

  test("E-PUB4: after publishing, the top bar reflects the two-step bump (chip v0.0.3, Publish v0.0.4)", async () => {
    await publishToStep3();
    await clickTestId("publish-close");
    await h.waitForGone("publish-wizard");

    await waitForTestidTextContains("version-branch-chip", "v0.0.3");
    expect(await testidText("publish-button")).toBe("Publish v0.0.4 ▸");
  });
});

describe("Studio /studio/[id] — 14b version dropdown", () => {
  test("E-VER1: the chip's ▾ opens the version menu — header, Compare, note, and the fresh 2 rows", async () => {
    await gotoStudio("/studio/psalm-121");
    expect(await countTestId("version-menu-trigger")).toBeGreaterThan(0);

    await openVersionMenu();
    expect(await dataAttr("version-menu", "data-menu-panel")).not.toBeNull();
    expect(await testidText("version-menu")).toContain("VERSIONS");
    expect(await countTestId("version-compare")).toBeGreaterThan(0);
    expect(await testidText("version-menu-note")).toContain(
      "main always holds the latest published version",
    );

    // a fresh project (nothing published) = the working + template rows only
    const states = await dataAttrAll("version-row", "data-state");
    const branches = await dataAttrAll("version-row", "data-branch");
    expect(states).toContain("working");
    expect(states).toContain("template");
    expect(branches).toContain("v0.0.1"); // working
    expect(branches).toContain("v0.0.0"); // template
    expect(states).not.toContain("live");
    expect(states).not.toContain("archived");
  });

  test("E-VER2: post-publish, the menu is the drawn 4 rows; a dirty edit adds the unsaved dot to the working row", async () => {
    await publishToStep3();
    await clickTestId("publish-close");
    await h.waitForGone("publish-wizard");

    await openVersionMenu();
    expect(await countTestId("version-row")).toBe(4);
    const byBranch = await page.evaluate(() =>
      Object.fromEntries(
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-testid="version-row"]',
          ),
        ).map((el) => [
          el.getAttribute("data-branch") ?? "",
          el.getAttribute("data-state") ?? "",
        ]),
      ),
    );
    expect(byBranch["v0.0.3"]).toBe("working");
    expect(byBranch["v0.0.2"]).toBe("live");
    expect(byBranch["v0.0.1"]).toBe("archived");
    expect(byBranch["v0.0.0"]).toBe("template");

    expect(await testidText("version-live-pill")).toContain("LIVE ON MAIN");
    expect(await countTestId("version-restore")).toBeGreaterThan(0);

    // no unsaved dot while clean; editing the SCRIPT adds it to the working row
    expect(await countTestId("unsaved-dot")).toBe(0);
    await typeIntoScript("EDITED AFTER PUBLISH");
    await openVersionMenu();
    expect(await countTestId("unsaved-dot")).toBeGreaterThan(0);
  });

  test("E-VER3: the menu dismisses (Escape / outside / re-click) and its rows are INERT (D-14B-INERT)", async () => {
    // Escape closes it
    await gotoStudio("/studio/psalm-121");
    await openVersionMenu();
    await page.evaluate(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    await h.waitForGone("version-menu");

    // an outside pointerdown (on the studio chrome) closes it
    await openVersionMenu();
    await clickTestId("studio-frame");
    await h.waitForGone("version-menu");

    // re-clicking the trigger toggles it closed (mutual-exclusion one-click)
    await openVersionMenu();
    await clickTestId("version-menu-trigger");
    await h.waitForGone("version-menu");

    // inert: clicking restore / Compare changes nothing (chip stays working)
    await openVersionMenu();
    await clickTestId("version-compare");
    expect(await countTestId("version-menu")).toBeGreaterThan(0); // still open, no nav
    expect(await testidText("version-branch-chip")).toContain("v0.0.1");
  });
});

describe("Studio /studio/[id] — 14c render overlay", () => {
  test("E-RND1: the post-publish CTA opens the render overlay (derived spec + 900 frames), distinct from the top-bar ship-menu", async () => {
    await publishToStep3();
    await clickTestId("publish-render-share");
    await waitForTestId("render-overlay");
    await h.waitForGone("publish-wizard");

    expect(await countTestId("render-dimmer")).toBeGreaterThan(0);
    expect(await testidText("render-eyebrow")).toContain("RENDERING · v0.0.2");
    expect(await testidText("render-title")).toBe("PSALM-121");
    expect(await testidText("render-spec")).toBe(
      "1080×1920 · 9:16 · 30fps · H.264",
    );
    // derived total is the composition's 900 frames — NOT the wireframe's 840
    expect(await testidText("render-frame-count")).toMatch(/\d+ \/ 900/);
    expect(await countTestId("render-stage")).toBe(4);

    // copy-collision cross-check: the top-bar Render & Share is a DIFFERENT
    // feature (opens ship-menu, not the render overlay). Fresh page so no render.
    await gotoStudio("/studio/psalm-121");
    expect(await countTestId("render-overlay")).toBe(0);
    expect(await countTestId("render-share")).toBeGreaterThan(0);
    await clickTestId("render-share");
    await waitForTestId("ship-menu");
    expect(await countTestId("render-overlay")).toBe(0);
  });

  test("E-RND2: render progress climbs (percent + frame count increase from the first sample)", async () => {
    await publishThenRender();

    const firstFrames = await firstIntIn("render-frame-count");
    const firstPct = await firstIntIn("render-percent");

    const deadline = Date.now() + 10_000;
    let grew = false;
    while (Date.now() < deadline) {
      const frames = await firstIntIn("render-frame-count");
      const pct = await firstIntIn("render-percent");
      if (frames > firstFrames || pct > firstPct) {
        grew = true;
        break;
      }
      await page.waitForTimeout(100);
    }
    expect(grew, "render progress advances over time").toBe(true);
  });

  test("E-RND3: Run in background hides the overlay and returns the studio to interactive", async () => {
    await publishThenRender();
    await clickTestId("render-background");
    await h.waitForGone("render-overlay");

    // the studio is interactive again (the aspect toggle still responds)
    expect(await countTestId("aspect-16x9")).toBeGreaterThan(0);
    await clickTestId("aspect-16x9");
    expect(await countTestId("render-overlay")).toBe(0);
  });

  test("E-RND4: Cancel render clears the overlay (re-triggering requires another publish)", async () => {
    await publishThenRender();
    await clickTestId("render-cancel");
    await h.waitForGone("render-overlay");
    expect(await countTestId("render-overlay")).toBe(0);
  });
});
