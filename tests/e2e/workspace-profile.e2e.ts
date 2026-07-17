import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { makeHelpers, type E2EHelpers, type StagehandPage } from "./helpers";

/**
 * Turn 10/11 — Workspace (10a) + Profile & Connections (10b) + the standalone
 * Connect GitHub (11b) / Connect OpenRouter (11c) modals.
 *
 * DELIBERATELY Gloo-free: constructed with NO `llmClient`, so `init/goto/
 * evaluate/locator/setViewportSize` all work even while Gloo OAuth is degraded
 * (memory `test-harness`). Everything here is deterministic — glyph-exact copy
 * anchors, `data-testid` seams, `data-status` attributes, computed styles — so
 * NO `extract`/`observe` (the LLM path). Nothing on these screens is semantic.
 *
 * Reachability: the signed-in UI is normally gated behind real YouVersion OAuth,
 * which Stagehand cannot complete. So a flag-gated mock-session seam (plan
 * D-AUTH) lets `?mock=<scenario>` force a deterministic signed-in session in
 * demo mode. Scenarios used here:
 *   /?mock=authed-returning         → 10a workspace, onboarded, wireframe seed
 *   /profile?mock=authed-returning  → 10b, github+openrouter connected, gloo not-linked
 *   /profile?mock=authed-unlinked   → 10b, all three not-linked (Connect buttons)
 *
 * Reuses `tests/e2e/global-setup.ts` (boots/reuses `next dev` on :3000) and the
 * shared `evaluate` helpers in `tests/e2e/helpers.ts`.
 *
 * STEP 7 STATUS: RED by construction — the mock-session seam, `/profile`, and
 * every `data-testid` below do not exist yet, so `/?mock=…` renders the current
 * public landing and `/profile` 404s. Each test guards with a presence check so
 * clicks never throw before their assertion. (E-W1 is the regression control and
 * PASSES both before and after Step 9 — it proves D-ROUTE never breaks 7a/8a.)
 *
 * ── data-testid contract Step 9 must implement (this file is the spec) ────────
 *   workspace-home            10a island container (mount-gated seam)
 *   workspace-profile-pill    10a nav profile pill (opens the dropdown)
 *   profile-menu              the nav dropdown container
 *   menu-account-settings     "Account settings" item → navigates to /profile
 *   profile-page              10b island container (mount-gated seam)
 *   connection-card-github|openrouter|gloo   one card each, carrying data-status
 *                             ("connected" | "not-linked" | "pending")
 *   card-connect-github       Connect button on the not-linked github card → 11b
 *   card-connect-openrouter   Connect button on the not-linked openrouter card → 11c
 *   disconnect-github|openrouter|gloo   Disconnect button on a connected card
 *   gloo-secret               CLIENT SECRET input (type="password", reveal→"text")
 *   gloo-reveal               the 👁 reveal toggle
 *   gloo-save                 "Save & verify" (10b) / "Save & finish" (wizard)
 *   connect-github-modal      11b modal container
 *   connect-openrouter-modal  11c modal container
 *   modal-backdrop            dimmed backdrop (click-to-close for dismissible modals)
 *   modal-close               the ✕ close button
 *   connect-authorize         "Authorize with GitHub" (shared: 11b + wizard github)
 *   connect-openrouter-submit "Connect with OpenRouter" (shared: 11c + wizard openrouter)
 *   pkce-callout              the 🔒 PKCE callout (present in 11c; absent in wizard step)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BASE_URL = "http://localhost:3000";
// 10a is a 1320px fixed artifact; give the desktop layout room (matches the
// landing suite's ≥lg desktop viewport, chrome-launcher's ~1288 default).
const VIEWPORT = { width: 1440, height: 1000 };

let stagehand: Stagehand;
let page: StagehandPage;
let h: E2EHelpers;

async function count(css: string): Promise<number> {
  return page.locator(css).count();
}
async function countTestId(testid: string): Promise<number> {
  return count(`[data-testid="${testid}"]`);
}
async function clickTestId(testid: string): Promise<void> {
  await page.locator(`[data-testid="${testid}"]`).click();
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
/** Poll `data-status` on a card until it equals `expected`, else throw. */
async function waitForStatus(
  testid: string,
  expected: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: string | null = null;
  while (Date.now() < deadline) {
    last = await dataAttr(testid, "data-status");
    if (last === expected) return;
    await page.waitForTimeout(80);
  }
  throw new Error(
    `[data-testid="${testid}"] data-status="${last}" never became "${expected}" within ${timeoutMs}ms`,
  );
}
/** Dispatch a bubbling DOM event directly on a testid element (deterministic —
 *  avoids the understudy's center-click landing on the panel over a backdrop). */
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
/**
 * Navigate to a mock URL and wait past the SessionProvider mount-gate by polling
 * for `seam` (up to `timeoutMs`). Returns whether the seam appeared. On Step 7
 * RED the seam never appears — we return false (not throw) so the per-test
 * presence guard reports the missing seam as a clean assertion, not a hook error.
 */
