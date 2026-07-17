import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";

/**
 * Turns 12a / 12b / 13a — the New-project wizard (create-new + existing-empty
 * tabs → scaffold → ready) and the Import wizard (verify happy path + the "not a
 * Supagloo project" error branch), both launched from the authed workspace (10a)
 * and both landing on `/studio/[id]`.
 *
 * DELIBERATELY Gloo-free (memory `test-harness`): NO `llmClient`, so this runs
 * even while Gloo OAuth is degraded. Every check is deterministic — glyph-exact
 * copy anchors, `data-testid` seams, `data-*` attributes, computed-style progress
 * ratios — so NO `extract`/`observe`. The wizards are pure state machines + dumb
 * views over mocked-async transitions (D-WIZARD-SPLIT / D-MODELS), nothing
 * semantic.
 *
 * Reachability: the wizards live on the authed workspace, reached via the
 * flag-gated mock session (`NEXT_PUBLIC_SUPAGLOO_DEMO=1` + `?mock=`):
 *   /?mock=authed-returning  → 10a workspace, onboarded (no 11a overlay)
 * then click the header entry points. `/studio/[id]` stays ungated (R-AUTH), so
 * the terminal-CTA navigation lands directly on the editor.
 *
 * Reuses `tests/e2e/global-setup.ts` (boots/reuses `next dev` on :3000) and the
 * shared `evaluate` helpers in `tests/e2e/helpers.ts`.
 *
 * STEP 7 STATUS: RED by construction — the workspace entry-point testids
 * (`workspace-new-project` / `workspace-import-repo`), both wizard overlays, the
 * shared primitives, and the `/studio/[id]` route do NOT exist yet, so the
 * current 10a header renders inert buttons with no testids and no wizard mounts.
 * Each test guards with a presence check so a click never throws before its
 * assertion (matches `onboarding-wizard.e2e.ts`).
 *
 * ── data-testid contract Step 9 must implement (this file is the spec) ────────
 *  Workspace wiring
 *   workspace-new-project        10a header "＋ New project" → opens the New wizard
 *   workspace-import-repo        10a header "Import repo" → opens the Import wizard
 *   recent-new-project-card      the dashed "New project" card → opens the New wizard
 *   project-open-<id>            each recent-project "Open ▸" → router.push /studio/<id>
 *  Shared modal chrome
 *   modal-backdrop               the dimmed rgba(0,0,0,.55) backdrop (click-to-close)
 *  New-project wizard (12a + 13a)
 *   new-project-wizard           the wizard panel (dismissible modal)
 *   new-project-progress         the 6px progress track
 *   new-project-progress-fill    the filled portion; width === progressFill(step)% of track
 *   new-project-eyebrow          "NEW PROJECT · STEP n OF 3" (absent on the terminal ready card)
 *   new-project-close            the step-chrome 28×28 ✕ → onClose
 *   tab-create-new               "Create new repo" segment (aria-pressed)
 *   tab-existing-empty           "Use existing empty repo" segment (aria-pressed)
 *   new-repo-name                the create-new repository-name field
 *   repo-visibility              the 🔒 Private affordance (non-functional, A4)
 *   project-name-display         the derived PROJECT NAME display
 *   repo-search                  the existing-empty search input
 *   repo-row-<shortName>         a repo row (+data-selected / +data-disabled)
 *   new-project-cta              the full-width gradient CTA (Create & scaffold → / Scaffold into this repo →)
 *   provisioning-log             the scaffolding log box
 *   log-row                      a log line (+data-status="completed|active|queued")
 *   project-ready-card           the step-3 PROJECT READY. card
 *   open-in-studio               "Open in studio →" → router.push /studio/<id>
 *  Import wizard (12b)
 *   import-wizard                the wizard panel (dismissible modal)
 *   import-progress              the 6px progress track
 *   import-progress-fill         the filled portion (50% / 88%)
 *   import-eyebrow               "IMPORT PROJECT · STEP n OF 2"
 *   import-close                 the step-chrome ✕
 *   repo-search / repo-row-<shortName>  shared repo picker (import variant, no pill)
 *   import-cta                   "Import & verify →"
 *   provisioning-log / log-row   the verifying log (reused)
 *   open-in-studio               the terminal CTA (compact variant)
 *   import-error-card            the "NOT A SUPAGLOO PROJECT" whole-screen error
 *   import-error-choose-another  "← Choose another" (outline) → back to step 1
 *   import-error-start-new       "Start new project" (gradient) → close Import, open New
 *  Studio landing
 *   studio-frame                 the /studio/[id] editor root (present after navigation)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BASE_URL = "http://localhost:3000";
const WORKSPACE_URL = `${BASE_URL}/?mock=authed-returning`;
// 10a is a 1320px fixed artifact; give the desktop layout room (matches the
// workspace-profile suite).
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
/** fill / track width ratio for a progress bar (0 if either is absent). */
async function progressRatio(track: string, fill: string): Promise<number> {
  const t = await widthOf(track);
  const f = await widthOf(fill);
  return t > 0 ? f / t : 0;
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
/** Dispatch a bubbling DOM event directly on a testid element — the understudy's
 *  center-click on the backdrop lands on the centered panel (which stops
 *  propagation), so a real backdrop-dismiss needs the event dispatched on the
 *  backdrop node itself (its `onClick` fires onClose). Same tactic as the
 *  workspace-profile suite. */
async function dispatchOn(
  testid: string,
  type: "click" | "pointerdown",
): Promise<void> {
  await page.evaluate(
    ({ id, t }) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      el?.dispatchEvent(
        t === "click"
          ? new MouseEvent("click", { bubbles: true })
          : new PointerEvent("pointerdown", { bubbles: true }),
      );
    },
    { id: testid, t: type },
  );
}
async function pressEscape(): Promise<void> {
  await page.evaluate(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
}
/** Poll until a testid is present, else throw (used only after its presence
 *  guard has already passed, so this is a settle, not the RED signal). */
async function waitForTestId(testid: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(testid)) > 0) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`[data-testid="${testid}"] never appeared within ${timeoutMs}ms`);
}
/** Poll a testid's trimmed textContent until it equals `expected`, else throw. */
async function waitForTestidText(
  testid: string,
  expected: string,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await testidText(testid);
    if (last === expected) return;
    await page.waitForTimeout(100);
  }
  throw new Error(
    `[data-testid="${testid}"] textContent never became ${JSON.stringify(expected)} within ${timeoutMs}ms (last: ${JSON.stringify(last)})`,
  );
}
/** Read every `log-row`'s status + text (for the auto-sequencing assertions). */
async function logRows(): Promise<{ status: string | null; text: string }[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="log-row"]'),
    ).map((el) => ({
      status: el.getAttribute("data-status"),
      text: (el.textContent ?? "").trim(),
    })),
  );
}
/** Poll until some `log-row` is completed AND contains `needle` (the log
 *  auto-advances on `PROVISION_ROW_DELAY_MS` ticks — never a fixed sleep). */
