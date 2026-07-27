import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

import { glooLlmClient } from "../../lib/gloo/llm-client";
import { makeHelpers, waitForHydrated, type E2EHelpers, type StagehandPage } from "./helpers";
import { ROOT_DIR } from "./github-e2e";
import { SESSION_COOKIE_NAME } from "../../lib/api/cookies";

/**
 * Turn 16a — the GALLERY WATCH PAGE at `/gallery/[id]`, end to end (plan slice C6).
 *
 * REAL-STACK LANE (`vitest.e2e.real.config.ts` → `npm run test:e2e:real`): browser →
 * the nextjs BFF → the containerised `supagloo-nodejs-api` → Postgres + MinIO. No
 * GitHub and no provider egress: nothing here scaffolds a repo or runs a generation.
 *
 * ── WHAT THIS SPEC OWNS THAT `gallery.e2e.ts` NO LONGER DOES ────────────────────
 * Row 41 played a gallery item in a MODAL. Slice C7 retires that modal and turns the
 * card's `▶` into navigation, so the real playback proof — "a seeded object is actually
 * fetchable from the browser and reaches `readyState > 0`" — moves here (E-GW3).
 * `gallery.e2e.ts`'s E-GU11 keeps only the one-line claim that the `▶` navigates.
 *
 * ── SEEDING ─────────────────────────────────────────────────────────────────────
 * The ROOT repo's `tests/support/gallery-e2e-seed.mjs`, through the same
 * `SUPAGLOO_ROOT_DIR ?? ../supagloo` seam `github-e2e.ts` and `gallery.e2e.ts` use.
 * No new seeding was needed for 16a: the fixture plan already carries title, reference,
 * translation, duration, real playable mp4 bytes and real `GalleryUpvote` rows.
 *
 * **The fixtures carry `makingOf: null`** — the snapshot is written at PUBLISH time by
 * the api, and these rows are inserted directly. That is not a hole, it is the exact
 * shape of every item published before this cycle, and E-GW2b asserts the page is
 * complete without those sections. The populated-snapshot path is unit-driven
 * (`tests/unit/watch-view.test.tsx` U-WV3/U-WV4), where a snapshot can be constructed.
 *
 * ── TEARDOWN — THE LOAD-BEARING PART (slice C8's `publish to the gallery` block) ─
 * The 16a half only READS. The 16b half **WRITES TO A GLOBAL SURFACE**: it drives the
 * real `POST /v1/renders/:id/gallery`, and the row it creates is a live public gallery
 * item with a server-minted cuid — an id `clearGalleryFixtures()` cannot recognise and
 * therefore will never remove by its own gate. Left behind, it is counted by the NEXT
 * run's `assertNoForeignGalleryItems()`, a hard throw that names something unrelated to
 * whatever actually went wrong.
 *
 * CORRECTED 2026-07-26 against the live schema. This header used to add that a leaked
 * row also breaks teardown outright, by making the fixture delete violate
 * `GalleryItem.renderJobId` and roll back. It does not: that constraint is
 * `ON DELETE CASCADE` (`pg_constraint.confdeltype = 'c'`), so the cascade sweeps a
 * missed row up with its fixture `RenderJob`. Proven by running E-GP4 with its id
 * registration deliberately unreachable — the row was gone afterwards.
 *
 * What survives that correction is the part that matters, and it is why this is still
 * load-bearing: the cascade only helps IF teardown reaches it, the row is a LIVE PUBLIC
 * item for the whole window before that, and cleanup by accident is not cleanup.
 *
 * So every id this spec publishes is TRACKED in {@link publishedItemIds} and deleted BY
 * ID, through the product's own owner-scoped `DELETE /api/gallery/:id`, BEFORE
 * `clearGalleryFixtures()` runs. Never by pattern (memory
 * `documented-gate-must-be-the-gate-that-runs`), and never left to the fixture gate,
 * which by construction cannot match a cuid.
 *
 * DEFINITION OF DONE for that teardown: run this spec twice back to back and have the
 * second run's `assertNoForeignGalleryItems()` pass.
 *
 * ── TECHNIQUE ───────────────────────────────────────────────────────────────────
 * Deterministic DOM helpers for everything mechanical; ONE `stagehand.extract` for the
 * single genuinely semantic claim (E-GW8); no `stagehand.agent`. Every interaction is
 * preceded by `waitForHydrated("gallery-watch")` — the island is mount-gated, so that
 * testid is an honest post-hydration signal (row 68's rule).
 */

const BASE_URL = "http://localhost:3000";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SEED_QUERY = `seed=authed-returning&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

const SEED_MODULE_REL = "tests/support/gallery-e2e-seed.mjs";

/**
 * The helper's runtime surface as THIS spec consumes it — declared structurally, like
 * `gallery.e2e.ts` does, because the module is resolved at runtime from a path this
 * repo's tsconfig does not include.
 */
interface FixtureItemLike {
  id: string;
  renderJobId: string;
  projectId: string;
  title: string;
  searchToken: string;
  durationSeconds: number;
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  scriptureReference: string;
  translation: string;
  ownerId: string;
  ownerDisplayName: string;
}

/** The fixture PROJECT rows — 16b's `PROJECT ▾` label is `<slug> · v<semver>`, so the
 *  spec needs the slug the helper wrote in order to assert the join end to end. */
interface FixtureProjectLike {
  id: string;
  versionId: string;
  ownerId: string;
  slug: string;
}

/** Every `ProjectVersion` the seed helper writes carries this semver. Asserted rather
 *  than assumed: if the helper ever varies it, E-GP2 says so instead of drifting. */
const FIXTURE_SEMVER = "0.1.0";

interface GallerySeedModule {
  GALLERY_PAGE_SIZE: number;
  assertNoForeignGalleryItems(options?: unknown): Promise<void>;
  seedGalleryFixtures(options?: unknown): Promise<{
    runToken: string;
    pageSize: number;
    users: { id: string; youversionUserId: string; sessionToken: string }[];
    viewer: { id: string; sessionToken: string };
    projects: FixtureProjectLike[];
    items: FixtureItemLike[];
    publicItems: FixtureItemLike[];
    unlistedItems: FixtureItemLike[];
    expectedOrder: { newest: string[]; popular: string[] };
    leaders: { newest: string | null; popular: string | null };
  }>;
  clearGalleryFixtures(options?: unknown): Promise<Record<string, number>>;
}

async function loadSeedModule(): Promise<GallerySeedModule> {
  const abs = join(ROOT_DIR, SEED_MODULE_REL);
  if (!existsSync(abs)) {
    throw new Error(
      `[gallery-watch.e2e] the gallery seeding helper is missing: ${abs}\n` +
        `  It lives in the ROOT supagloo repo and is the only writer of the\n` +
        `  \`e2e-gallery-\` fixture rows this spec asserts against.\n` +
        `  Fix by either checking out the root repo as ../supagloo, or setting\n` +
        `  SUPAGLOO_ROOT_DIR=/path/to/supagloo before running this lane.\n` +
        `  Currently SUPAGLOO_ROOT_DIR=${process.env.SUPAGLOO_ROOT_DIR ?? "(unset)"}, ` +
        `resolved root=${ROOT_DIR}`,
    );
  }
  return (await import(pathToFileURL(abs).href)) as unknown as GallerySeedModule;
}

let stagehand: Stagehand;
let page: StagehandPage;
let h: E2EHelpers;
let seed: GallerySeedModule;
let fixtures: Awaited<ReturnType<GallerySeedModule["seedGalleryFixtures"]>>;
/** The item every read-only case drives against — the newest public one, so the
 *  `shared X ago` fragment is stable and short. */
