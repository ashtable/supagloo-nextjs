import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";

/**
 * Turn 11a — the first-time setup wizard, shown once after the very first
 * sign-in over a dimmed workspace backdrop.
 *
 * DELIBERATELY Gloo-free (memory `test-harness`): NO `llmClient`, so this runs
 * even while Gloo OAuth is degraded. Every check is deterministic — glyph-exact
 * copy anchors, `data-testid` seams, computed-style progress ratios — so NO
 * `extract`/`observe`. Reachability via the flag-gated mock session:
 * `/?mock=authed-fresh` = signed-in but NOT onboarded → the wizard overlays the
 * workspace.
 *
 * The tests flow through the wizard in order on ONE mounted page (welcome →
 * github → openrouter → gloo → done → workspace), the way the /studio suite
 * threads editor state. This run takes the GitHub-only path: connect GitHub
 * (the hard gate), then SKIP OpenRouter and Gloo — so the Done recap proves
 * `doneRecap` templating (skipped copy), not the wireframe's hardcoded row.
 *
 * Reuses `tests/e2e/global-setup.ts` + `tests/e2e/helpers.ts`.
 *
 * STEP 7 STATUS: RED by construction — the mock-session seam + the wizard do not
 * exist yet, so `/?mock=authed-fresh` renders the current public landing and no
 * `setup-wizard` seam appears. Each test guards with a presence check so a click
 * never throws before its assertion.
 *
 * ── data-testid contract Step 9 must implement (this file is the spec) ────────
 *   setup-wizard          the wizard overlay container (mount-gated; not dismissible)
 *   modal-backdrop        the dimmed rgba(0,0,0,.55) workspace backdrop
 *   wizard-progress       the 6px progress track
 *   wizard-progress-fill  the filled portion; width === progressFill(step)% of the track
 *   wizard-step-label     the "STEP n OF 4 · …" eyebrow (absent on the Done step)
 *   wizard-get-started    "Get started →" (welcome → github)
 *   connect-authorize     "Authorize with GitHub" (shared github body; connect → auto-advance)
 *   wizard-skip           "Skip for now →" (openrouter) / "Skip" (gloo)
 *   wizard-finish         "Go to my workspace →" (done → workspace)
 *   pkce-callout          the 🔒 PKCE callout — ABSENT in the wizard openrouter step
 *                         (present only in the standalone 11c modal; ambiguity #6)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BASE_URL = "http://localhost:3000";
const FRESH_URL = `${BASE_URL}/?mock=authed-fresh`;
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
async function widthOf(testid: string): Promise<number> {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    return el ? el.getBoundingClientRect().width : 0;
  }, testid);
}
/** fill / track width ratio for the progress bar (0 if either is absent). */
async function progressRatio(): Promise<number> {
  const track = await widthOf("wizard-progress");
  const fill = await widthOf("wizard-progress-fill");
  return track > 0 ? fill / track : 0;
}
/** Poll the step-label eyebrow until it equals `expected`, else throw. Covers
 *  the mocked-OAuth auto-advance (github connect → openrouter) without a race. */
async function waitForStepLabel(
  expected: string,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await testidText("wizard-step-label");
    if (last === expected) return;
    await page.waitForTimeout(100);
  }
  throw new Error(
    `wizard-step-label never became ${JSON.stringify(expected)} within ${timeoutMs}ms (last: ${JSON.stringify(last)})`,
  );
}

const PKCE_CALLOUT =
  "PKCE means the token is exchanged directly between your browser and OpenRouter — Supagloo never sees your password or a long-lived key.";

beforeAll(async () => {
  stagehand = new Stagehand({ env: "LOCAL", verbose: 1 }); // Gloo-free
  await stagehand.init();
  page = stagehand.context.pages()[0];
  h = makeHelpers(page);
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  await page.goto(FRESH_URL, { waitUntil: "load" });
  // Settle past the SessionProvider mount-gate. On Step 7 RED the wizard never
  // mounts; we swallow the wait so E-O1's presence guard reports it cleanly.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if ((await countTestId("setup-wizard")) > 0) break;
    await page.waitForTimeout(200);
  }
});

afterAll(async () => {
  await stagehand?.close();
});