async function waitForCompletedLogRow(
  needle: string,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await logRows();
    if (rows.some((r) => r.status === "completed" && r.text.includes(needle)))
      return;
    await page.waitForTimeout(60);
  }
  throw new Error(
    `no completed log-row containing ${JSON.stringify(needle)} within ${timeoutMs}ms`,
  );
}
/** Poll a testid's attribute until it equals `expected`, else throw. */
async function waitForDataAttr(
  testid: string,
  attr: string,
  expected: string,
  timeoutMs = 5000,
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
async function waitForUrlIncludes(
  fragment: string,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = page.url();
    if (last.includes(fragment)) return;
    await page.waitForTimeout(100);
  }
  throw new Error(
    `URL never included ${JSON.stringify(fragment)} within ${timeoutMs}ms (last: ${last})`,
  );
}
/** Navigate to the authed workspace and settle past the SessionProvider
 *  mount-gate. The workspace itself exists today, so this resolves even on Step 7
 *  RED — it's the wizard entry points / overlays that are missing. */
async function gotoWorkspace(): Promise<void> {
  await page.goto(WORKSPACE_URL, { waitUntil: "load" });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if ((await countTestId("workspace-home")) > 0) return;
    await page.waitForTimeout(200);
  }
}

beforeAll(async () => {
  stagehand = new Stagehand({ env: "LOCAL", verbose: 1 }); // Gloo-free
  await stagehand.init();
  page = stagehand.context.pages()[0];
  h = makeHelpers(page);
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  await gotoWorkspace();
});