let subject: FixtureItemLike;

/**
 * EVERY gallery item this spec PUBLISHES, by server-minted id.
 *
 * Module scope, appended the instant the watch-page URL is known, and drained in the
 * file-level `afterAll` — not the describe's, so a failure anywhere still tears down.
 * These ids cannot be recovered by pattern: they are cuids, indistinguishable from a
 * real user's item, which is exactly why they are recorded rather than matched.
 */
const publishedItemIds = new Set<string>();

/**
 * Un-publish one item, as its OWNER, through the product's own route.
 *
 * Node-side rather than in-page on purpose: teardown must not depend on a browser that
 * may already have died, and `DELETE /api/gallery/:id` is owner-scoped, so the owner's
 * real session token is the whole credential.
 *
 * ONLY 200 MEANS DELETED. An earlier version of this comment said "404 counts as success
 * — the row is gone"; the api refutes that in its own suite (`gallery.e2e.ts` E-G15:
 * "DELETE by a non-owner 404s AND THE ITEM SURVIVES"), because `deleteItem` is one
 * conditional `deleteMany({id, ownerId})` and deliberately makes "not yours" and "not
 * there" indistinguishable. A teardown that reads 404 as success and stops looking would
 * leak a live PUBLIC row the moment anything here publishes as an owner other than the
 * first — the exact leak that took down 21 UI tests once. The caller therefore tries
 * EVERY owner and, only if none answered 200, resolves the ambiguity with a public read.
 */
async function unpublishAsOwner(itemId: string, sessionToken: string): Promise<number> {
  const res = await fetch(`${BASE_URL}/api/gallery/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
  });
  return res.status;
}

/**
 * Register every public item whose title starts with `prefix` for teardown, by ASKING
 * THE PRODUCT which ids exist.
 *
 * The row is created the instant `POST /v1/renders/:id/gallery` answers 201 — before
 * the dialog closes, before the router navigates, and before any assertion in the test
 * runs. Reading the id off the resulting URL therefore makes cleanup conditional on the
 * browser getting there, which is exactly the coupling that leaks: a failed assertion,
 * a slow hydration, a navigation that never lands, and a live PUBLIC row is stranded —
 * one whose cuid no fixture gate can match, visible to every anonymous visitor for the
 * rest of the run, and removable afterwards only by the `ON DELETE CASCADE` on
 * `GalleryItem.renderJobId` finding it — which requires teardown to run at all.
 *
 * So this asks the ANONYMOUS listing instead, over a prefix that carries `RUN_ID` and
 * is therefore unique to this run. It is called from a `finally`, so it runs whether
 * the test passed, failed or threw. Polling because the listing is a separate read from
 * the write that created the row; returning empty is a legitimate answer (the publish
 * was refused, which is what E-GP5 and E-GP8 assert) and never a failure here.
 */
async function registerPublishedByTitlePrefix(
  prefix: string,
  timeoutMs = 15_000,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const listed = await fetch(
      `${BASE_URL}/api/gallery?sort=newest&q=${encodeURIComponent(prefix)}`,
    )
      .then((r) => (r.ok ? (r.json() as Promise<{ items: { id: string; title: string }[] }>) : null))
      .catch(() => null);
    const mine = (listed?.items ?? []).filter((i) => i.title.startsWith(prefix));
    for (const found of mine) publishedItemIds.add(found.id);
    if (mine.length > 0) return mine.map((i) => i.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return [];
}

// ── deterministic DOM helpers (same shapes as gallery.e2e.ts) ────────────────

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
/** Read a live DOM PROPERTY (not an attribute) — `disabled` and `checked` are only ever
 *  properties on a React-controlled control, so an attribute read would always say
 *  "false" and every gate assertion below would pass vacuously. */
async function propOf(id: string, prop: "disabled" | "checked"): Promise<boolean> {
  return page.evaluate(
    ({ sel, p }) => {
      const el = document.querySelector<HTMLInputElement>(`[data-testid="${sel}"]`);
      return el ? Boolean(el[p as "disabled" | "checked"]) : false;
    },
    { sel: id, p: prop },
  );
}

/** Type into a React-controlled input via the native setter + a bubbling `input` event.
 *  A plain `.type()` is swallowed by a controlled input. */
async function typeIntoTestId(testId: string, value: string): Promise<void> {
  await page.evaluate(
    ({ sel, v }) => {
      const input = document.querySelector<HTMLInputElement>(`[data-testid="${sel}"]`);
      if (!input) throw new Error(`${sel} is not in the DOM`);
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, v);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { sel: testId, v: value },
  );
}

/** Same idea for a `<select>`: native setter + a bubbling `change`. */
async function selectByTestId(testId: string, value: string): Promise<void> {
  await page.evaluate(
    ({ sel, v }) => {
      const el = document.querySelector<HTMLSelectElement>(`[data-testid="${sel}"]`);
      if (!el) throw new Error(`${sel} is not in the DOM`);
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { sel: testId, v: value },
  );
}

/** The `<option>` labels a select is offering, in order. */
async function optionLabels(testId: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLSelectElement>(`[data-testid="${sel}"]`);
    return el ? Array.from(el.options).map((o) => (o.textContent ?? "").trim()) : [];
  }, testId);
}

/** A control's live `value`. */
async function valueOf(testId: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-testid="${sel}"]`,
    );
    return el?.value ?? "";
  }, testId);
}

/** A control's viewport-relative box. `null` when it is not in the DOM at all, which a
 *  caller must distinguish from "present but out of view" — those are different bugs. */
async function boxOfTestId(id: string): Promise<null | {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${sel}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  }, id);
}

/** Ask the browser to bring a control into view, through whatever scroll container
 *  actually owns it. The whole of W5 is that a `position: fixed` backdrop with no
 *  scroll container of its own leaves this with nothing to scroll. */
async function scrollTestIdIntoView(id: string): Promise<void> {
  await page.evaluate((sel) => {
    document
      .querySelector<HTMLElement>(`[data-testid="${sel}"]`)
      ?.scrollIntoView({ block: "center", inline: "nearest" });
  }, id);
  await page.waitForTimeout(150);
}

/** Which `data-testid` is actually on top at this point — real hit-testing, so an
 *  element that is inside the viewport but underneath something else does not pass for
 *  "reachable". */
async function topmostTestIdAt(x: number, y: number): Promise<string | null> {
  return page.evaluate(
    ({ px, py }) => {
      const el = document.elementFromPoint(px, py);
      return el?.closest("[data-testid]")?.getAttribute("data-testid") ?? null;
    },
    { px: x, py: y },
  );
}

/** Does the DOCUMENT scroll sideways? Never acceptable at any width. */
async function bodyScrollsHorizontally(): Promise<boolean> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return (
      doc.scrollWidth > doc.clientWidth + 1 ||
      document.body.scrollWidth > doc.clientWidth + 1
    );
  });
}

async function attrOf(id: string, attr: string): Promise<string | null> {
  return page.evaluate(
    ({ sel, a }) =>
      document.querySelector<HTMLElement>(`[data-testid="${sel}"]`)?.getAttribute(a) ??
      null,
    { sel: id, a: attr },
  );
}
async function pathname(): Promise<string> {
  return page.evaluate(() => window.location.pathname);
}
async function waitForTestId(id: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(id)) > 0) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`[data-testid="${id}"] never appeared within ${timeoutMs}ms`);
}
async function pollAttr(id: string, attr: string, expected: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last: string | null = null;
  while (Date.now() < deadline) {
    last = await attrOf(id, attr);
    if (last === expected) return;
    await page.waitForTimeout(120);
  }
  throw new Error(
    `[data-testid="${id}"] ${attr}="${last}" never became "${expected}" in ${timeoutMs}ms`,
  );
}