describe("First-time setup wizard 11a — GitHub-only path", () => {
  test("E-O1: welcome step overlays a dimmed backdrop, progress ≈ 20%", async () => {
    expect(await countTestId("setup-wizard")).toBeGreaterThan(0);
    expect(await h.isVisibleByTestId("setup-wizard")).toBe(true);
    expect(await h.isVisibleByTestId("modal-backdrop")).toBe(true);

    expect(await testidText("wizard-step-label")).toBe("STEP 1 OF 4 · WELCOME");

    const text = await h.bodyText();
    for (const a of [
      "WELCOME TO SUPAGLOO, ASH.",
      "Let's connect a few accounts so you can save your work and generate video. It takes about a minute — you can change any of this later.",
      "GitHub",
      "— stores your projects",
      "REQUIRED",
      "OpenRouter.ai",
      "— premium models",
      "OPTIONAL",
      "Gloo AI",
      "— faith-aligned models",
      "Get started →",
    ]) {
      expect(text, `welcome anchor missing: ${a}`).toContain(a);
    }

    const ratio = await progressRatio();
    expect(ratio, `progress ratio=${ratio} (expected ≈0.20)`).toBeGreaterThan(
      0.1,
    );
    expect(ratio).toBeLessThan(0.35);
  });

  test("E-O2: 'Get started →' advances to the required GitHub step (no Skip control)", async () => {
    expect(await countTestId("wizard-get-started")).toBeGreaterThan(0);
    await clickTestId("wizard-get-started");
    await waitForStepLabel("STEP 2 OF 4 · CONNECT GITHUB");

    const text = await h.bodyText();
    for (const a of [
      "REQUIRED",
      "CONNECT YOUR GITHUB",
      "SUPAGLOO WILL BE ABLE TO",
      "Read & write repositories you choose",
      "Create new repos for new projects",
      "Never touch repos you don't select",
      "Authorize with GitHub",
      "Opens GitHub in a new tab · OAuth",
    ]) {
      expect(text, `github-step anchor missing: ${a}`).toContain(a);
    }

    // Hard gate (ambiguity #3): the required GitHub step offers NO skip.
    expect(await countTestId("wizard-skip")).toBe(0);
  });

  test("E-O3: authorizing GitHub (the gate) auto-advances to the OpenRouter step", async () => {
    expect(await countTestId("connect-authorize")).toBeGreaterThan(0);
    await clickTestId("connect-authorize");
    // mock OAuth: pending → connected → gate opens → auto-advance
    await waitForStepLabel("STEP 3 OF 4 · OPENROUTER");
  });

  test("E-O4: OpenRouter step is skippable and OMITS the PKCE callout (ambiguity #6)", async () => {
    const text = await h.bodyText();
    for (const a of [
      "RECOMMENDED",
      "ADD PREMIUM MODELS",
      "GPT-4o",
      "Claude Sonnet",
      "Gemini 2.5",
      "+ 300 more",
      "Connect with OpenRouter",
      "Skip for now →",
    ]) {
      expect(text, `openrouter-step anchor missing: ${a}`).toContain(a);
    }
    // The 🔒 PKCE callout is present ONLY in the standalone 11c modal, not here.
    expect(await countTestId("pkce-callout")).toBe(0);
    expect(text).not.toContain(PKCE_CALLOUT);

    // Skip OpenRouter → the Gloo step.
    expect(await countTestId("wizard-skip")).toBeGreaterThan(0);
    await clickTestId("wizard-skip");
    await waitForStepLabel("STEP 4 OF 4 · GLOO AI");
  });

  test("E-O5: Gloo step shows the credentials form and can be skipped to Done", async () => {
    const text = await h.bodyText();
    for (const a of [
      "RECOMMENDED",
      "GLOO AI CREDENTIALS",
      "CLIENT ID",
      "CLIENT SECRET",
      "Save & finish",
      "Open Gloo dashboard ↗",
    ]) {
      expect(text, `gloo-step anchor missing: ${a}`).toContain(a);
    }

    expect(await countTestId("wizard-skip")).toBeGreaterThan(0);
    await clickTestId("wizard-skip");
    await h.waitForText("YOU'RE ALL SET."); // the Done step (no ordinal label)
  });

  test("E-O6: Done recap reflects the ACTUAL path — GitHub connected, the rest skipped", async () => {
    const text = await h.bodyText();
    // GitHub connected (carries the mock username)...
    expect(text).toContain("✓ GitHub connected · @ashsrinivas");
    // ...OpenRouter + Gloo were SKIPPED — proving doneRecap templates from state,
    // not the wireframe's hardcoded "OpenRouter connected" row.
    expect(text).toContain("— OpenRouter skipped · add later in Profile");
    expect(text).toContain("— Gloo AI skipped · add later in Profile");
    expect(text).toContain("Go to my workspace →");

    const ratio = await progressRatio();
    expect(ratio, `done progress ratio=${ratio} (expected ≈1.0)`).toBeGreaterThan(
      0.9,
    );
  });

  test("E-O7: finishing dismisses the wizard, revealing 10a — and it is shown only once", async () => {
    expect(await countTestId("wizard-finish")).toBeGreaterThan(0);
    await clickTestId("wizard-finish");
    await h.waitForGone("setup-wizard");
    // the workspace (10a) is now revealed
    await h.waitForText("WELCOME BACK, ASH.");

    // A returning (onboarded) visit never re-shows the wizard.
    await page.goto(`${BASE_URL}/?mock=authed-returning`, { waitUntil: "load" });
    await h.waitForText("WELCOME BACK, ASH.");
    await h.waitForGone("setup-wizard");
  });
});
