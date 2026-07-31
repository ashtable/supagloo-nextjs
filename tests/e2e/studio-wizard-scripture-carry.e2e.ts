import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";

import { type StagehandPage } from "./helpers";
import {
  completeGithubConnectViaCallback,
  connectOpenRouterViaProfile,
} from "./connect-helpers";
import { createProjectViaExistingEmptyRepo, resolveInstallationId } from "./github-e2e";

/**
 * The wizard's passage reaches the studio's generate — and the ready card redirects itself
 * (2026-07-30, ad-hoc bug run).
 *
 * ── What the user reported ──────────────────────────────────────────────────────────
 * They chose NIV11 / Psalms / 23 in the New-project wizard (the preview pane correctly
 * showed Psalm 23 in NIV11), created the project, opened the studio, clicked generate — and
 * got a three-scene storyboard of **Genesis 1 in ASV**. The Inspector's scripture picker was
 * showing three empty placeholders. Separately, the "PROJECT READY." card's caption said
 * "Redirecting automatically…" and nothing ever redirected.
 *
 * ── Why NO existing spec could see any of it ────────────────────────────────────────
 * Both shared acquisition helpers clicked `wizard-skip-scripture`, deliberately: every
 * fixture they build is a `createdFrom: "blank"` project, and seeding a passage would change
 * eight other specs' subject under test. The consequence was that the product's HEADLINE
 * creation path — choose a passage, then generate from it — had **zero** end-to-end coverage
 * structurally. `studio-replan-scripture.e2e.ts` and `studio-ai-generation.e2e.ts` both
 * generate storyboards, and neither asserts WHICH passage. So a passage could be collected,
 * validated, POSTed, seeded into `supagloo.project.json`, committed to a real GitHub repo,
 * and then silently dropped on the read side, with every suite green.
 *
 * This spec closes that gap by driving the picker itself (`opts.scripture`, the seam
 * `skipWizardScriptureStep`'s docblock asks for).
 *
 * ── Content-agnostic on purpose ─────────────────────────────────────────────────────
 * A real LLM writes the scenes, so nothing here asserts scene text. The two properties
 * asserted are the ones that distinguish "the passage travelled" from "the model guessed":
 * every scene's reference names the BOOK the user picked, and no scene carries the Genesis-1
 * opener the user actually saw. The second is a literal from the bug report rather than a
 * general claim — Psalms is picked here precisely so it can never be a false positive.
 *
 * ── EXECUTION NOTE ──────────────────────────────────────────────────────────────────
 * EXECUTED GREEN 2026-07-30 (54.7 s) against `next dev`, the containerised api, a DBOS
 * ai-generation worker, real github.com, real OpenRouter and the live YouVersion host. It is
 * no longer one of the lane's authored-but-deferred specs, and that matters: the first four
 * attempts to run it all failed, three of them for reasons nothing else in any repo could
 * see.
 *
 *   1. The shared helper set the BOOK `<select>` before `GET /api/bible/books` had rendered
 *      an option for it. Assigning a `<select>` a value it does not offer is a silent no-op,
 *      so no chapter fetch was ever issued and the failure surfaced one cascade level below
 *      its cause. Fixed in `github-e2e.ts`'s `selectTestIdOption`, which now waits and then
 *      reads the value back.
 *   2. The helper armed the scaffold as soon as ANY passage preview rendered, which races the
 *      verses read the default `min(5, n)` range comes from — so the fixture persisted the
 *      WHOLE CHAPTER and E-WSC4's range assertion had nothing to find. Fixed by
 *      `waitForWizardVerseDefault`.
 *   3. THE REAL DEFECT, and the one this spec exists for: the DBOS worker had no
 *      `YOUVERSION_APP_KEY` at all. Root `docker-compose.yml` passed that key to the `nextjs`
 *      service and to nothing else, while the worker reads it and sends it as `x-yvp-app-key`
 *      — so every scripture read answered 401, non-retryably, and the user saw "Generation
 *      failed — try again" with the cause three services away. It had been unreachable rather
 *      than absent: `generateScript` only fetches a passage when the manifest HAS a
 *      `scripture` block, and every fixture in every repo was a `createdFrom: "blank"` project
 *      without one. This spec is the first to create a project WITH a chosen passage, and it
 *      found the gap on its first honest run. Root's `tests/unit/dbos-compose.test.ts` now
 *      holds the wiring.
 *
 * Unit cover remains the fast signal: `lib/studio/generation-input.test.ts` (which values
 * travel), `lib/project-wizard/verse-range.test.ts` (what the range resolves to),
 * `tests/unit/wizard-scripture-step.test.tsx` + `tests/unit/scripture-picker.test.tsx` (both
 * component boundaries) and `tests/e2e/bible-youversion-live.e2e.ts` E-BY7..E-BY9 (the live
 * provider contract the whole thing rests on).
 *
 * Deterministic (testid + `evaluate` + `data-*`, no act/extract/observe) and Gloo-free —
 * the convention every prior studio + real-stack spec follows. Per-run nonce.
 */