afterAll(async () => {
  await stagehand?.close();
});

describe("New-project wizard (12a create-new)", () => {
  test("E-NP1: opens over a dimmed backdrop on step 1 (create-new tab active)", async () => {
    await gotoWorkspace();
    expect(await countTestId("workspace-new-project")).toBeGreaterThan(0);
    await clickTestId("workspace-new-project");
    await waitForTestId("new-project-wizard");

    expect(await h.isVisibleByTestId("new-project-wizard")).toBe(true);
    expect(await h.isVisibleByTestId("modal-backdrop")).toBe(true);
    expect(await testidText("new-project-eyebrow")).toBe(
      "NEW PROJECT · STEP 1 OF 3",
    );

    const ratio = await progressRatio(
      "new-project-progress",
      "new-project-progress-fill",
    );
    expect(ratio, `progress ratio=${ratio} (expected ≈0.33)`).toBeGreaterThan(
      0.2,
    );
    expect(ratio).toBeLessThan(0.5);

    // create-new tab is the default active segment
    expect(await dataAttr("tab-create-new", "aria-pressed")).toBe("true");

    const text = await h.bodyText();
    for (const a of [
      "WHERE SHOULD THIS PROJECT LIVE?",
      "Pick an empty GitHub repo, or create a new one. This becomes the source of truth for your project.",
      "NEW REPOSITORY NAME",
      "ashsrinivas /",
      "psalm-121",
      "🔒 Private",
      "PROJECT NAME",
      "Create & scaffold →",
    ]) {
      expect(text, `E-NP1 anchor missing: ${a}`).toContain(a);
    }
  });

  test("E-NP2: the CTA auto-sequences the scaffolding log, then the ready card opens the studio", async () => {
    await gotoWorkspace();
    expect(await countTestId("workspace-new-project")).toBeGreaterThan(0);
    await clickTestId("workspace-new-project");
    await waitForTestId("new-project-wizard");

    // the create-new repo name is pre-filled to psalm-121, so the CTA scaffolds
    expect(await countTestId("new-project-cta")).toBeGreaterThan(0);
    await clickTestId("new-project-cta");

    // step 2 — scaffolding log
    await waitForTestidText("new-project-eyebrow", "NEW PROJECT · STEP 2 OF 3");
    const r2 = await progressRatio(
      "new-project-progress",
      "new-project-progress-fill",
    );
    expect(r2, `step-2 ratio=${r2} (expected ≈0.66)`).toBeGreaterThan(0.5);
    expect(r2).toBeLessThan(0.8);
    expect(await countTestId("provisioning-log")).toBeGreaterThan(0);
    expect(await countTestId("log-row")).toBe(7); // create-new = 7 lines

    const step2 = await h.bodyText();
    for (const a of [
      "SCAFFOLDING",
      "PSALM-121",
      "Created repo ashsrinivas/psalm-121",
      "main stays clean & released", // the footnote (anchored in pieces)
      "you always edit on the newest",
    ]) {
      expect(step2, `E-NP2 step-2 anchor missing: ${a}`).toContain(a);
    }
    // the log actually advances (first row completes as it sequences)
    await waitForCompletedLogRow("Created repo ashsrinivas/psalm-121");

    // step 3 — the terminal ready card
    await waitForTestId("project-ready-card");
    const step3 = await h.bodyText();
    for (const a of [
      "PROJECT READY.",
      "You're editing on branch",
      "v0.0.1",
      "→ supagloo.com/studio/psalm-121",
    ]) {
      expect(step3, `E-NP2 ready anchor missing: ${a}`).toContain(a);
    }

    // "Open in studio →" navigates to /studio/psalm-121
    expect(await countTestId("open-in-studio")).toBeGreaterThan(0);
    await clickTestId("open-in-studio");
    await waitForUrlIncludes("/studio/psalm-121");
    await waitForTestId("studio-frame");
  });
});