/** One `<video>` reading, taken in-page. */
async function videoState(): Promise<{
  readyState: number;
  currentTime: number;
  duration: number;
  paused: boolean;
  currentSrc: string;
}> {
  return page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>(
      '[data-testid="gallery-watch-video"]',
    );
    return {
      readyState: v?.readyState ?? 0,
      currentTime: v?.currentTime ?? 0,
      duration: v?.duration ?? Number.NaN,
      paused: v?.paused ?? true,
      currentSrc: v?.currentSrc ?? "",
    };
  });
}

/**
 * Poll until the island has SETTLED — the details column, or its own not-found state.
 * `waitForHydrated` returns as soon as the island mounts, which is BEFORE its first
 * request resolves (the loading placeholder lives inside the same container on purpose,
 * so the hydration gate stays stable). Same rule as `gallery.e2e.ts`'s
 * `waitForGridSettled`.
 */
async function waitForWatchSettled(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => ({
      title: document.querySelectorAll('[data-testid="gallery-watch-title"]').length,
      notFound: document.querySelectorAll('[data-testid="gallery-watch-notfound"]')
        .length,
    }));
    if (snap.title > 0 || snap.notFound > 0) return;
    last = JSON.stringify(snap);
    await page.waitForTimeout(200);
  }
  throw new Error(`the watch page never settled in ${timeoutMs}ms (last ${last})`);
}

/** Open `/gallery/<id>`, anonymous or seeded, and wait past the mount gate. */
async function gotoWatch(id: string, opts: { seeded?: boolean } = {}) {
  const url = opts.seeded
    ? `${BASE_URL}/gallery/${id}?${SEED_QUERY}`
    : `${BASE_URL}/gallery/${id}`;
  await page.goto(url, { waitUntil: "load" });
  await waitForHydrated(page, "gallery-watch", { timeoutMs: 60_000 });
  await waitForWatchSettled();
}

/** Open `/gallery` and wait past ITS mount gate + first request. */
async function gotoGallery(opts: { seeded?: boolean } = {}) {
  const url = opts.seeded ? `${BASE_URL}/gallery?${SEED_QUERY}` : `${BASE_URL}/gallery`;
  await page.goto(url, { waitUntil: "load" });
  await waitForHydrated(page, "gallery-grid", { timeoutMs: 60_000 });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const cards = await page.evaluate(
      () => document.querySelectorAll('[data-testid^="gallery-card-"]').length,
    );
    if (cards > 0) return;
    await page.waitForTimeout(200);
  }
  throw new Error("the gallery grid never rendered a card");
}

beforeAll(async () => {
  seed = await loadSeedModule();

  // LOUD, never a skip: foreign public items would put an unknown item at the top of
  // the grid, and E-GW1 clicks the top card.
  await seed.assertNoForeignGalleryItems();

  fixtures = await seed.seedGalleryFixtures({
    runId: RUN_ID,
    viewerYouversionUserId: `yv-e2e-returning-${RUN_ID}`,
  });
  const newest = fixtures.leaders.newest;
  const found = fixtures.publicItems.find((i) => i.id === newest);
  subject = found ?? fixtures.publicItems[0];
  expect(subject, "the fixture seeded no public item").toBeTruthy();

  stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient: await glooLlmClient(),
  });
  await stagehand.init();
  page = stagehand.context.pages()[0];
  h = makeHelpers(page);
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);

  // Warm `/gallery/[id]` once, outside any test: `next dev` compiles a route on its
  // FIRST request, so the first load is the one most likely to be slow.
  await gotoWatch(subject.id);

  // ...and warm the BFF ROUTE MODULES the same way, for the same reason.
  //
  // The page warm above does not compile them: `app/api/gallery/[id]/upvote/route.ts` is
  // a separate module, so the first vote pays a `next dev` compile INSIDE the 20 s
  // `pollAttr` budget. Observed, not theorised — on a cold `.next` (2026-07-26) E-GW6
  // failed with `aria-pressed="false" never became "true" in 20000ms` while every other
  // case passed. Raising the budget instead would only hide a first-compile stall behind
  // a longer wait; warming removes it and keeps 20 s meaning "the vote is genuinely stuck".
  //
  // ANONYMOUS GETs on purpose, and GET even where the real verb is POST: the App Router
  // has to LOAD a route module before it can decide the method is unsupported, so a 401
  // or a 405 compiles it just as well as a 200 — while writing nothing at all. A warm
  // that actually voted would move the very counts E-GW6/E-GW7 assert.
  for (const path of [
    `/api/gallery/${encodeURIComponent(subject.id)}/upvote`,
    `/api/gallery/${encodeURIComponent(subject.id)}/stream-url`,
    `/api/renders`,
    `/api/projects`,
  ]) {
    await fetch(`${BASE_URL}${path}`).catch(() => undefined);
  }
}, 300_000);