const BASE_URL = "http://localhost:3000";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SEED_URL = `${BASE_URL}/?seed=authed-returning&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

/**
 * The passage the wizard is driven to. `PSA` is the book USFM the live `/books` response
 * reports and `"23"` is the chapter id the live `/chapters` response reports for it — both
 * are values the picker's own `<option>`s carry, never strings this spec invents. The
 * translation is left at the app's ASV default (USER DECISION D1, resolved by abbreviation
 * from the live collection), because pinning a bible id here would assert a licensing grant
 * rather than the product.
 */
const BOOK_USFM = "PSA";
const CHAPTER_ID = "23";
/** The exact hallucination from the bug report. Psalms is picked above so this can never
 *  be a legitimate line. */
const GENESIS_OPENER = "In the beginning God created";

let stagehand: Stagehand;
let page: StagehandPage;

function countTestId(id: string) {
  return page.locator(`[data-testid="${id}"]`).count();
}
function clickTestId(id: string) {
  return page.locator(`[data-testid="${id}"]`).click();
}
async function waitForTestId(id: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(id)) > 0) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`[data-testid="${id}"] never appeared within ${timeoutMs}ms`);
}
async function textOfTestId(id: string): Promise<string> {
  return page.evaluate(
    (sel) =>
      document.querySelector<HTMLElement>(`[data-testid="${sel}"]`)?.textContent?.trim() ??
      "",
    id,
  );
}
async function valueOfTestId(id: string): Promise<string> {
  return page.evaluate(
    (sel) =>
      document.querySelector<HTMLSelectElement>(`[data-testid="${sel}"]`)?.value ?? "",
    id,
  );
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

/** Every scene's `{reference, translation}`, read off the task-57 inspector seam by
 *  selecting each scene-tree row in turn. */
async function everySceneScripture(): Promise<
  { id: string; reference: string; translation: string; script: string }[]
> {
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="scene-tree-row"]')].map(
      (r) => r.getAttribute("data-scene-id") ?? "",
    ),
  );
  const out: { id: string; reference: string; translation: string; script: string }[] = [];
  for (const id of ids) {
    await page.locator(`[data-testid="scene-tree-row"][data-scene-id="${id}"]`).click();
    const read = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="scene-inspector"]');
      const script = document.querySelector<HTMLTextAreaElement>(
        '[data-testid="script-input"]',
      );
      return {
        // The panel's OWN id, not the id we asked for. Labelling a read with the id we
        // INTENDED to select assumes the click landed; when it does not, this helper
        // reports one scene's script under another scene's id and every downstream
        // failure blames the wrong scene. That mis-attribution is exactly what cost a
        // 118 s real-lane run on 2026-07-30 (see `studio-hydration.e2e.ts` E-SH2).
        id: el?.getAttribute("data-scene-id") ?? "",
        reference: el?.getAttribute("data-scene-reference") ?? "",
        translation: el?.getAttribute("data-scene-translation") ?? "",
        script: script?.value ?? "",
      };
    });
    if (read.id !== id) {
      throw new Error(
        `selecting scene ${id} left the inspector on ${JSON.stringify(read.id)} — ` +
          "the click did not take effect, so this scene's scripture was never read",
      );
    }
    out.push(read);
  }
  return out;
}

/** Captured inside `onProjectReady`, i.e. before anything clicks `open-in-studio`.
 *  `cardText` is the whole card, which carries both the caption and the URL chip. */
let readyObservation: {
  cardText: string;
  urlAtReady: string;
  redirectedWithoutClick: boolean;
  urlAfterRedirect: string;
} | null = null;

beforeAll(async () => {
  stagehand = new Stagehand({ env: "LOCAL", verbose: 1 }); // Gloo-free
  await stagehand.init();
  page = stagehand.context.pages()[0];
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
  await gotoWorkspace();
  // The REAL installation id, discovered at runtime from `GET /app/installations`.
  await completeGithubConnectViaCallback(stagehand.context, {
    installationId: await resolveInstallationId(),
  });
  // WITHOUT WHICH E-WSC3 CANNOT RUN: it is about a real `storyboard` generation, and the
  // `?seed=` seam mints a user with no provider connections — the generation would fail in
  // the worker with `OpenRouterNotConnectedError` and present only as scenes that never
  // arrive.
  await connectOpenRouterViaProfile(stagehand.context, page);
}, 300_000);

afterAll(async () => {
  await stagehand?.close();
});

describe("the wizard's passage survives into the studio's generate", () => {
  test("E-WSC1..4: pick a passage → auto-redirect → the studio and its storyboard carry THAT passage", async () => {
    const acquired = await createProjectViaExistingEmptyRepo(page, {
      slug: "scripture-carry",
      seedUrl: SEED_URL,
      scripture: { bookUsfm: BOOK_USFM, chapterId: CHAPTER_ID },
      // ── E-WSC1: the ready card redirects ITSELF ────────────────────────────────
      // This runs while the card is on screen and BEFORE the helper touches
      // `open-in-studio`, which is the only window in which the redirect is
      // distinguishable from a click.
      onProjectReady: async () => {
        const cardText = await textOfTestId("project-ready-card");
        const urlAtReady = page.url();
        const deadline = Date.now() + 15_000;
        let redirected = false;
        while (Date.now() < deadline) {
          if (page.url().includes("/studio/")) {
            redirected = true;
            break;
          }
          await page.waitForTimeout(200);
        }
        readyObservation = {
          cardText,
          urlAtReady,
          redirectedWithoutClick: redirected,
          urlAfterRedirect: page.url(),
        };
      },
    });

    // ── E-WSC1 ────────────────────────────────────────────────────────────────────
    expect(readyObservation).not.toBeNull();
    // The card still SAYS it, verbatim (U+2026, no invented countdown)…
    expect(readyObservation!.cardText).toContain("Redirecting automatically…");
    // …it had not happened yet when the card appeared…
    expect(readyObservation!.urlAtReady).not.toContain("/studio/");
    // …and then it happened, with nothing clicked.
    expect(
      readyObservation!.redirectedWithoutClick,
      'the ready card promised "Redirecting automatically…" and did not redirect',
    ).toBe(true);

    // The target is the slug the SERVER assigned, not the name typed into the wizard.
    // `nextFreeSlug` de-duplicates on a same-owner collision, and `/studio/[slug]`
    // resolves owner-scoped — so an automatic redirect onto the client's guess would be
    // an unavoidable 404 rather than a latent one. The card's own URL chip must agree
    // with where it went.
    const landed = readyObservation!.urlAfterRedirect.split("/studio/")[1]!.split(/[?#]/)[0];
    expect(landed.length).toBeGreaterThan(0);
    // The card's own `supagloo.com/studio/<slug>` chip agrees with where it went. If the
    // redirect used the client's guess while the chip showed the confirmed slug (or the
    // reverse), the card would be describing a different project from the one it opened.
    expect(readyObservation!.cardText).toContain(landed);
    expect(acquired.projectId).toBe(landed);

    await waitForTestId("studio-frame", 60_000);

    // ── E-WSC3, part 1: generate ──────────────────────────────────────────────────
    // This has to happen BEFORE E-WSC2/E-WSC4 can be observed at all, and the ordering is
    // structural rather than a convenience. `studio-app.tsx` renders `StudioEmpty` while
    // `storyboard.scenes.length === 0` and mounts `SceneInspector` only in the other branch —
    // so on a freshly scaffolded project (`scenes: []`) the Inspector, its `scripture-picker`
    // and the read-only `project-passage` line genuinely do not exist yet. An earlier draft of
    // this spec read `project-passage` here and got `""`, which is not the studio dropping the
    // passage; it is the studio not having drawn an Inspector.
    //
    // It is also the faithful reproduction: the reported bug was seen in the Inspector AFTER
    // generating, which is the only place 13b's reference line is drawn.
    await waitForTestId("generate-storyboard");
    await clickTestId("generate-storyboard");
    await waitForTestId("script-input", 300_000);
    expect(await countTestId("generate-storyboard-error")).toBe(0);

    // ── E-WSC4: what the wizard PERSISTED ─────────────────────────────────────────
    // The read-only project-passage line renders `manifest.scripture`, i.e. the block the
    // scaffold committed into the real GitHub repo and the studio re-read from it. Generating
    // does not touch it — the storyboard lives in client state until a commit, and
    // `origin` is read from `project.manifest`.
    await waitForTestId("project-passage", 60_000);
    const passageLine = await textOfTestId("project-passage");
    expect(passageLine.length).toBeGreaterThan(0);
    // The default verse selection is the first min(5, n) verses of the live response, so
    // the reference the provider echoed is a RANGE over this chapter — never a hardcoded
    // "1-5" (Psalm 117 has two verses, and asking for five of them succeeds upstream with
    // a fabricated reference).
    expect(passageLine).toMatch(/\d+:\d+([-–]\d+)?/);
    // The book, taken from the reference the PROVIDER echoed (never from a local book table
    // — canon is a property of the translation). The trailing `s` is trimmed because
    // YouVersion titles the book "Psalms" while a model may write "Psalm 23:1"; the stem is
    // still discriminating (nothing in Genesis contains "psalm").
    const chosenBookTitle = passageLine.split(/\s+\d/)[0].trim();
    expect(chosenBookTitle.length).toBeGreaterThan(0);
    const bookStem = chosenBookTitle.replace(/s$/i, "").toLowerCase();
    expect(bookStem.length).toBeGreaterThan(2);

    // ── E-WSC2: the reported symptom is gone ──────────────────────────────────────
    // The user's screenshot showed "select book" / "select cha" / "select ve": the picker
    // took no manifest input at all and pre-selected a TRANSLATION only.
    await waitForTestId("scripture-picker", 60_000);
    expect(await valueOfTestId("picker-language")).not.toBe("");
    expect(await valueOfTestId("picker-translation")).not.toBe("");
    expect(await valueOfTestId("picker-book")).toBe(BOOK_USFM);
    expect(await valueOfTestId("picker-chapter")).toBe(CHAPTER_ID);

    // ── E-WSC3, part 2: the headline property ─────────────────────────────────────
    const scenes = await everySceneScripture();
    expect(scenes.length).toBeGreaterThan(0);
    for (const scene of scenes) {
      // Every scene is about the book the user picked in the wizard.
      expect(
        scene.reference.toLowerCase(),
        `scene ${scene.id} reference ${JSON.stringify(scene.reference)} does not name ` +
          `${JSON.stringify(chosenBookTitle)} — the wizard's passage did not reach the generation`,
      ).toContain(bookStem);
      expect(scene.translation.length).toBeGreaterThan(0);
      // …and the exact hallucination from the bug report is absent.
      expect(scene.script, `scene ${scene.id} is still Genesis 1`).not.toContain(
        GENESIS_OPENER,
      );
    }
    // DELIBERATELY NOT asserted: that every scene carries the SAME translation string, or
    // that it equals the project's abbreviation. Per-scene `translation` is free text the
    // model writes (`StoryboardSceneSchema.translation` is a broadened string, §9-Q10), so
    // either claim would make this spec fail for model inconsistency rather than for a
    // product defect. What the product guarantees — that the manifest's own translation is
    // the wizard's — is asserted above on `project-passage`, which is read from git.
  }, 1_200_000);
});
