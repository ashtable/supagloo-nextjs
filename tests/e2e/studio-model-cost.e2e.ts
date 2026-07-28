import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { type StagehandPage } from "./helpers";
import {
  completeGithubConnectViaCallback,
  connectOpenRouterViaProfile,
} from "./connect-helpers";
import {
  createProjectViaExistingEmptyRepo,
  resolveInstallationId,
} from "./github-e2e";

/**
 * Genesis-1 Inspector — the model/provider selectors, the faith-alignment control and the
 * cost estimate, end to end (browser → BFF → the containerised api → LIVE OpenRouter and
 * LIVE Gloo catalogues → back).
 *
 * ── What only this lane can prove ──────────────────────────────────────────────────
 * The rules are unit-proven (`lib/studio/ai-settings.test.ts`, `cost-estimate.test.ts`)
 * and the api's normalization is unit-proven with an injected fetch. None of that can
 * show that the numbers and options on screen came from the REAL catalogues — and that
 * is the whole claim of items 1 and 3. A cost estimate computed from a fixture is not an
 * estimate of anything.
 *
 * §10.2/§11.2: an e2e either exercises the real provider or does not exercise that
 * provider at all. There are no stubs; simulated failures (empty catalogue, dead
 * upstream, missing connection, absent pricing) are UNIT tests with an injected fetch,
 * per §10.6.
 *
 * ── Secrets fail FAST, never skip (§10.8) ──────────────────────────────────────────
 * `GLOO_CONNECT_CLIENT_ID` / `GLOO_CONNECT_CLIENT_SECRET` are read at module scope and
 * throw when absent. A gating suite that silently skips its provider tests is a green
 * lie: E-MC1 and E-MC3 are ABOUT Gloo, and without credentials they would pass by
 * asserting that a disabled control is disabled.
 *
 * ── Lane registration (two edits, always) ──────────────────────────────────────────
 * The mock lane globs `tests/e2e/** /*.e2e.ts` and excludes real specs BY NAME, so a new
 * real-stack spec silently joins the Docker-free lane unless BOTH configs are edited.
 * `tests/unit/e2e-lane-coverage.test.ts` fails if only one is.
 */

const BASE_URL = "http://localhost:3000";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SEED_URL = `${BASE_URL}/?seed=authed-returning&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

/** Fail fast at module load — never skip. See §10.8 and the header. */
function requireGlooConnectCredential(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `[studio-model-cost] ${name} is unset, so the Gloo half of this spec cannot run.\n` +
        `  E-MC1/E-MC3 are ABOUT Gloo being selectable for images; without credentials\n` +
        `  they would "pass" by asserting a disabled control is disabled — a green lie.\n` +
        `  Set it in the ROOT supagloo checkout's untracked .env. The GLOO_CONNECT_\n` +
        `  prefix is mandatory: plain GLOO_CLIENT_ID/SECRET belong to Stagehand's own LLM.`,
    );
  }
  return value;
}
const GLOO_CLIENT_ID = requireGlooConnectCredential("GLOO_CONNECT_CLIENT_ID");
const GLOO_CLIENT_SECRET = requireGlooConnectCredential("GLOO_CONNECT_CLIENT_SECRET");

let stagehand: Stagehand;
let page: StagehandPage;

const countTestId = (id: string) => page.locator(`[data-testid="${id}"]`).count();
const clickTestId = (id: string) => page.locator(`[data-testid="${id}"]`).click();

async function dataAttr(id: string, attr: string): Promise<string | null> {
  return page.evaluate(
    ({ sel, a }) =>
      document.querySelector<HTMLElement>(`[data-testid="${sel}"]`)?.getAttribute(a) ??
      null,
    { sel: id, a: attr },
  );
}
async function testidText(id: string): Promise<string> {
  return page.evaluate(
    (sel) =>
      document.querySelector<HTMLElement>(`[data-testid="${sel}"]`)?.textContent ?? "",
    id,
  );
}
async function optionValues(id: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLSelectElement>(`[data-testid="${sel}"]`);
    return el ? [...el.options].map((o) => o.value).filter((v) => v.length > 0) : [];
  }, id);
}
async function selectValue(id: string, value: string): Promise<void> {
  await page.locator(`[data-testid="${id}"]`).selectOption(value);
}
async function waitForTestId(id: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(id)) > 0) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`[data-testid="${id}"] never appeared within ${timeoutMs}ms`);
}
async function waitForDataAttr(
  id: string,
  attr: string,
  expected: string,
  timeoutMs = 120_000,
) {
  const deadline = Date.now() + timeoutMs;
  let last: string | null = null;
  while (Date.now() < deadline) {
    last = await dataAttr(id, attr);
    if (last === expected) return;
    await page.waitForTimeout(300);
  }
  throw new Error(`[data-testid="${id}"] ${attr}="${last}" never became "${expected}"`);
}

