import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";

/**
 * Turn 13b — the `/studio/[id]` editor's new top bar (repo identity, the
 * version-branch chip, the dirty caption, Commit / Publish) plus the routing
 * invariants that make `/studio/[id]` the only valid editor route (bare `/studio`
 * and unknown ids 404).
 *
 * DELIBERATELY Gloo-free (memory `test-harness`): NO `llmClient`, so `init/goto/
 * evaluate/locator/setViewportSize` all work even while Gloo OAuth is degraded.
 * Every check is deterministic — glyph-exact copy, `data-testid`/`data-*` seams —
 * so NO `extract`/`observe`. Commit/Publish are mocked pending→settled reducer
 * transitions (D-COMMIT-PUBLISH); the dirty flag is driven by the EXISTING
 * SCRIPT-edit seam (`script-input`), the same controlled `.value` path
 * `studio.e2e.ts` already exercises (R-DIRTY).
 *
 * `/studio/[id]` is left UNGATED (R-AUTH, matching today's `/studio`), so this
 * suite `goto`s a valid id directly — no `?mock=` needed.
 *
 * Reuses `tests/e2e/global-setup.ts` + `tests/e2e/helpers.ts`.
 *
 * STEP 7 STATUS: RED by construction — `app/studio/[id]/page.tsx`, the 13b top
 * bar, and the reducer's dirty/commit/publish state do NOT exist yet. Bare
 * `/studio` still renders the OLD 5a studio (so E-SP4's "bare /studio 404s"
 * assertion fails RED), and `/studio/<id>` 404s (no dynamic route yet), so the
 * top-bar seams are all absent. Each test guards with a presence check.
 *
 * ── data-testid contract Step 9 must implement (this file is the spec) ────────
 *  studio-frame            the editor root (present iff a valid project resolves)
 *  studio-back             the ‹ back chevron → router.push("/")
 *  studio-project-name     the project name ("psalm-121")
 *  studio-project-rename   the ✎ pencil (non-functional affordance, A4)
 *  studio-repo-path        "ashsrinivas/psalm-121" (octocat + mono path)
 *  version-branch-chip     ⑂ + branch + (unsaved-dot when dirty) + ▾; +data-dirty
 *  unsaved-dot             the 7×7 gold dot — present ONLY when dirty
 *  dirty-caption           "Edited … · not committed" | "All changes committed"
 *  commit-button           "⤓ Commit" — disabled when clean, "Committing…" pending
 *  publish-button          "Publish v0.0.2 ▸" (= publishLabel(branch))
 *  studio-avatar           the "AS" initials circle
 *  studio-not-found        the themed studio 404 body (on notFound())
 *  (retained from 5a)  aspect-9x16 / aspect-16x9 / aspect-1x1, regenerate,
 *                      render-share, script-input
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
async function clickTestId(testid: string): Promise<void> {
  await page.locator(`[data-testid="${testid}"]`).click();
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
/** Read the DOM `.disabled` property of a <button> testid (true if absent). */
async function isDisabled(testid: string): Promise<boolean> {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLButtonElement>(
      `[data-testid="${id}"]`,
    );
    return el ? el.disabled : true;
  }, testid);
}
/** Type into the SCRIPT textarea via the native value setter + `input` event —
 *  a React controlled field keeps its text in `.value`, so a plain type would be
 *  clobbered. This is the exact seam `studio.e2e.ts` E8 uses. */
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
async function waitForTestId(testid: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(testid)) > 0) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`[data-testid="${testid}"] never appeared within ${timeoutMs}ms`);
}
async function waitForDataAttr(
  testid: string,
  attr: string,
  expected: string,
  timeoutMs = 6000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: string | null = null;
  while (Date.now() < deadline) {
    last = await dataAttr(testid, attr);
    if (last === expected) return;
    await page.waitForTimeout(80);
  }
  throw new Error(
    `[data-testid="${testid}"] ${attr}="${last}" never became "${expected}" within ${timeoutMs}ms`,
  );
}
async function waitForTestidText(
  testid: string,
  expected: string,
  timeoutMs = 6000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await testidText(testid);
    if (last === expected) return;
    await page.waitForTimeout(80);
  }
  throw new Error(
    `[data-testid="${testid}"] textContent never became ${JSON.stringify(expected)} within ${timeoutMs}ms (last: ${JSON.stringify(last)})`,
  );
}
async function waitForTestidTextContains(
  testid: string,
  needle: string,
  timeoutMs = 6000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await testidText(testid);
    if (last.includes(needle)) return;
    await page.waitForTimeout(80);
  }
  throw new Error(
    `[data-testid="${testid}"] textContent never contained ${JSON.stringify(needle)} within ${timeoutMs}ms (last: ${JSON.stringify(last)})`,
  );
}
/** Navigate to a studio id and settle past the client mount. On Step 7 RED the
 *  route 404s so `studio-frame` never appears — we swallow the wait so the
 *  per-test presence guard reports the missing frame as a clean assertion. */
