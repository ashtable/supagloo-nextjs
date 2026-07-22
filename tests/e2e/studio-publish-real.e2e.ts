import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { type StagehandPage } from "./helpers";
import {
  completeGithubConnectViaCallback,
  completeCreateRepoViaCallback,
} from "./connect-helpers";

/**
 * Task #28 — the REAL-STACK Publish wizard + version dropdown, exercised end to end
 * (browser → BFF routes → supagloo-nodejs-api → Postgres + github-stub + git-server →
 * the DBOS git-ops PUBLISH worker) via the `?seed=` seam (design-delta §5.3 row 7).
 * This is the real counterpart of the mock publish spec (`studio-publish.e2e.ts`),
 * which stays green untouched (the catalog id `psalm-121` in a demo build resolves to
 * the bundled DEMO_STORYBOARD synchronously — the unchanged server-rendered mock path
 * with the wireframe-literal TWO-step bump).
 *
 * Where the mock spec drives a mocked pending→settled PR dance + two-step version
 * math, THIS spec proves: Publish hits the real `POST /v1/projects/:id/publish
 * { message }`, the wizard renders the polled 7-stage `ProjectJob` log, the success
 * card reflects the REAL Model-A ONE-step bump ("v0.0.1 PUBLISHED … editing on
 * v0.0.2"), and the version dropdown is derived from `GET /v1/projects/:id/versions`
 * (real states, LIVE ON MAIN badge, restore).
 *
 * ── EXECUTION NOTE (release-step harness) ────────────────────────────────────
 * Running this spec requires the FULL real stack:
 *   1. `next dev` on :3000 (global-setup spawns/reuses it);
 *   2. a locally-built API (`node dist/server.js`, db-lib `dist/` copied into the API
 *      submodule checkout) + the studio env (GITHUB_* → github-stub, git-server);
 *   3. a running DBOS git-ops PUBLISH worker (the 7-stage merge→tag→cut-next dance
 *      against the github-stub + git-server) so the publish job reaches `succeeded`
 *      and `Project.currentBranch` advances to the next working branch.
 * Standing up that multi-service git-ops worker is the release-step harness's job, so
 * — exactly like the sibling `studio-hydration.e2e.ts` + `project-wizards-real.e2e.ts`
 * — this spec is WRITTEN + typechecked and its EXECUTION is DEFERRED to that harness.
 * Behavior is proven meanwhile by the nextjs unit suite: the wire-contract pins
 * (`lib/api/contracts.test.ts`), the real-mode version-list mapper
 * (`lib/studio/version-history.test.ts` — `versionRowsFromDtos`), the publish/versions
 * effects (`lib/studio/studio-data.test.ts`), and the reducer real-publish transitions
 * + `publishOutcome` (`lib/studio/reducer.test.ts`). This file is the committed
 * executable spec the release step runs green; it is never reported as a false green.
 *
 * DELIBERATELY Gloo-free + deterministic (testid + `evaluate` + `data-*`, NOT
 * act/extract/observe — those need the Gloo LLM client the harness keeps degraded;
 * every prior studio + real-stack spec follows this convention). Per-run nonce.
 */

const BASE_URL = "http://localhost:3000";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SEED_URL = `${BASE_URL}/?seed=authed-returning&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

let stagehand: Stagehand;
let page: StagehandPage;

function countTestId(id: string) {
  return page.locator(`[data-testid="${id}"]`).count();
}
function clickTestId(id: string) {
  return page.locator(`[data-testid="${id}"]`).click();
}
async function testidText(id: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${sel}"]`);
    return (el?.textContent ?? "").trim();
  }, id);
}
async function dataAttrAll(id: string, attr: string): Promise<string[]> {
  return page.evaluate(
    ({ sel, a }) =>
      Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${sel}"]`)).map(
        (el) => el.getAttribute(a) ?? "",
      ),
    { sel: id, a: attr },
  );
}
async function waitForTestId(id: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(id)) > 0) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`[data-testid="${id}"] never appeared within ${timeoutMs}ms`);
}
async function waitForTestidTextContains(id: string, needle: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await testidText(id);
    if (last.includes(needle)) return;
    await page.waitForTimeout(250);
  }
  throw new Error(
    `[data-testid="${id}"] text never contained ${JSON.stringify(needle)} within ${timeoutMs}ms (last: ${JSON.stringify(last)})`,
  );
}
async function waitForUrlIncludes(fragment: string, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = page.url();
    if (last.includes(fragment)) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`URL never included ${JSON.stringify(fragment)} (last: ${last})`);
}
async function gotoWorkspace(url = SEED_URL) {
  await page.goto(url, { waitUntil: "load" });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if ((await countTestId("workspace-home")) > 0) return;
    await page.waitForTimeout(250);
  }
  throw new Error("workspace-home never rendered (is the API up + seed enabled?)");
}