describe("New-project wizard (13a use existing empty repo)", () => {
  test("E-NP3: the existing-empty tab gates scaffolding on repo emptiness", async () => {
    await gotoWorkspace();
    expect(await countTestId("workspace-new-project")).toBeGreaterThan(0);
    await clickTestId("workspace-new-project");
    await waitForTestId("new-project-wizard");

    expect(await countTestId("tab-existing-empty")).toBeGreaterThan(0);
    await clickTestId("tab-existing-empty");
    // the active segment flips
    await waitForDataAttr("tab-existing-empty", "aria-pressed", "true");
    expect(await dataAttr("tab-create-new", "aria-pressed")).toBe("false");

    // the searchable repo list appears
    expect(await countTestId("repo-search")).toBeGreaterThan(0);

    // psalm-121 is EMPTY → selectable; genesis-light is NOT EMPTY → disabled
    expect(await dataAttr("repo-row-psalm-121", "data-disabled")).not.toBe(
      "true",
    );
    expect(await dataAttr("repo-row-genesis-light", "data-disabled")).toBe(
      "true",
    );

    const text = await h.bodyText();
    expect(text, "EMPTY pill").toContain("EMPTY");
    expect(text, "NOT EMPTY pill").toContain("NOT EMPTY");

    // clicking the disabled row must NOT select it
    await clickTestId("repo-row-genesis-light");
    await page.waitForTimeout(150);
    expect(await dataAttr("repo-row-genesis-light", "data-selected")).not.toBe(
      "true",
    );

    // this tab's CTA reads differently (contrast E-NP1's "Create & scaffold →")
    expect(await testidText("new-project-cta")).toContain(
      "Scaffold into this repo →",
    );

    // selecting the empty repo marks it selected (→ CTA becomes actionable)
    await clickTestId("repo-row-psalm-121");
    await page.waitForTimeout(150);
    expect(await dataAttr("repo-row-psalm-121", "data-selected")).toBe("true");

    // NB: the "existing-empty drops the 'Created repo' log row" gap (the A/13a
    // gap) is locked deterministically in provisioning-log.test.ts (U-PL2), so
    // it is not re-driven through the flaky auto-sequencing log here.
  });
});