afterAll(async () => {
  // ORDER IS LOAD-BEARING. Every item this spec published is a live PUBLIC row whose
  // cuid the fixture gate cannot match. `GalleryItem.renderJobId` is ON DELETE CASCADE,
  // so `clearGalleryFixtures()` below WOULD sweep a missed one up with its fixture
  // RenderJob — but only if it runs, and only after the row has been publicly live for
  // the length of the run. Deleting by id, through the product's own owner-scoped route,
  // is what makes this cleanup deliberate rather than a side effect of a cascade.
  const owners = new Map(fixtures?.users.map((u) => [u.id, u.sessionToken]) ?? []);
  for (const id of publishedItemIds) {
    let removed = false;
    for (const token of owners.values()) {
      const status = await unpublishAsOwner(id, token).catch(() => 0);
      // 200 only — see `unpublishAsOwner`. A 404 here means "not this owner's" just as
      // often as "already gone", so it must NOT end the search.
      if (status === 200) {
        removed = true;
        break;
      }
    }
    // Every owner answered 404. That is ambiguous, so ask the public read which it was:
    // the item is genuinely gone iff `GET /api/gallery/:id` also 404s.
    if (!removed) {
      const probe = await fetch(`${BASE_URL}/api/gallery/${encodeURIComponent(id)}`)
        .then((r) => r.status)
        .catch(() => 0);
      removed = probe === 404;
    }
    // Loud, never silent: an undeleted public item is precisely what took down 21 UI
    // tests the last time a gallery spec leaked, and the next run's
    // `assertNoForeignGalleryItems()` is where it would surface as an unrelated failure.
    if (!removed) {
      console.error(
        `[gallery-watch.e2e] FAILED TO DELETE published gallery item ${id}. It is a live ` +
          "PUBLIC row that no fixture gate can match — remove it by hand before the next " +
          "real-lane run, or assertNoForeignGalleryItems() will throw.",
      );
    }
  }
  publishedItemIds.clear();

  await seed?.clearGalleryFixtures();

  // THE BROWSER GOES LAST, and cannot take the database with it.
  //
  // `stagehand.close()` used to be the FIRST statement of this hook. It is also the one
  // statement here that can throw for a reason that has nothing to do with what needs
  // cleaning up — a CDP socket already gone, a browser that crashed mid-run — and a
  // throw at the top of an `afterAll` skips everything after it. That put the entire
  // load-bearing drain behind the single least reliable call in the file, in the exact
  // circumstances (a run that fell over) where the drain matters most.
  //
  // NOT fanned out to the eight inherited copies of this shape in other specs: those
  // teardowns delete nothing, so the ordering there is genuinely cosmetic.
  await stagehand?.close().catch(() => undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Anonymous. `/gallery/[id]` is public — the api's read is `optionalAuth` — so this
// is the natural path, not a special case.
// ─────────────────────────────────────────────────────────────────────────────

describe("watch a gallery item signed out", () => {
  beforeAll(async () => {
    await stagehand.context.clearCookies();
    await gotoWatch(subject.id);
  }, 120_000);

  test("E-GW1: clicking a gallery card's ▶ NAVIGATES to /gallery/<id>", async () => {
    await gotoGallery();
    const first = await page.evaluate(
      () =>
        document
          .querySelector<HTMLElement>('[data-testid^="gallery-card-"]')
          ?.getAttribute("data-item-id") ?? "",
    );
    expect(first, "no card in the grid to click").toBeTruthy();

    // `observe` proves the affordance is discoverable as a play control before the
    // deterministic click asserts where it goes.
    const observed = await stagehand.observe(
      "the play button drawn in the middle of the first video card's poster image",
    );
    expect(observed.length, "no play affordance was observable on the first card").toBeGreaterThan(0);

    await clickTestId(`gallery-play-${first}`);
    await waitForHydrated(page, "gallery-watch", { timeoutMs: 60_000 });
    await waitForWatchSettled();
    expect(await pathname()).toBe(`/gallery/${first}`);
    // The retired modal must not come back with it.
    expect(await countTestId("gallery-player")).toBe(0);
  });

  test("E-GW2: the eyebrow carries reference · translation · duration, and the title is the item's", async () => {
    await gotoWatch(subject.id);

    const mins = Math.floor(subject.durationSeconds / 60);
    const secs = String(subject.durationSeconds % 60).padStart(2, "0");
    const eyebrow = await testidText("gallery-watch-eyebrow");
    expect(eyebrow).toContain(subject.scriptureReference.toUpperCase());
    expect(eyebrow).toContain(subject.translation.toUpperCase());
    expect(eyebrow).toContain(`${mins}:${secs}`);

    expect(await testidText("gallery-watch-title")).toBe(subject.title);
    expect(await testidText("gallery-watch-creator-name")).toBe(
      subject.ownerDisplayName,
    );
    // `displayName · N public videos · shared X ago` — no `@handle` is fabricated
    // (D1: `User` has no handle column).
    const meta = await testidText("gallery-watch-creator-meta");
    expect(meta).toMatch(/public videos?/);
    expect(meta).toContain("shared");
    expect(meta, "an @handle was invented for a user that has none").not.toContain("@");
  });

  test("E-GW2b: an item with NO making-of snapshot renders neither SCRIPTURE nor HOW IT WAS MADE", async () => {
    // Every fixture row is inserted directly, so `makingOf` is null — the exact shape of
    // every item published before this cycle. The page must be complete without them,
    // not blank and not half-drawn.
    expect(await countTestId("gallery-watch-title")).toBe(1);
    expect(await countTestId("gallery-watch-scripture")).toBe(0);
    expect(await countTestId("gallery-watch-madeof")).toBe(0);
  });

  test("E-GW3: the <video> actually loads metadata (readyState > 0, finite duration)", async () => {
    await waitForTestId("gallery-watch-video", 30_000);

    const deadline = Date.now() + 30_000;
    let state = await videoState();
    while (Date.now() < deadline && !(state.readyState > 0)) {
      await page.waitForTimeout(250);
      state = await videoState();
    }
    // The presigned URL points at the PUBLIC S3 endpoint (MinIO in Compose), never at
    // the app origin — the browser fetches the object directly.
    expect(state.currentSrc).toMatch(/^https?:\/\//);
    expect(state.currentSrc).not.toContain(BASE_URL);
    expect(state.currentSrc).toContain("X-Amz-Signature");
    // The ONLY assertion that catches a missing S3 object: `presignPublicKey` signs
    // locally and answers 200 either way.
    expect(state.readyState, "the <video> never loaded metadata").toBeGreaterThan(0);
    expect(Number.isFinite(state.duration)).toBe(true);
  });

  test("E-GW4: pressing play advances currentTime and the transport timecode changes", async () => {
    const before = await testidText("gallery-watch-timecode");
    expect(before, "the transport rendered no timecode").toContain("/");

    await clickTestId("gallery-watch-playpause");

    const deadline = Date.now() + 30_000;
    let state = await videoState();
    while (Date.now() < deadline && !(state.currentTime > 0)) {
      await page.waitForTimeout(250);
      state = await videoState();
    }
    expect(state.currentTime, "the video never advanced past 0").toBeGreaterThan(0);

    /*
     * The transport is WIRED to the element, not decorative — but WHICH readout proves it
     * has to account for the fixture.
     *
     * The seeded mp4 is ONE SECOND long (root's `gallery-e2e-seed.mjs` ships ~1.7 KB of
     * real H.264 rather than megabytes of binary per item), and the timecode is `m:ss`.
     * So for most of the clip's life the readout legitimately reads `0:00 / 0:01` even
     * though `currentTime` is moving: the first assertion this test could make about the
     * timecode is only true after playback crosses the half-second rounding boundary.
     * Sampling it immediately after `currentTime > 0` was therefore a race the fixture
     * usually WON, and it failed exactly that way on a real run.
     *
     * Two readouts, each proving something the other cannot:
     *   - the SCRUB FILL is sub-second — it follows `currentTime/duration` continuously,
     *     so it is the honest "the transport tracks the element" claim at this scale;
     *   - the TIMECODE still has to change before the clip ends, which is the claim that
     *     the m:ss formatter is fed by the same clock.
     */
    const fillWidth = () =>
      page.evaluate(
        () =>
          document.querySelector<HTMLElement>('[data-testid="gallery-watch-scrub-fill"]')
            ?.style.width ?? "",
      );
    const fillDeadline = Date.now() + 30_000;
    let width = await fillWidth();
    while (Date.now() < fillDeadline && (width === "" || width === "0%")) {
      await page.waitForTimeout(100);
      width = await fillWidth();
    }
    expect(width, "the scrub fill never left 0%").not.toBe("0%");
    expect(width).not.toBe("");

    const tcDeadline = Date.now() + 30_000;
    let after = await testidText("gallery-watch-timecode");
    while (Date.now() < tcDeadline && after === before) {
      await page.waitForTimeout(150);
      after = await testidText("gallery-watch-timecode");
    }
    expect(after, `the timecode stayed at ${before} for the whole clip`).not.toBe(before);
  });

  /**
   * E-GW4b — THE SCRUB TRACK IS OPERABLE FROM A REAL KEYBOARD.
   *
   * The track carries `role="slider"` and `tabIndex={0}`, which together tell a screen
   * reader and a keyboard user that this is a seek control they can move. It had a
   * click handler and nothing else, so anyone not holding a mouse was told about a
   * capability that did not exist.
   *
   * `page.keyPress` is CDP `Input.dispatchKeyEvent` — a real key through the browser's
   * own input pipeline, not a synthesised DOM event — which is the half of the claim
   * `tests/unit/watch-view.test.tsx` U-WV8 structurally cannot make. U-WV8 owns the
   * key MAP (five-second steps, page jumps, the clamps), because the seeded mp4 is one
   * second long and every offset here collapses onto the same two numbers.
   *
   * So this asserts the two transitions that ARE unambiguous at one second: a seek key
   * takes a paused player from the start to the end, and Home brings it back.
   */
  test("E-GW4b: a real key press on the focused scrub track seeks the video", async () => {
    await gotoWatch(subject.id);
    await waitForTestId("gallery-watch-video", 30_000);

    // Metadata, not playback: the duration is what a seek is measured against.
    const metaDeadline = Date.now() + 30_000;
    let state = await videoState();
    while (Date.now() < metaDeadline && !Number.isFinite(state.duration)) {
      await page.waitForTimeout(200);
      state = await videoState();
    }
    expect(Number.isFinite(state.duration), "the video never reported a duration").toBe(true);
    expect(state.currentTime).toBe(0);

    // Focusable at all — the other half of what `tabIndex={0}` promises.
    const focused = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="gallery-watch-scrub"]');
      el?.focus();
      return document.activeElement?.getAttribute("data-testid") ?? null;
    });
    expect(focused, "the scrub track cannot take keyboard focus").toBe(
      "gallery-watch-scrub",
    );

    const before = await attrOf("gallery-watch-scrub", "aria-valuetext");
    expect(before, "the slider announces no position").toMatch(/^\d+:\d{2} \/ \d+:\d{2}$/);

    // One arrow step is 5 s and the fixture clip is ~1 s, so this clamps to the end —
    // which at this scale is the only movement that cannot be confused with drift.
    await page.keyPress("ArrowRight");
    let seekDeadline = Date.now() + 10_000;
    let after = await videoState();
    while (Date.now() < seekDeadline && after.currentTime === 0) {
      await page.waitForTimeout(100);
      after = await videoState();
    }
    expect(after.currentTime, "ArrowRight did not move the playhead").toBeGreaterThan(0);
    expect(await attrOf("gallery-watch-scrub", "aria-valuetext")).not.toBe(before);
    // The visible transport agrees with the element — a keyboard user is not seeking
    // blind.
    expect(await testidText("gallery-watch-timecode")).toBe(
      await attrOf("gallery-watch-scrub", "aria-valuetext"),
    );

    await page.keyPress("Home");
    seekDeadline = Date.now() + 10_000;
    let home = await videoState();
    while (Date.now() < seekDeadline && home.currentTime !== 0) {
      await page.waitForTimeout(100);
      home = await videoState();
    }
    expect(home.currentTime, "Home did not return to the start").toBe(0);
  });

  test("E-GW5: ⑂ Remix this is present, disabled, and clicking it changes nothing", async () => {
    await gotoWatch(subject.id);
    await waitForTestId("gallery-watch-remix");

    expect(await testidText("gallery-watch-remix")).toBe("⑂ Remix this");
    expect(await attrOf("gallery-watch-remix", "aria-disabled")).toBe("true");
    expect(await attrOf("gallery-watch-remix", "title")).toBe("Remixing is disabled");

    const urlBefore = await page.evaluate(() => window.location.href);
    const titleBefore = await testidText("gallery-watch-title");
    await clickTestId("gallery-watch-remix").catch(() => undefined);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.location.href)).toBe(urlBefore);
    expect(await testidText("gallery-watch-title")).toBe(titleBefore);
    // Nothing opened, either.
    expect(await countTestId("gallery-signin-prompt")).toBe(0);
  });

  test("E-GW7: signed out, the upvote pill opens the sign-in prompt and the count does not move", async () => {
    await gotoWatch(subject.id);
    const before = await testidText(`gallery-upvote-count-${subject.id}`);
    expect(before).toBe(String(subject.upvoteCount));
    expect(await attrOf(`gallery-upvote-${subject.id}`, "aria-pressed")).toBe("false");

    await clickTestId(`gallery-upvote-${subject.id}`);
    await waitForTestId("gallery-signin-prompt", 10_000);

    expect(await testidText(`gallery-upvote-count-${subject.id}`)).toBe(before);
    expect(await attrOf(`gallery-upvote-${subject.id}`, "data-voted")).toBe("false");
  });

  test("E-GW8: the page presents itself as ONE video's detail page (semantic extract)", async () => {
    await gotoWatch(subject.id);

    /*
     * The extract asks ONLY what an LLM can answer better than a selector: which strings
     * on this page a reader would identify as "the title", "the creator" and "the
     * passage". Those are semantic roles, and reading them out of known testids would
     * prove nothing beyond that the testids exist.
     *
     * IT DELIBERATELY NO LONGER ASKS HOW MANY VIDEOS ARE PLAYABLE. That is a COUNT, not a
     * judgement, and a count is what a deterministic query does perfectly and a model does
     * unreliably: a real back-to-back run answered `1` and then `4` on a byte-identical
     * page. The `4` was not a defect in the page — it is what happens when a model is
     * asked to enumerate DOM objects. Keeping it would have made a semantic claim carry a
     * structural one, so the structural half moved below, where it cannot flake.
     */
    const extracted = await stagehand.extract(
      "This is a single video's detail page. Extract: the large display title of the " +
        "video, the name of the person credited as its creator, and the scripture " +
        "reference printed in the small uppercase line above the title.",
      z.object({
        title: z.string(),
        creatorName: z.string(),
        scriptureReference: z.string(),
      }),
    );

    expect(extracted.title.toUpperCase()).toContain(subject.title.toUpperCase());
    expect(extracted.creatorName).toContain(subject.ownerDisplayName.split(" ")[0]);
    expect(extracted.scriptureReference.replace(/\s+/g, "").toUpperCase()).toContain(
      subject.scriptureReference.replace(/\s+/g, "").toUpperCase(),
    );

    // A detail page, not a grid: exactly one video element, one title, one creator.
    expect(await countTestId("gallery-watch-video")).toBe(1);
    expect(await countTestId("gallery-watch-title")).toBe(1);
    expect(await countTestId("gallery-watch-creator")).toBe(1);
    expect(
      await page.evaluate(
        () => document.querySelectorAll('[data-testid^="gallery-card-"]').length,
      ),
    ).toBe(0);
  });

  test("E-GW9: ‹ Gallery returns to /gallery and the grid re-hydrates", async () => {
    await gotoWatch(subject.id);
    expect(await testidText("nav-back")).toBe("‹ Gallery");

    await clickTestId("nav-back");
    await waitForHydrated(page, "gallery-grid", { timeoutMs: 60_000 });
    expect(await pathname()).toBe("/gallery");
    // The watch page's nav is a DIFFERENT variant — the site links come back.
    expect(await countTestId("nav-gallery")).toBeGreaterThan(0);
    expect(await countTestId("nav-back")).toBe(0);
  });

  test("E-GW10: an unknown id renders the not-found state with a way out", async () => {
    // Invented state (the design draws none) — asserted rather than assumed, because a
    // shareable public URL is exactly the one people mistype.
    await page.goto(`${BASE_URL}/gallery/e2e-gallery-item-does-not-exist`, {
      waitUntil: "load",
    });
    await waitForHydrated(page, "gallery-watch", { timeoutMs: 60_000 });
    await waitForWatchSettled();

    expect(await testidText("gallery-watch-notfound")).toContain(
      "We couldn't find that video.",
    );
    expect(await countTestId("gallery-watch-video")).toBe(0);
    await clickTestId("nav-back");
    await waitForHydrated(page, "gallery-grid", { timeoutMs: 60_000 });
    expect(await pathname()).toBe("/gallery");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Signed in, through the shipped `?seed=` seam. The fixture attributes its upvotes to
// the SAME `User` row this seam upserts (`viewerYouversionUserId`), so the pill's
// state and the vote it casts belong to one person.
// ─────────────────────────────────────────────────────────────────────────────

describe("upvote from the watch page signed in", () => {
  beforeAll(async () => {
    await gotoWatch(subject.id, { seeded: true });
  }, 120_000);

  test("E-GW6: the upvote pill toggles and the count moves by exactly one", async () => {
    const target = fixtures.publicItems.find((i) => !i.viewerHasUpvoted) ?? subject;
    await gotoWatch(target.id, { seeded: true });

    expect(await attrOf(`gallery-upvote-${target.id}`, "aria-pressed")).toBe("false");
    expect(await testidText(`gallery-upvote-count-${target.id}`)).toBe(
      String(target.upvoteCount),
    );

    await clickTestId(`gallery-upvote-${target.id}`);
    await pollAttr(`gallery-upvote-${target.id}`, "aria-pressed", "true");
    expect(await testidText(`gallery-upvote-count-${target.id}`)).toBe(
      String(target.upvoteCount + 1),
    );
    expect(await countTestId("gallery-signin-prompt")).toBe(0);

    // The pill is `disabled`/`aria-busy` until the POST settles — un-voting before that
    // would race a DELETE against its own POST. Waiting for it IS the proof it re-enables.
    await pollAttr(`gallery-upvote-${target.id}`, "aria-busy", "false");

    await clickTestId(`gallery-upvote-${target.id}`);
    await pollAttr(`gallery-upvote-${target.id}`, "aria-pressed", "false");
    await pollAttr(`gallery-upvote-${target.id}`, "aria-busy", "false");
    expect(await testidText(`gallery-upvote-count-${target.id}`)).toBe(
      String(target.upvoteCount),
    );
    //
    // NOTE ON THE FORMAT. Step 4 §1.4b draws `▲ 2,412` here and `▲ 2.4k` on a card, and
    // the two formatters are a real behavioural split. It is NOT provable at this layer:
    // a fixture's upvote count is backed by REAL `GalleryUpvote` rows and the helper
    // seeds 8 users, so no count here can exceed 8 — and "8" is identical under both
    // rules. The split is pinned where it is observable: `U-WV6` renders this component
    // with a 2412-count item, and `U-UC1` pins the two formatters against each other.
  });

  test("E-GW6b: signed in, the nav shows the profile pill instead of Sign in", async () => {
    expect(await countTestId("nav-profile-pill")).toBe(1);
    expect(await countTestId("signin-nav")).toBe(0);
    // …and the watch nav still has no site links, signed in or out.
    expect(await countTestId("nav-gallery")).toBe(0);
    expect(await h.isVisibleByTestId("nav-back")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Turn 16b — publish to the gallery (slice C8).
//
// ── WHO IS SIGNED IN, AND WHY IT IS NOT THE `?seed=` VIEWER ─────────────────────
// Publishing needs a render you OWN. The `?seed=authed-returning` viewer owns votes, not
// projects — every fixture render belongs to one of the eight seeded AUTHORS. So this
// block signs in as author 0 by planting that user's real session token, exactly as
// `gallery.e2e.ts`'s "Your videos" block does.
//
// ── WHERE A PUBLISHABLE RENDER COMES FROM ───────────────────────────────────────
// Every seeded render already HAS a gallery item (`GalleryItem.renderJobId` is unique),
// so none of them is publishable as seeded. Rather than teach the root seed helper to
// emit a spare, this block frees one through the shipped product: `DELETE /v1/gallery/:id`
// releases the render's unique slot and explicitly does NOT reclaim the S3 objects, which
// is precisely the un-publish → re-publish cycle the api's own `already_published`
// docblock documents. The freed render is a FILLER item, never an anchor — the anchors
// are what make the three sorts produce three different leaders.
//
// ── THIS BLOCK WRITES TO A GLOBAL SURFACE ───────────────────────────────────────
// Read the teardown note in the file header before adding a case here. Anything that
// publishes MUST record the resulting id in `publishedItemIds` before it can fail.
// ─────────────────────────────────────────────────────────────────────────────

describe("publish to the gallery through the 16b dialog", () => {
  let owner: { id: string; sessionToken: string };
  let ownerProject: FixtureProjectLike;
  /** The item sacrificed to free a publishable render, and that render. */
  let freed: FixtureItemLike;
  let expectedLabel: string;
  /** What E-GP4 types, and therefore what its watch page must show. */
  const publishedTitle = `E2E Publish ${RUN_ID}`;

  beforeAll(async () => {
    owner = fixtures.users[0];
    const owned = fixtures.publicItems.filter((i) => i.ownerId === owner.id);
    expect(owned.length, "fixture author 0 owns no public item").toBeGreaterThan(0);
    // The LAST one: the first four public items are the sort anchors, and un-publishing
    // an anchor would change which item leads `newest`/`popular`/`trending`.
    freed = owned[owned.length - 1];

    const project = fixtures.projects.find((p) => p.id === freed.projectId);
    expect(project, `no fixture project for ${freed.projectId}`).toBeTruthy();
    ownerProject = project!;
    expectedLabel = `${ownerProject.slug} · v${FIXTURE_SEMVER}`;

    // Free the render's unique gallery slot, as its owner, through the real route.
    const status = await unpublishAsOwner(freed.id, owner.sessionToken);
    expect(status, `un-publishing ${freed.id} to free its render failed`).toBe(200);

    await stagehand.context.clearCookies();
    await stagehand.context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: owner.sessionToken,
        // `domain` + `path`, never alongside `url` — the understudy rejects both forms
        // together ("should have either url or path, not both").
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }, 120_000);

  /** Open `/gallery`, click `＋ Share yours`, and wait for the picker to be populated. */
  async function openPublishDialogFromGallery() {
    await page.goto(`${BASE_URL}/gallery`, { waitUntil: "load" });
    await waitForHydrated(page, "gallery-grid", { timeoutMs: 60_000 });
    await clickTestId("gallery-share-yours");
    await waitForTestId("publish-dialog", 30_000);
    await waitForPickerPopulated();
  }

  /** The picker starts empty while three requests are in flight; every assertion below
   *  is about what it holds AFTER the join, so waiting for a non-empty value is the
   *  settle signal — the same "hydration is not data" rule the grid needs. */
  async function waitForPickerPopulated(timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    let last = "";
    while (Date.now() < deadline) {
      last = await valueOf("publish-project");
      if (last.length > 0) return;
      await page.waitForTimeout(200);
    }
    throw new Error(`the PROJECT picker never populated in ${timeoutMs}ms (value "${last}")`);
  }

  /**
   * Wait for the Your-videos list to hold DATA, not merely to have mounted.
   *
   * `waitForHydrated("your-videos-list")` proves the island mounted; the rows arrive from
   * a fetch that resolves after it, and until then the container renders
   * `your-videos-loading` and no `your-videos-card-*` at all. Scanning for a row action in
   * that window finds nothing and fails as "no row offered Share to gallery" — a lie about
   * the product, since the affordance is merely unrendered.
   *
   * NOT hypothetical: in the double-run teardown proof (2026-07-26) run A failed E-GP7
   * exactly this way while run B, against a warmer `next dev`, passed with the same
   * fixtures. Same "hydration is not data" rule `waitForPickerPopulated` above exists for,
   * and the same second settle wait the gallery grid needed (memory `gallery-ui-built`).
   *
   * It waits for the list to be LOADED, never for the affordance under assertion — waiting
   * for the thing the test claims would make the claim vacuous.
   */
  async function waitForYourVideosLoaded(timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const loading = await countTestId("your-videos-loading");
      const cards = await page.locator('[data-testid^="your-videos-card-"]').count();
      if (loading === 0 && cards > 0) return;
      await page.waitForTimeout(200);
    }
    throw new Error(`the Your videos list never rendered a card in ${timeoutMs}ms`);
  }

  test("E-GP1: the gallery header's ＋ Share yours opens the publish dialog with a PROJECT picker", async () => {
    await openPublishDialogFromGallery();

    // The placeholder this replaces linked to another page instead of picking a render.
    // Its testid must not come back.
    expect(await countTestId("gallery-share-dialog")).toBe(0);
    expect(await countTestId("publish-project")).toBe(1);
    expect(await countTestId("publish-title")).toBe(1);
    expect(await countTestId("publish-passage")).toBe(1);
    expect(await countTestId("publish-translation")).toBe(1);
    expect(await countTestId("publish-submit")).toBe(1);
    // The freed render is offered, because it is the only thing that makes 16b usable
    // from here at all.
    const values = await page.evaluate(() => {
      const el = document.querySelector<HTMLSelectElement>(
        '[data-testid="publish-project"]',
      );
      return el ? Array.from(el.options).map((o) => o.value) : [];
    });
    expect(values).toContain(freed.renderJobId);
  });

  test("E-GP2: the PROJECT option label reads \"<slug> · v<semver>\"", async () => {
    await selectByTestId("publish-project", freed.renderJobId);
    await waitForPickerPopulated();

    const labels = await optionLabels("publish-project");
    // The D8 join, end to end against real seeded rows: the slug comes from `Project`,
    // the semver from `ProjectVersion`, and NO endpoint carries the two together.
    expect(labels, `no option labelled ${expectedLabel}`).toContain(expectedLabel);
    // Not an opaque id, which is what the render DTO alone could have produced.
    expect(labels.every((l) => !l.startsWith("e2e-gallery-"))).toBe(true);
  });

  test("E-GP3: Publish to gallery is DISABLED until title, passage AND consent are all satisfied", async () => {
    await openPublishDialogFromGallery();
    await selectByTestId("publish-project", freed.renderJobId);

    // The design draws this box already ticked. It ships unchecked, deliberately.
    expect(await propOf("publish-consent", "checked")).toBe(false);
    expect(await propOf("publish-submit", "disabled")).toBe(true);

    await typeIntoTestId("publish-title", publishedTitle);
    expect(await propOf("publish-submit", "disabled")).toBe(true);

    await typeIntoTestId("publish-passage", "Psalm 23:1-6");
    // Title + passage are filled and it is STILL refused — consent is the gate.
    expect(await propOf("publish-submit", "disabled")).toBe(true);

    await clickTestId("publish-consent");
    expect(await propOf("publish-consent", "checked")).toBe(true);
    expect(await propOf("publish-submit", "disabled")).toBe(false);
  });

  test("E-GP4: publishing creates a real public item and lands on its watch page", async () => {
    await openPublishDialogFromGallery();
    await selectByTestId("publish-project", freed.renderJobId);
    await typeIntoTestId("publish-title", publishedTitle);
    await typeIntoTestId("publish-passage", "Psalm 23:1-6");
    await clickTestId("publish-consent");

    /*
     * FROM THE CLICK ON, A LIVE PUBLIC ROW MAY EXIST — so from the click on, cleanup is
     * a `finally`, not a statement somewhere in the happy path.
     *
     * The previous shape read the new id off the watch-page URL and registered it four
     * assertions in. Every one of those four could fail, and the two waits above them
     * could time out, and any of those outcomes stranded a row the fixture gate cannot
     * match — a live PUBLIC row that only the `ON DELETE CASCADE` on
     * `GalleryItem.renderJobId` would eventually sweep up, and only if teardown ran at
     * all. Registration is now driven by the run-unique TITLE
     * through the anonymous listing, so it does not depend on the navigation landing,
     * on the id being readable, or on this test reaching its end at all.
     */
    try {
      await clickTestId("publish-submit");

      // The terminus: the dialog closes and we are looking at the published thing.
      await waitForHydrated(page, "gallery-watch", { timeoutMs: 60_000 });
      await waitForWatchSettled();

      const path = await pathname();
      const match = /^\/gallery\/([^/]+)$/.exec(path);
      expect(match, `expected a watch-page path, got ${path}`).toBeTruthy();
      const newId = match![1];
      publishedItemIds.add(newId);

      // A server-minted cuid, NOT a fixture id — which is exactly why teardown tracks it.
      expect(newId.startsWith("e2e-gallery-")).toBe(false);
      expect(await testidText("gallery-watch-title")).toBe(publishedTitle);
      expect(await countTestId("gallery-watch-notfound")).toBe(0);

      // It is genuinely PUBLIC: an item the anonymous listing can see.
      const listed = await fetch(
        `${BASE_URL}/api/gallery?sort=newest&q=${encodeURIComponent(publishedTitle)}`,
      ).then((r) => r.json() as Promise<{ items: { id: string }[] }>);
      expect(listed.items.map((i) => i.id)).toContain(newId);
    } finally {
      // Registers, never asserts. An `expect` here would replace whatever the `try`
      // was failing with, and the point of this block is to clean up after that
      // failure, not to hide it. A loud log is the honest way to say "a row may exist
      // that I could not find" — the drain's own missing-delete warning has the same
      // job for the same reason.
      const registered = await registerPublishedByTitlePrefix(publishedTitle);
      if (registered.length === 0) {
        console.error(
          `[gallery-watch.e2e] E-GP4 registered NOTHING for teardown: no public item ` +
            `titled "${publishedTitle}" was listable. If the publish DID succeed, that ` +
            "row is now a leak — check GalleryItem before the next real-lane run.",
        );
      }
    }
  });

  test("E-GP5: publishing the same render twice surfaces the api's already_published refusal verbatim", async () => {
    await openPublishDialogFromGallery();
    await selectByTestId("publish-project", freed.renderJobId);
    await typeIntoTestId("publish-title", `${publishedTitle} again`);
    await typeIntoTestId("publish-passage", "Psalm 23:1-6");
    await clickTestId("publish-consent");
    // Same discipline as E-GP4, for a click this test expects to be REFUSED: the
    // registration is cheap, the title prefix is the run's own, and it is the api's
    // answer — not this test's expectation of it — that decides whether a row exists.
    try {
      await clickTestId("publish-submit");
    } finally {
      await registerPublishedByTitlePrefix(`${publishedTitle} again`, 3_000);
    }

    await waitForTestId("publish-error", 30_000);
    // The api's own words, through the BFF's verbatim pass-through. NOT a house
    // sentence: "already published" and "we can't tell which book that is" have
    // completely different fixes, and only the api knows which happened.
    expect(await testidText("publish-error")).toBe(
      "render is already published to the gallery",
    );
    // An error state with no way out is a dead end.
    expect(await countTestId("publish-dialog")).toBe(1);
    expect(await propOf("publish-submit", "disabled")).toBe(false);
    // …and nothing was created the second time.
    expect(await pathname()).toBe("/gallery");
  });

  test("E-GP6: Allow remixes, Show my GitHub repo and Change cover frame are present, disabled and tooltipped", async () => {
    for (const testId of [
      "publish-toggle-remixes",
      "publish-toggle-repo",
      "publish-cover-change",
    ]) {
      expect(await countTestId(testId), `${testId} is missing`).toBe(1);
      expect(await attrOf(testId, "aria-disabled"), `${testId} is not disabled`).toBe(
        "true",
      );
      const tip = await attrOf(testId, "title");
      expect((tip ?? "").length, `${testId} carries no tooltip`).toBeGreaterThan(0);
    }

    // Inert, not merely styled inert: clicking must change nothing observable. No native
    // `disabled` is used, so the click genuinely lands.
    const before = await valueOf("publish-project");
    await clickTestId("publish-toggle-repo").catch(() => undefined);
    await page.waitForTimeout(300);
    expect(await attrOf("publish-toggle-repo", "aria-checked")).toBe("false");
    expect(await valueOf("publish-project")).toBe(before);
    expect(await countTestId("publish-dialog")).toBe(1);
  });

  test("E-GP7: the same dialog opens from Your videos preselected, and switching PROJECT resets title and passage", async () => {
    await page.goto(`${BASE_URL}/your-videos`, { waitUntil: "load" });
    await waitForHydrated(page, "your-videos-list", { timeoutMs: 60_000 });
    await waitForYourVideosLoaded();

    const owned = fixtures.items.filter((i) => i.ownerId === owner.id);
    const rows = owned.map((i) => i.renderJobId);
    expect(rows.length, "author 0 owns fewer than two renders").toBeGreaterThan(1);

    // Whichever row still offers the affordance — the one E-GP4 published now shows
    // "Open project" instead, and that is correct.
    let opened: string | null = null;
    for (const renderId of rows) {
      if ((await countTestId(`your-videos-publish-${renderId}`)) > 0) {
        await clickTestId(`your-videos-publish-${renderId}`);
        opened = renderId;
        break;
      }
    }
    expect(opened, "no row on Your videos offered Share to gallery").toBeTruthy();

    await waitForTestId("publish-dialog", 30_000);
    await waitForPickerPopulated();
    // ONE dialog, two entry points: the row action preselects its own render, which is
    // what makes "publish THIS video" and "publish A video" the same screen.
    expect(await valueOf("publish-project")).toBe(opened);

    await typeIntoTestId("publish-title", "Wrong video's title");
    await typeIntoTestId("publish-passage", "Genesis 1:1-5");
    expect(await valueOf("publish-title")).toBe("Wrong video's title");

    const other = rows.find((r) => r !== opened)!;
    await selectByTestId("publish-project", other);
    await waitForPickerPopulated();

    // THE RULE THE 22-LINE COMMENT PROTECTED, now executable: `scriptureReference` is
    // what the server derives `scriptureBook` from AND what prints verbatim on a public
    // card, so carrying A's passage into B publishes B under A's reference.
    expect(await valueOf("publish-project")).toBe(other);
    expect(await valueOf("publish-title")).toBe("");
    expect(await valueOf("publish-passage")).toBe("");
    expect(await propOf("publish-consent", "checked")).toBe(false);
    expect(await propOf("publish-submit", "disabled")).toBe(true);
  });

  /**
   * E-GP8 — THE PHONE VIEWPORTS. This is the case whose absence let the whole action
   * row ship off-screen.
   *
   * Every other case in this file runs at 1440×1000, where the 16b dialog fits with
   * room to spare, so none of them can see the defect: the shared `Modal` painted its
   * panel into a `position: fixed` backdrop with no scroll container of its own, so a
   * panel taller than the viewport simply extended past the bottom of the screen with
   * nothing — not the page, not the backdrop — able to scroll to it. At 375×667 the
   * dialog could be completely filled in and never submitted.
   *
   * The claim is deliberately about REACHABILITY, not about pixels: bring the control
   * into view the way a person's thumb would, then require that the browser's own
   * hit-testing puts it on top at its centre. A geometry-only assertion would pass for
   * a button sitting under the scrim.
   */
  test("E-GP8: on phone viewports Publish and ✕ are both reachable, and nothing scrolls sideways", async () => {
    // Three real handset viewports: the classic 4.7", a modern iPhone with the browser
    // chrome subtracted, and the Android baseline that is still the narrowest thing
    // worth supporting.
    const phones = [
      { label: "375×667", width: 375, height: 667 },
      { label: "390×664", width: 390, height: 664 },
      { label: "360×640", width: 360, height: 640 },
    ];

    try {
      for (const phone of phones) {
        await page.setViewportSize(phone.width, phone.height);
        await openPublishDialogFromGallery();

        // ✕ is modal chrome and is PINNED — it must be in view with nothing scrolled.
        const close = await boxOfTestId("modal-close");
        expect(close, `${phone.label}: modal-close is not in the DOM`).toBeTruthy();
        expect(close!.top, `${phone.label}: ✕ is above the viewport`).toBeGreaterThanOrEqual(0);
        expect(
          close!.bottom,
          `${phone.label}: ✕ is below the fold (bottom ${close!.bottom} > ${phone.height})`,
        ).toBeLessThanOrEqual(phone.height);

        // Publish sits at the very bottom of the body, which is the part that scrolls.
        await scrollTestIdIntoView("publish-submit");
        const submit = await boxOfTestId("publish-submit");
        expect(submit, `${phone.label}: publish-submit is not in the DOM`).toBeTruthy();
        expect(
          submit!.bottom,
          `${phone.label}: Publish is off the bottom of the screen (bottom ${submit!.bottom} > ${phone.height}) — it cannot be tapped`,
        ).toBeLessThanOrEqual(phone.height);
        expect(submit!.top, `${phone.label}: Publish is above the viewport`).toBeGreaterThanOrEqual(0);
        expect(submit!.width, `${phone.label}: Publish has no width`).toBeGreaterThan(0);

        // Cancel travels with it — the row is one control group, not one button.
        const cancel = await boxOfTestId("publish-cancel");
        expect(cancel!.bottom, `${phone.label}: Cancel is off the bottom`).toBeLessThanOrEqual(
          phone.height,
        );

        // Not merely inside the box — genuinely on top, per the browser's own hit test.
        const hit = await topmostTestIdAt(
          submit!.left + submit!.width / 2,
          submit!.top + submit!.height / 2,
        );
        expect(hit, `${phone.label}: something else is on top of Publish`).toBe(
          "publish-submit",
        );

        // ✕ is still where it was after the body scrolled — the header is pinned.
        const closeAfter = await boxOfTestId("modal-close");
        expect(closeAfter!.top, `${phone.label}: ✕ scrolled away with the body`).toBe(
          close!.top,
        );

        // A dialog that fits the width of the screen: no sideways scroll, ever.
        expect(
          await bodyScrollsHorizontally(),
          `${phone.label}: the document scrolls horizontally`,
        ).toBe(false);
        expect(
          submit!.right,
          `${phone.label}: Publish overflows the right edge`,
        ).toBeLessThanOrEqual(phone.width);
      }

      // …and the reachable control is genuinely OPERABLE, not just visible. Re-publishing
      // the render E-GP4 already published is the one click that proves the tap lands
      // while creating nothing: the api answers `already_published`, which is a refusal,
      // not a row. (Skipped if E-GP4 did not run — this must never depend on the leftover
      // being there.)
      if (publishedItemIds.size > 0) {
        await page.setViewportSize(375, 667);
        await openPublishDialogFromGallery();
        await selectByTestId("publish-project", freed.renderJobId);
        await typeIntoTestId("publish-title", `${publishedTitle} on a phone`);
        await typeIntoTestId("publish-passage", "Psalm 23:1-6");
        await clickTestId("publish-consent");
        await scrollTestIdIntoView("publish-submit");
        try {
          await clickTestId("publish-submit");
        } finally {
          await registerPublishedByTitlePrefix(`${publishedTitle} on a phone`, 3_000);
        }
        await waitForTestId("publish-error", 30_000);
        expect(await testidText("publish-error")).toBe(
          "render is already published to the gallery",
        );
      }
    } finally {
      // Every later file in this lane inherits the viewport; restoring it is not
      // tidiness.
      await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);
    }
  });
});