async function gotoStudio(path: string): Promise<void> {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "load" });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if ((await countTestId("studio-frame")) > 0) return;
    await page.waitForTimeout(200);
  }
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

describe("Studio /studio/[id] — 13b top bar", () => {
  test("E-SP1: the top bar shows project identity and a CLEAN version chip", async () => {
    await gotoStudio("/studio/psalm-121");
    expect(await countTestId("studio-frame")).toBeGreaterThan(0);

    expect(await testidText("studio-project-name")).toBe("psalm-121");
    expect(await testidText("studio-repo-path")).toBe("ashsrinivas/psalm-121");

    const chip = await testidText("version-branch-chip");
    expect(chip, "chip shows the branch glyph").toContain("⑂");
    expect(chip, "chip shows the version").toContain("v0.0.1");
    expect(await dataAttr("version-branch-chip", "data-dirty")).toBe("false");

    // clean state (D-CLEAN-STATE): dot hidden, caption "All changes committed"
    expect(await countTestId("unsaved-dot")).toBe(0);
    expect(await testidText("dirty-caption")).toBe("All changes committed");

    // Publish label = next version; Commit is disabled while clean
    expect(await testidText("publish-button")).toBe("Publish v0.0.2 ▸");
    expect(await isDisabled("commit-button")).toBe(true);

    expect(await testidText("studio-avatar")).toBe("AS");
    expect(await countTestId("studio-back")).toBeGreaterThan(0);

    // D-TOPBAR retained the 5a live actions (not dropped by the 13b rebuild)
    expect(await countTestId("regenerate")).toBeGreaterThan(0);
    expect(await countTestId("render-share")).toBeGreaterThan(0);
    expect(await countTestId("aspect-9x16")).toBeGreaterThan(0);
  });

  test("E-SP2: editing the SCRIPT dirties the chip; Commit returns it to clean", async () => {
    await gotoStudio("/studio/psalm-121");
    expect(await countTestId("script-input")).toBeGreaterThan(0);

    await typeIntoScript("EDITED FOR THE DIRTY STATE");
    await waitForDataAttr("version-branch-chip", "data-dirty", "true");
    expect(await testidText("dirty-caption")).toContain("not committed");
    expect(await countTestId("unsaved-dot")).toBeGreaterThan(0);
    expect(await isDisabled("commit-button")).toBe(false); // enabled when dirty

    // Commit → pending → settled back to clean (poll, never a fixed sleep)
    await clickTestId("commit-button");
    await waitForDataAttr("version-branch-chip", "data-dirty", "false");
    expect(await testidText("dirty-caption")).toBe("All changes committed");
    expect(await countTestId("unsaved-dot")).toBe(0);
  });

  test("E-SP3: Publish bumps the branch and recomputes the next label", async () => {
    await gotoStudio("/studio/psalm-121");
    expect(await countTestId("publish-button")).toBeGreaterThan(0);
    expect(await testidText("version-branch-chip")).toContain("v0.0.1");
    expect(await testidText("publish-button")).toBe("Publish v0.0.2 ▸");

    await clickTestId("publish-button");
    // pure nextVersion bump: chip → v0.0.2, publish label → the NEXT next version
    await waitForTestidTextContains("version-branch-chip", "v0.0.2");
    await waitForTestidText("publish-button", "Publish v0.0.3 ▸");
  });
});

describe("Studio /studio/[id] — routing invariants (E-SP4)", () => {
  test("E-SP4: bare /studio and unknown ids 404; a valid id renders", async () => {
    // bare /studio — no id — must 404 (the old bare route is deleted, A6)
    await page.goto(`${BASE_URL}/studio`, { waitUntil: "load" });
    await page.waitForTimeout(600);
    expect(await countTestId("studio-frame")).toBe(0);
    const bare = await h.bodyText();
    const bareNotFound =
      (await countTestId("studio-not-found")) > 0 || /not found/i.test(bare);
    expect(bareNotFound, "bare /studio shows a 404, not the editor").toBe(true);

    // unknown id → notFound()
    await page.goto(`${BASE_URL}/studio/does-not-exist`, { waitUntil: "load" });
    await page.waitForTimeout(600);
    expect(await countTestId("studio-frame")).toBe(0);
    const unknown = await h.bodyText();
    const unknownNotFound =
      (await countTestId("studio-not-found")) > 0 || /not found/i.test(unknown);
    expect(unknownNotFound, "unknown id shows a 404").toBe(true);

    // a valid workspace project id renders the editor
    await gotoStudio("/studio/genesis-light");
    expect(await countTestId("studio-frame")).toBeGreaterThan(0);
    expect(await testidText("studio-project-name")).toBe("genesis-light");
  });
});