/** Create a fresh real project via the create-new JIT hop and return its studio slug. */
async function createProjectAndOpenStudio(repoName: string): Promise<string> {
  await gotoWorkspace();
  await waitForTestId("workspace-new-project");
  await clickTestId("workspace-new-project");
  await waitForTestId("new-project-wizard");
  await page.evaluate((name) => {
    const el = document.querySelector<HTMLInputElement>('[data-testid="new-repo-name"]');
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(el, name);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, repoName);
  await clickTestId("new-project-cta");
  await completeCreateRepoViaCallback(page, stagehand.context);
  await waitForTestId("project-ready-card", 120_000);
  await clickTestId("open-in-studio");
  await waitForUrlIncludes("/studio/");
  return page.url().split("/studio/")[1]?.split(/[?#]/)[0] ?? "";
}

beforeAll(async () => {
  stagehand = new Stagehand({ env: "LOCAL", verbose: 1 }); // Gloo-free
  await stagehand.init();
  page = stagehand.context.pages()[0];
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  await gotoWorkspace();
  await completeGithubConnectViaCallback(stagehand.context, { installationId: "42" });
}, 120_000);

afterAll(async () => {
  await stagehand?.close();
});

describe("Publish a REAL project → real endpoint + polled stages + Model-A one-step bump", () => {
  test("E-PUBR1: publish v0.0.1 → success card 'editing on v0.0.2'; dropdown shows published + new working", async () => {
    const slug = await createProjectAndOpenStudio(`publish-${RUN_ID}`);
    expect(slug.length).toBeGreaterThan(0);

    // The editor mounted from the REAL project. A freshly-scaffolded manifest is empty,
    // but the TopBar (identity / chip / Publish) is always present, so publish is reachable.
    await waitForTestId("studio-frame");
    expect(await testidText("studio-repo-path")).toContain(`/publish-${RUN_ID}`);
    expect(await testidText("version-branch-chip")).toContain("v0.0.1");

    // Open the Publish wizard's review step, then confirm → the REAL endpoint.
    await clickTestId("publish-button");
    await waitForTestId("publish-wizard");
    await waitForTestId("publish-review");
    await clickTestId("publish-confirm");

    // Step 2 renders the polled 7-stage publish job log (real stage labels, not the
    // mock PR-dance copy). Assert at least one real stage label appears.
    await waitForTestId("publishing-log", 30_000);
    await waitForTestidTextContains("publishing-log", "GitHub", 30_000);

    // Step 3 — the real Model-A one-step bump: v0.0.1 published, now editing on v0.0.2.
    await waitForTestId("publish-published-card", 180_000);
    const card = await testidText("publish-published-card");
    expect(card).toContain("v0.0.1 PUBLISHED");
    expect(card).toContain("v0.0.2"); // now editing on the new working branch
    expect(await countTestId("publish-error")).toBe(0);

    // Close → the top bar reflects the new working branch.
    await clickTestId("publish-close");
    await waitForTestidTextContains("version-branch-chip", "v0.0.2", 15_000);

    // The version dropdown is derived from GET /versions: working v0.0.2, live v0.0.1
    // (LIVE ON MAIN), template v0.0.0.
    await clickTestId("version-menu-trigger");
    await waitForTestId("version-menu");
    await waitForTestId("version-row", 15_000);
    const byBranch = await page.evaluate(() =>
      Object.fromEntries(
        Array.from(document.querySelectorAll<HTMLElement>('[data-testid="version-row"]')).map(
          (el) => [el.getAttribute("data-branch") ?? "", el.getAttribute("data-state") ?? ""],
        ),
      ),
    );
    expect(byBranch["v0.0.2"]).toBe("working");
    expect(byBranch["v0.0.1"]).toBe("live");
    expect(await testidText("version-live-pill")).toContain("LIVE ON MAIN");

    const states = await dataAttrAll("version-row", "data-state");
    expect(states).toContain("template"); // the v0.0.0 base floor
  }, 300_000);
});