describe("Import wizard (12b)", () => {
  test("E-IMP1: verifies a Supagloo repo and opens the studio at its latest branch", async () => {
    await gotoWorkspace();
    expect(await countTestId("workspace-import-repo")).toBeGreaterThan(0);
    await clickTestId("workspace-import-repo");
    await waitForTestId("import-wizard");

    expect(await testidText("import-eyebrow")).toBe(
      "IMPORT PROJECT · STEP 1 OF 2",
    );
    const ratio = await progressRatio("import-progress", "import-progress-fill");
    expect(ratio, `import step-1 ratio=${ratio} (expected ≈0.50)`).toBeGreaterThan(
      0.4,
    );
    expect(ratio).toBeLessThan(0.7);

    const text = await h.bodyText();
    for (const a of [
      "IMPORT AN EXISTING PROJECT",
      "Choose a GitHub repo that already contains a Supagloo project.",
      "Updated 5 days ago · latest branch v0.2.3", // exodus row, no pill
    ]) {
      expect(text, `E-IMP1 anchor missing: ${a}`).toContain(a);
    }

    // select exodus-red-sea → Import & verify →
    expect(await countTestId("repo-row-exodus-red-sea")).toBeGreaterThan(0);
    await clickTestId("repo-row-exodus-red-sea");
    await page.waitForTimeout(150);
    expect(await countTestId("import-cta")).toBeGreaterThan(0);
    await clickTestId("import-cta");

    // step 2 — verifying
    await waitForTestidText("import-eyebrow", "IMPORT PROJECT · STEP 2 OF 2");
    const r2 = await progressRatio("import-progress", "import-progress-fill");
    expect(r2, `import step-2 ratio=${r2} (expected ≈0.88)`).toBeGreaterThan(0.7);
    const step2 = await h.bodyText();
    for (const a of [
      "VERIFYING",
      "EXODUS-RED-SEA",
      "Found valid Remotion project · remotion.config.ts",
      "Latest version branch v0.2.3",
    ]) {
      expect(step2, `E-IMP1 step-2 anchor missing: ${a}`).toContain(a);
    }

    // terminal CTA → /studio/exodus-red-sea
    await waitForTestId("open-in-studio");
    await clickTestId("open-in-studio");
    await waitForUrlIncludes("/studio/exodus-red-sea");
    await waitForTestId("studio-frame");
  });

  test("E-IMP2: a non-Supagloo repo shows the error card; both recovery paths work", async () => {
    await gotoWorkspace();
    expect(await countTestId("workspace-import-repo")).toBeGreaterThan(0);
    await clickTestId("workspace-import-repo");
    await waitForTestId("import-wizard");

    // select notes-app (isSupaglooProject === false) → verify → error
    expect(await countTestId("repo-row-notes-app")).toBeGreaterThan(0);
    await clickTestId("repo-row-notes-app");
    await page.waitForTimeout(150);
    await clickTestId("import-cta");

    await waitForTestId("import-error-card");
    const text = await h.bodyText();
    for (const a of [
      "IMPORT FAILED",
      "NOT A SUPAGLOO PROJECT",
      "ashsrinivas/notes-app",
      "doesn't contain a Remotion project (no", // anchored in pieces around the mono span
      "remotion.config.ts",
      "or version branch)",
    ]) {
      expect(text, `E-IMP2 anchor missing: ${a}`).toContain(a);
    }
    expect(await countTestId("import-error-choose-another")).toBeGreaterThan(0);
    expect(await countTestId("import-error-start-new")).toBeGreaterThan(0);

    // "← Choose another" returns to step 1
    await clickTestId("import-error-choose-another");
    await waitForTestidText("import-eyebrow", "IMPORT PROJECT · STEP 1 OF 2");

    // re-trigger the error, then "Start new project" hands off to the New wizard
    await clickTestId("repo-row-notes-app");
    await page.waitForTimeout(150);
    await clickTestId("import-cta");
    await waitForTestId("import-error-card");
    await clickTestId("import-error-start-new");
    await h.waitForGone("import-wizard");
    await waitForTestId("new-project-wizard");
  });
});

describe("Wizard dismissal", () => {
  test("E-DISMISS: the New-project wizard is dismissible (✕ / Escape / backdrop)", async () => {
    // ✕ close
    await gotoWorkspace();
    expect(await countTestId("workspace-new-project")).toBeGreaterThan(0);
    await clickTestId("workspace-new-project");
    await waitForTestId("new-project-wizard");
    expect(await countTestId("new-project-close")).toBeGreaterThan(0);
    await clickTestId("new-project-close");
    await h.waitForGone("new-project-wizard");

    // Escape
    await clickTestId("workspace-new-project");
    await waitForTestId("new-project-wizard");
    await pressEscape();
    await h.waitForGone("new-project-wizard");

    // backdrop click (dispatched on the backdrop node — see dispatchOn)
    await clickTestId("workspace-new-project");
    await waitForTestId("new-project-wizard");
    await dispatchOn("modal-backdrop", "click");
    await h.waitForGone("new-project-wizard");
  });
});
