import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { glooLlmClient } from "../../lib/gloo/llm-client";
import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";

/**
 * Task #26 §3.4 — landing origin entry points. v1 descopes VOTD / From-a-passage
 * / demo to disabled "Coming soon" affordances; "Blank canvas" is the one live
 * origin and links into the workspace's New-project intent (`/?newproject=blank`).
 *
 * Public/mock surface: the landing renders for signed-out visitors, so no
 * seed/demo flag is needed — plain `goto /`. All assertions are deterministic
 * (evaluate-based), no LLM extraction.
 */

const BASE_URL = "http://localhost:3000";
const DESKTOP = { width: 1288, height: 711 };

let stagehand: Stagehand;
let page: StagehandPage;
let waitForText: E2EHelpers["waitForText"];

/** Snapshot the attributes the disabled/enabled contract is made of. */
async function cardFacts(testid: string): Promise<{
  tag: string;
  dataDisabled: string | null;
  ariaDisabled: string | null;
  href: string | null;
  text: string;
  opacity: number;
} | null> {
  return page.evaluate((tid) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${tid}"]`);
    if (!el) return null;
    return {
      tag: el.tagName,
      dataDisabled: el.getAttribute("data-disabled"),
      ariaDisabled: el.getAttribute("aria-disabled"),
      href: el.getAttribute("href"),
      text: el.textContent ?? "",
      opacity: Number(getComputedStyle(el).opacity),
    };
  }, testid);
}

async function locationSearch(): Promise<string> {
  return page.evaluate(() => window.location.search);
}

/** Click a testid, retrying a transient Stagehand-understudy CDP race. Clicking a
 *  freshly-rendered card intermittently makes the understudy's `DOM.getBoxModel`
 *  come back "-32000 Node does not have a layout object" — `waitForText()` can
 *  resolve before the newly-rendered subtree has a box model. `getBoxModel` runs
 *  BEFORE the synthetic mouse dispatch, so a rejected click performed NO action —
 *  retrying re-resolves the (now-stable) node and cannot double-fire. Pure
 *  test-infra resilience (ported from `studio-publish.e2e.ts`); assertions are
 *  unchanged. NOT a scrollIntoView/viewport issue — the driver already
 *  scroll-into-views before every click. */
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

beforeAll(async () => {
  stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient: await glooLlmClient(),
  });
  await stagehand.init();
  page = stagehand.context.pages()[0];
  ({ waitForText } = makeHelpers(page));
  await page.setViewportSize(DESKTOP.width, DESKTOP.height);
  await page.goto(BASE_URL, { waitUntil: "load" });
  // The start cards are server-rendered — waiting for the section label is
  // enough (no auth mount-gate involved).
  await waitForText("OR START YOUR OWN");
});

afterAll(async () => {
  await stagehand?.close();
});

describe("landing origin entry points (Task #26 §3.4)", () => {
  test("A: votd + passage cards are disabled 'Coming soon' (non-links, dimmed)", async () => {
    for (const tid of ["start-card-votd", "start-card-passage"]) {
      const facts = await cardFacts(tid);
      expect(facts, `${tid} must render`).not.toBeNull();
      expect(facts!.dataDisabled, tid).toBe("true");
      expect(facts!.ariaDisabled, tid).toBe("true");
      expect(facts!.text, tid).toContain("Coming soon");
      // A disabled card must not be a navigation target...
      expect(facts!.href, tid).toBeNull();
      // ...and reads visually dimmed.
      expect(facts!.opacity, tid).toBeLessThan(1);
    }
  });

  test("B: the featured-demo CTA is disabled 'Coming soon'", async () => {
    const facts = await cardFacts("start-demo");
    expect(facts, "start-demo must render").not.toBeNull();
    expect(facts!.tag).toBe("BUTTON");
    expect(facts!.dataDisabled).toBe("true");
    expect(facts!.ariaDisabled).toBe("true");
    expect(facts!.text).toContain("▶ Start from this demo");
    expect(facts!.text).toContain("Coming soon");
    expect(facts!.opacity).toBeLessThan(1);
  });

  test("C: clicking a disabled origin goes nowhere (non-interactive)", async () => {
    // No native `disabled` attr (understudy clicks would hang), so prove
    // inertness behaviorally: click each and assert the URL never changes.
    for (const tid of ["start-card-votd", "start-card-passage", "start-demo"]) {
      await clickTestId(tid);
      await page.waitForTimeout(400);
      expect(await locationSearch(), tid).not.toContain("newproject");
    }
  });

  test("D: 'Blank canvas' is the live origin — an enabled link to /?newproject=blank", async () => {
    const facts = await cardFacts("start-card-blank");
    expect(facts, "start-card-blank must render").not.toBeNull();
    expect(facts!.tag).toBe("A");
    expect(facts!.dataDisabled).toBeNull();
    expect(facts!.ariaDisabled).toBeNull();
    expect(facts!.text).toContain("Blank canvas");
    expect(facts!.text).not.toContain("Coming soon");
    expect(facts!.href).toBe("/?newproject=blank");
  });

  test("E: clicking 'Blank canvas' navigates into the new-project intent", async () => {
    await clickTestId("start-card-blank");
    // Poll for the navigation (full-page anchor nav, not client routing).
    const deadline = Date.now() + 15_000;
    let search = "";
    while (Date.now() < deadline) {
      search = await locationSearch();
      if (search.includes("newproject=blank")) break;
      await page.waitForTimeout(250);
    }
    expect(search).toContain("newproject=blank");
  });
});