async function gotoMock(
  url: string,
  seam: string,
  timeoutMs = 15_000,
): Promise<boolean> {
  await page.goto(url, { waitUntil: "load" });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(seam)) > 0) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

// ── Glyph-exact copy anchors, byte-for-byte from scratch/design/turn10a.raw.html
//    and turn10b.raw.html (＋ U+FF0B, · U+00B7, — U+2014, ▸ U+25B8, ▾ U+25BE,
//    • U+2022, ↗ U+2197, "&amp;" → "&"). Nested-<b> copy is anchored in pieces so
//    inter-node whitespace can't break a match.
const ANCHORS_10A: readonly string[] = [
  "YOUR WORKSPACE",
  "WELCOME BACK, ASH.",
  "＋ New project",
  "Import repo",
  "Gallery",
  "How it works",
  "Ash Srinivas",
  // provider status strip
  "@ashsrinivas · connected",
  "Premium models · connected",
  "Not linked — add credentials",
  "Link ▸",
  // recent projects
  "RECENT PROJECTS",
  "Sorted by last opened ▾",
  "Let There Be Light",
  "ashsrinivas/genesis-light",
  "RENDERED",
  "Opened 2h ago",
  "The Lord Is My Shepherd",
  "ashsrinivas/psalm-23",
  "Opened yesterday",
  "Blessed Are They",
  "ashsrinivas/beatitudes",
  "Opened 3 days ago",
  "GENESIS · LIGHT",
  "PSALM 23",
  "BEATITUDES",
  // new-project card
  "New project",
  "Start from a verse or a demo",
  // info bar (pieces)
  "Projects live in",
  "your GitHub repos",
  "Nothing is stored on our servers.",
];

const ANCHORS_10B: readonly string[] = [
  "CONNECTED ACCOUNTS",
  "Link the services Supagloo uses to store your projects and run AI models. You control every connection.",
  "ASH SRINIVAS",
  "ash@supagloo.com · signed in with YouVersion",
  "← Workspace",
  "Sign out",
  // github (connected)
  "GitHub",
  "Connected",
  "temporary Railway workspace",
  "@ashsrinivas",
  "· 12 repos accessible",
  "Disconnect",
  // openrouter (connected via PKCE)
  "OpenRouter.ai",
  "PKCE OAUTH",
  "sk-or-••••••4f2a",
  "$18.40 credit remaining",
  // gloo (not linked — inline form)
  "Gloo AI",
  "Not linked",
  "CLIENT CREDENTIALS",
  "gloo_client_id…",
  "Save & verify",
  "Open Gloo dashboard ↗",
  // privacy note (pieces)
  "All tokens & secrets are encrypted at rest.",
  "100% free",
  "you only ever pay your own model providers.",
];

const ANCHORS_11B: readonly string[] = [
  "CONNECT ACCOUNT",
  "CONNECT YOUR GITHUB",
  "Every project is a GitHub repo — the source of truth. We clone it to a temporary Railway workspace when you open it, and push your changes back.",
  "SUPAGLOO WILL BE ABLE TO",
  "Read & write repositories you choose",
  "Create new repos for new projects",
  "Never touch repos you don't select",
  "Authorize with GitHub",
  "Opens GitHub in a new tab · OAuth",
  "✕",
];