/** Connect Gloo through the SHIPPING profile card — the real verify-then-store flow
 *  (`PUT /v1/connections/gloo`, which performs a live client-credentials mint against
 *  Gloo before it will store anything). No shim: unlike OpenRouter's PKCE there is no
 *  human-only consent hop to work around here. */
async function connectGlooViaProfile(): Promise<void> {
  const serverConnected = () =>
    page.evaluate(async () => {
      try {
        const res = await fetch("/api/connections", { cache: "no-store" });
        if (!res.ok) return false;
        const body = (await res.json()) as { gloo?: unknown };
        return Boolean(body?.gloo);
      } catch {
        return false;
      }
    });

  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await waitForTestId("workspace-home");
  if (await serverConnected()) return;

  await clickTestId("workspace-profile-pill");
  await waitForTestId("menu-account-settings");
  await clickTestId("menu-account-settings");
  await waitForTestId("profile-page");
  await waitForTestId("card-connect-gloo");
  await clickTestId("card-connect-gloo");
  await waitForTestId("gloo-client-id");

  await page.locator('[data-testid="gloo-client-id"]').fill(GLOO_CLIENT_ID);
  await page.locator('[data-testid="gloo-secret"]').fill(GLOO_CLIENT_SECRET);
  await clickTestId("gloo-save");

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await serverConnected()) return;
    if ((await countTestId("gloo-error")) > 0) {
      throw new Error(
        `Gloo connect was REJECTED by the live verify: ${await testidText("gloo-error")}`,
      );
    }
    await page.waitForTimeout(400);
  }
  throw new Error("Gloo never became connected within 60s");
}

/** A real project with a committed storyboard, opened in the studio. */
async function openStudioWithScenes(): Promise<void> {
  const fixture = process.env.SUPAGLOO_E2E_STUDIO_SLUG;
  if (fixture) {
    await page.goto(
      `${BASE_URL}/studio/${fixture}?seed=authed-returning&nonce=${RUN_ID}`,
      { waitUntil: "load" },
    );
    await waitForTestId("script-input", 60_000);
    return;
  }
  await createProjectViaExistingEmptyRepo(page, { slug: "modelcost", seedUrl: SEED_URL });
  await waitForTestId("studio-frame");
  await waitForTestId("generate-storyboard");
  await clickTestId("generate-storyboard");
  await waitForTestId("script-input", 240_000);
  await clickTestId("commit-button");
  await waitForDataAttr("version-branch-chip", "data-dirty", "false", 180_000);
}

beforeAll(async () => {
  stagehand = new Stagehand({ env: "LOCAL", verbose: 1 });
  await stagehand.init();
  page = stagehand.context.pages()[0];
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  await page.goto(SEED_URL, { waitUntil: "load" });
  await waitForTestId("workspace-home", 30_000);

  await completeGithubConnectViaCallback(stagehand.context, {
    installationId: await resolveInstallationId(),
  });
  // BOTH providers, because the point of E-MC1 is that the picker distinguishes
  // "connected but this provider has no such models" from "not connected". With Gloo
  // unconnected, every Gloo row would read "Not connected" and the test would prove
  // nothing about the compatibility matrix.
  await connectOpenRouterViaProfile(stagehand.context, page);
  await connectGlooViaProfile();

  await openStudioWithScenes();
  // The catalogue is read once per studio open; the section is only meaningful once it
  // has landed.
  await waitForTestId("ai-settings", 60_000);
}, 900_000);

afterAll(async () => {
  await stagehand?.close();
});