const ANCHORS_11C: readonly string[] = [
  "CONNECT ACCOUNT",
  "ADD PREMIUM MODELS",
  "Connect OpenRouter to use GPT, Claude & Gemini with your own credits. Uses secure PKCE OAuth — you approve on OpenRouter and no key is ever pasted here.",
  "GPT-4o",
  "Claude Sonnet",
  "Gemini 2.5",
  "+ 300 more",
  "Connect with OpenRouter",
  "Opens OpenRouter in a new tab · PKCE OAuth",
];

const PKCE_CALLOUT =
  "PKCE means the token is exchanged directly between your browser and OpenRouter — Supagloo never sees your password or a long-lived key.";

beforeAll(async () => {
  // No llmClient on purpose — deterministic DOM checks only (Gloo-free).
  stagehand = new Stagehand({ env: "LOCAL", verbose: 1 });
  await stagehand.init();
  page = stagehand.context.pages()[0];
  h = makeHelpers(page);
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
});

afterAll(async () => {
  await stagehand?.close();
});

describe("Workspace 10a + regression", () => {
  test("E-W1: signed-out / still renders the public landing (regression guard)", async () => {
    // Regression control: D-ROUTE must not break 7a/8a. This PASSES before and
    // after Step 9 — signed-out `/` always server-renders the marketing landing.
    await page.goto(BASE_URL, { waitUntil: "load" });
    await h.waitForText("Supagloo");
    // Wait past the landing's own mount-gate (its bespoke nav sign-in control).
    await page.waitForSelector('[data-testid="signin-nav"]', {
      state: "visible",
      timeout: 20_000,
    });
    const text = await h.bodyText();
    expect(text).toContain("TURN SCRIPTURE INTO");
    expect(text).toContain("CINEMATIC VIDEO.");
    // The signed-in workspace header must be ABSENT on the public landing.
    expect(text).not.toContain("WELCOME BACK, ASH.");
    expect(await countTestId("workspace-home")).toBe(0);
  });

  test("E-W2: /?mock=authed-returning renders 10a with no wizard overlay", async () => {
    const ready = await gotoMock(
      `${BASE_URL}/?mock=authed-returning`,
      "workspace-home",
    );
    expect(ready, "workspace-home never mounted").toBe(true);

    const text = await h.bodyText();
    const missing = ANCHORS_10A.filter((a) => !text.includes(a));
    expect(missing, `Missing 10a anchors: ${JSON.stringify(missing)}`).toEqual(
      [],
    );

    // An onboarded returning user does NOT see the first-time wizard.
    await h.waitForGone("setup-wizard");
  });

  test("E-W3: the nav profile menu routes 'Account settings' to /profile", async () => {
    const ready = await gotoMock(
      `${BASE_URL}/?mock=authed-returning`,
      "workspace-profile-pill",
    );
    expect(ready, "workspace-profile-pill missing").toBe(true);

    await clickTestId("workspace-profile-pill");
    await page.waitForSelector('[data-testid="profile-menu"]', {
      state: "visible",
      timeout: 5000,
    });
    expect(await countTestId("menu-account-settings")).toBeGreaterThan(0);

    await clickTestId("menu-account-settings");
    await waitForUrlIncludes("/profile");
    await h.waitForText("CONNECTED ACCOUNTS"); // 10b landed
  });
});