describe("Inspector — provider/model selection, faith alignment and cost (genesis-1)", () => {
  test("E-MC1: image offers BOTH providers; narration/music/video show Gloo present-but-disabled", async () => {
    // Item 1 with the live compatibility truth behind it. Gloo really can generate
    // images (11 catalogue models), and really has no speech, music or video models —
    // those routes answer 404, not 405.
    expect(await dataAttr("ai-provider-image-gloo", "data-available")).toBe("true");
    expect(await dataAttr("ai-provider-image-openrouter", "data-available")).toBe("true");

    for (const kind of ["narration", "music", "video"]) {
      expect(
        await dataAttr(`ai-provider-${kind}-gloo`, "data-available"),
        `${kind} must not offer Gloo`,
      ).toBe("false");
      // PRESENT, not hidden — the design's Pattern B — with a plain-language reason and
      // NO `Link ▸`, because connecting is not the fix here.
      expect(await countTestId(`ai-provider-reason-${kind}-gloo`)).toBe(1);
      const reason = await testidText(`ai-provider-reason-${kind}-gloo`);
      expect(reason).toContain("Gloo AI");
      expect(reason.toLowerCase()).not.toContain("not connected");
      expect(
        await dataAttr(`ai-provider-${kind}-openrouter`, "data-available"),
        `${kind} must offer OpenRouter`,
      ).toBe("true");
    }
  });

  test("E-MC2: the model selects are populated from the LIVE catalogues", async () => {
    // The claim only this lane can make: these ids came from openrouter.ai and
    // platform.ai.gloo.com over the wire, minutes ago — not from a fixture.
    for (const kind of ["image", "narration", "music", "video"]) {
      const values = await optionValues(`ai-model-${kind}`);
      expect(values.length, `${kind} has no live models`).toBeGreaterThan(0);
    }

    // …but "not empty" is far too weak to be the claim. Until 2026-07-28 the api read only
    // `?output_modalities=speech` and stamped every entry with BOTH audio kinds, so the
    // MUSIC select was full of batch-TTS ids and this test passed on a catalogue that
    // could not run a single music generation. The discriminating assertion is that each
    // select CONTAINS the id this deployment actually generates with — which for music
    // (`google/lyria-3-clip-preview` by default) lives only in the SEPARATE
    // `?output_modalities=audio` catalogue, and for narration only in the speech one.
    const defaults = await page.evaluate(async () => {
      const res = await fetch("/api/ai/models", { credentials: "include" });
      const body = (await res.json()) as {
        defaults?: Record<string, { provider: string; model: string }>;
      };
      return body.defaults ?? {};
    });
    for (const kind of ["image", "narration", "music", "video"]) {
      const fallback = defaults[kind];
      expect(fallback, `the BFF published no default for ${kind}`).toBeTruthy();
      expect(
        await optionValues(`ai-model-${kind}`),
        `the ${kind} select does not offer this deployment's own default (${fallback!.model}) — ` +
          `it is being populated from the wrong catalogue`,
      ).toContain(fallback!.model);
    }
    // The two audio selects must also be DISJOINT: the narration path calls
    // `POST /api/v1/audio/speech` and the music path calls chat/completions, so an id in
    // both would be servable by only one of them.
    const narrationIds = await optionValues("ai-model-narration");
    const musicIds = await optionValues("ai-model-music");
    expect(narrationIds.filter((id) => musicIds.includes(id))).toEqual([]);

    // And the selector arrives PRE-SELECTED at what the system uses today, rather than
    // demanding a choice before anything can be generated (item 1's "each defaults to
    // whatever the system currently uses").
    const selected = await page.evaluate(
      () =>
        document.querySelector<HTMLSelectElement>('[data-testid="ai-model-image"]')
          ?.value ?? "",
    );
    expect(selected.length).toBeGreaterThan(0);
  });

  test("E-MC3: choosing Gloo for images reveals FAITH ALIGNMENT with exactly the four real values", async () => {
    expect(await dataAttr("ai-settings", "data-faith-visible")).toBe("false");
    expect(await countTestId("faith-alignment")).toBe(0);

    await clickTestId("ai-provider-image-gloo");
    await waitForTestId("faith-alignment", 10_000);

    // The four Gloo actually honours. `protestant` and `orthodox` do NOT exist — Gloo
    // returns 200 for them and silently degrades to neutral, so offering either would be
    // an invisible failure rather than a rejected one.
    expect((await optionValues("faith-alignment")).sort()).toEqual([
      "catholic",
      "evangelical",
      "mainline",
      "not_faith_specific",
    ]);

    await selectValue("faith-alignment", "catholic");
    // Item 2: NOT shown for OpenRouter.
    await clickTestId("ai-provider-image-openrouter");
    expect(await countTestId("faith-alignment")).toBe(0);
    // …and switching back must not silently restore a setting the user never re-chose.
    await clickTestId("ai-provider-image-gloo");
    await waitForTestId("faith-alignment", 10_000);
    expect(
      await page.evaluate(
        () =>
          document.querySelector<HTMLSelectElement>('[data-testid="faith-alignment"]')
            ?.value ?? "",
      ),
    ).toBe("");
  });

  test("E-MC4: cost is a REAL number where pricing exists, and honestly unknown for video", async () => {
    // Item 3, and the one assertion that keeps it honest. OpenRouter publishes a
    // per-image price, so the image row must show money. It publishes NO video pricing
    // at all — `/api/v1/videos/models` has no price field — so the video row must say so
    // rather than invent a plausible number.
    await clickTestId("ai-provider-image-openrouter");

    const imageCost = await testidText("ai-cost-image");
    expect(imageCost).toMatch(/\$/);
    expect(await dataAttr("ai-cost-image", "data-confidence")).toBe("measured");

    expect(await testidText("ai-cost-video")).toBe("—");
    expect(await dataAttr("ai-cost-video", "data-confidence")).toBe("unpriced");
    expect((await testidText("ai-cost-basis-video")).toLowerCase()).toContain(
      "not published",
    );

    // Gloo prices per token and an image's token count is not knowable in advance, so
    // that row shows the published RATE and refuses a total. Both halves matter: showing
    // nothing would hide real information, showing a total would fabricate one.
    await clickTestId("ai-provider-image-gloo");
    expect(await dataAttr("ai-cost-image", "data-confidence")).toBe("unpriced");
    expect(await testidText("ai-cost-image")).toMatch(/per|\/ 1K|—/);
  });

  test("E-MC5: the choices survive Commit + a fresh studio re-open (all four mirrors)", async () => {
    // The four-mirror proof, and the reason it has to be end to end: db-lib's schema,
    // dbos's `canonicalizeManifest`, this repo's hand-copied contracts and the adapter
    // must ALL carry `aiSettings`. Missing the dbos one erases the field on every commit,
    // silently — the exact bug that already shipped once for `narratorVoice.assetKey`,
    // and one that no unit test in any single repo can see.
    await clickTestId("ai-provider-image-gloo");
    await waitForTestId("faith-alignment", 10_000);
    await selectValue("faith-alignment", "mainline");
    const chosenModel = await page.evaluate(
      () =>
        document.querySelector<HTMLSelectElement>('[data-testid="ai-model-image"]')
          ?.value ?? "",
    );
    expect(chosenModel.length).toBeGreaterThan(0);

    await clickTestId("commit-button");
    await waitForDataAttr("version-branch-chip", "data-dirty", "false", 180_000);
    expect(await countTestId("commit-error")).toBe(0);

    // A full reload re-reads the manifest FROM GIT — this is not a client-state check.
    await page.reload({ waitUntil: "load" });
    await waitForTestId("ai-settings", 90_000);

    expect(await dataAttr("ai-provider-image-gloo", "data-selected")).toBe("true");
    expect(await dataAttr("ai-settings", "data-faith-visible")).toBe("true");
    expect(
      await page.evaluate(
        () =>
          document.querySelector<HTMLSelectElement>('[data-testid="faith-alignment"]')
            ?.value ?? "",
      ),
    ).toBe("mainline");
    expect(
      await page.evaluate(
        () =>
          document.querySelector<HTMLSelectElement>('[data-testid="ai-model-image"]')
            ?.value ?? "",
      ),
    ).toBe(chosenModel);
  });
});