describe("Profile & connections 10b", () => {
  test("E-W4: /profile?mock=authed-returning renders every 10b anchor", async () => {
    const ready = await gotoMock(
      `${BASE_URL}/profile?mock=authed-returning`,
      "profile-page",
    );
    expect(ready, "profile-page never mounted (route 404s pre-Step-9)").toBe(
      true,
    );

    const text = await h.bodyText();
    const missing = ANCHORS_10B.filter((a) => !text.includes(a));
    expect(missing, `Missing 10b anchors: ${JSON.stringify(missing)}`).toEqual(
      [],
    );
  });

  test("E-W5: Gloo connects inline — reveal toggles masking, save runs pending → connected", async () => {
    const ready = await gotoMock(
      `${BASE_URL}/profile?mock=authed-returning`,
      "connection-card-gloo",
    );
    expect(ready, "gloo card missing").toBe(true);

    // reveal toggles the CLIENT SECRET input between masked + shown
    expect(await countTestId("gloo-secret")).toBeGreaterThan(0);
    expect(await dataAttr("gloo-secret", "type")).toBe("password");
    await clickTestId("gloo-reveal");
    expect(await dataAttr("gloo-secret", "type")).toBe("text");
    await clickTestId("gloo-reveal");
    expect(await dataAttr("gloo-secret", "type")).toBe("password");

    // save → the mock OAuth transition: synchronous pending, then connected
    expect(await dataAttr("connection-card-gloo", "data-status")).toBe(
      "not-linked",
    );
    await clickTestId("gloo-save");
    expect(await dataAttr("connection-card-gloo", "data-status")).toBe(
      "pending",
    );
    await waitForStatus("connection-card-gloo", "connected");
    // now the connected gloo card offers Disconnect
    expect(await countTestId("disconnect-gloo")).toBeGreaterThan(0);
  });

  test("E-W8: disconnecting GitHub flips the card back to not-linked + Connect", async () => {
    const ready = await gotoMock(
      `${BASE_URL}/profile?mock=authed-returning`,
      "connection-card-github",
    );
    expect(ready, "github card missing").toBe(true);

    expect(await dataAttr("connection-card-github", "data-status")).toBe(
      "connected",
    );
    await clickTestId("disconnect-github");
    await waitForStatus("connection-card-github", "not-linked");
    // symmetry (ambiguity #5): a not-linked github card offers Connect (→ 11b)
    expect(await countTestId("card-connect-github")).toBeGreaterThan(0);
  });
});

describe("Standalone connect modals 11b / 11c", () => {
  test("E-W6: 11b — Connect GitHub modal authorizes, then closes with the card connected", async () => {
    const ready = await gotoMock(
      `${BASE_URL}/profile?mock=authed-unlinked`,
      "card-connect-github",
    );
    expect(ready, "not-linked github Connect button missing").toBe(true);

    await clickTestId("card-connect-github");
    await page.waitForSelector('[data-testid="connect-github-modal"]', {
      state: "visible",
      timeout: 5000,
    });

    const text = await h.bodyText();
    const missing = ANCHORS_11B.filter((a) => !text.includes(a));
    expect(missing, `Missing 11b anchors: ${JSON.stringify(missing)}`).toEqual(
      [],
    );

    // authorize → synchronous pending, poll to connected, modal auto-closes
    await clickTestId("connect-authorize");
    expect(await dataAttr("connection-card-github", "data-status")).toBe(
      "pending",
    );
    await waitForStatus("connection-card-github", "connected");
    await h.waitForGone("connect-github-modal");
    expect(await countTestId("disconnect-github")).toBeGreaterThan(0);
  });

  test("E-W7: 11c — Connect OpenRouter modal shows the PKCE callout and dismisses three ways", async () => {
    const ready = await gotoMock(
      `${BASE_URL}/profile?mock=authed-unlinked`,
      "card-connect-openrouter",
    );
    expect(ready, "not-linked openrouter Connect button missing").toBe(true);

    // open + assert content, including the 🔒 PKCE callout (PRESENT here; E-O4
    // asserts it is ABSENT from the leaner wizard step — ambiguity #6).
    await clickTestId("card-connect-openrouter");
    await page.waitForSelector('[data-testid="connect-openrouter-modal"]', {
      state: "visible",
      timeout: 5000,
    });
    const text = await h.bodyText();
    const missing = ANCHORS_11C.filter((a) => !text.includes(a));
    expect(missing, `Missing 11c anchors: ${JSON.stringify(missing)}`).toEqual(
      [],
    );
    expect(await countTestId("pkce-callout")).toBeGreaterThan(0);
    expect(text).toContain(PKCE_CALLOUT);

    // (1) ✕ closes
    await clickTestId("modal-close");
    await h.waitForGone("connect-openrouter-modal");

    // (2) Escape closes
    await clickTestId("card-connect-openrouter");
    await page.waitForSelector('[data-testid="connect-openrouter-modal"]', {
      state: "visible",
      timeout: 5000,
    });
    await pressEscape();
    await h.waitForGone("connect-openrouter-modal");

    // (3) backdrop click closes (dispatch on the backdrop element itself so the
    // event target is the backdrop, not the centered panel over it)
    await clickTestId("card-connect-openrouter");
    await page.waitForSelector('[data-testid="connect-openrouter-modal"]', {
      state: "visible",
      timeout: 5000,
    });
    await dispatchOn("modal-backdrop", "click");
    await h.waitForGone("connect-openrouter-modal");
  });
});
