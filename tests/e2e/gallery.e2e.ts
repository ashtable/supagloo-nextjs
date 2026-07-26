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
 * Row 41 — the public gallery + "Your videos", end to end (plan §5.6).
 *
 * REAL-STACK LANE (`vitest.e2e.real.config.ts` → `npm run test:e2e:real`): browser →
 * the nextjs BFF → the containerised `supagloo-nodejs-api` → Postgres + MinIO. No
 * GitHub and no provider egress is involved: nothing here scaffolds a repo or runs a
 * generation, which is why this spec is comparatively cheap despite living in the
 * heavy lane.
 *
 * ── SEEDING (the one genuinely hard problem, and how it is solved) ───────────────
 * `GET /v1/gallery` reads published `GalleryItem` rows, and reaching a publishable
 * `RenderJob` honestly would mean a minutes-long Remotion render per fixture. So the
 * rows come from the ROOT repo's `tests/support/gallery-e2e-seed.mjs`, dynamic-imported
 * through the SAME `SUPAGLOO_ROOT_DIR ?? ../supagloo` seam `github-e2e.ts` already uses
 * (root owns `pg` + `@aws-sdk/client-s3`, and Node resolves bare specifiers relative to
 * the IMPORTING module — so this repo needs neither dependency).
 *
 * Two properties of that helper shape this file:
 *   1. **Every fixture row's id carries `e2e-gallery-`**, and the teardown deletes
 *      nothing else. Unlike the GitHub harness there IS teardown here, because the
 *      gallery listing is GLOBAL — leftovers from a previous run would rot the rank,
 *      pagination and search assertions below. Two gallery specs must therefore never
 *      run concurrently against one database.
 *   2. **`assertNoForeignGalleryItems()` throws** if the database already holds public
 *      items this helper did not write. Loud, never a `console.warn` + skip: with
 *      somebody else's rows present, every ordering assertion here is measuring the
 *      wrong data.
 *
 * The BROWSER's identity still comes from the shipped `?seed=authed-returning&nonce=`
 * seam, unchanged. Passing `viewerYouversionUserId: yv-e2e-returning-<RUN_ID>` makes the
 * two seeds converge on ONE `User` row, so the upvote the fixtures attribute to "the
 * viewer" and the vote the browser casts belong to the same user.
 *
 * ── TECHNIQUE (plan §5.6) ────────────────────────────────────────────────────────
 * Deterministic DOM helpers for everything mechanical; ONE `stagehand.extract` for the
 * single genuinely semantic claim (E-GU3 — "this reads as a gallery of scripture
 * videos"); and **no `stagehand.agent`**: every step here is a known click on a known
 * testid, so an agent would trade determinism for nothing.
 *
 * Every interaction is preceded by `waitForHydrated("gallery-grid")` (§11.9's rule).
 * The grid is MOUNT-GATED (D14), so its testid is an honest post-hydration signal —
 * an SSR'd grid is the exact shape that produced row 68's lost-event failures.
 *
 * E-GU5 does not exist: the book filter was cut on 2026-07-26 (§5.2). Later ids keep
 * their numbers so cross-references still resolve.
 */

const BASE_URL = "http://localhost:3000";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SEED_QUERY = `seed=authed-returning&nonce=${RUN_ID}`;
const VIEWPORT = { width: 1440, height: 1000 };

// ── the root seeding helper, through the established root-import seam ────────

const SEED_MODULE_REL = "tests/support/gallery-e2e-seed.mjs";

/**
 * The helper's runtime surface, as THIS spec consumes it. Declared structurally rather
 * than imported from root's `.d.mts`: the module is resolved at runtime from a path
 * this repo's `tsconfig` does not include, so a `typeof import(...)` would only
 * typecheck on a machine that happens to have the sibling checkout.
 */
interface FixtureItemLike {
  id: string;
  renderJobId: string;
  title: string;
  searchToken: string;
  durationSeconds: number;
  fps: number;
  framesTotal: number;
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  scriptureReference: string;
  ownerId: string;
}

interface GallerySeedModule {
  GALLERY_PAGE_SIZE: number;
  assertNoForeignGalleryItems(options?: unknown): Promise<void>;
  seedGalleryFixtures(options?: unknown): Promise<{
    runToken: string;
    pageSize: number;
    users: { id: string; youversionUserId: string; sessionToken: string }[];
    viewer: { id: string; sessionToken: string };
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
      `[gallery.e2e] the gallery seeding helper is missing: ${abs}\n` +
        `  It lives in the ROOT supagloo repo (plan §5.6) and is the only writer of the\n` +
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

// ── deterministic DOM helpers ────────────────────────────────────────────────

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
async function attrOf(id: string, attr: string): Promise<string | null> {
  return page.evaluate(
    ({ sel, a }) =>
      document.querySelector<HTMLElement>(`[data-testid="${sel}"]`)?.getAttribute(a) ??
      null,
    { sel: id, a: attr },
  );
}
/** Every gallery item id currently in the DOM, in visual order. */
async function cardIds(): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid^="gallery-card-"]'),
    ).map((el) => el.getAttribute("data-item-id") ?? ""),
  );
}
async function waitForTestId(id: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(id)) > 0) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`[data-testid="${id}"] never appeared within ${timeoutMs}ms`);
}
/** Poll until the grid holds `n` cards (a page load / a sort switch is async). */
async function waitForCardCount(n: number, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    last = (await cardIds()).length;
    if (last === n) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`grid held ${last} cards, expected ${n}, after ${timeoutMs}ms`);
}
/**
 * Poll until page 1 has SETTLED — cards on screen, or the grid's own empty/error state.
 * Every anonymous assertion below needs this: `waitForHydrated` returns as soon as the
 * grid mounts, which is BEFORE its first request resolves (the grid renders its loading
 * placeholder inside the same container, on purpose, so the hydration gate stays stable).
 */
async function waitForGridSettled(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => ({
      cards: document.querySelectorAll('[data-testid^="gallery-card-"]').length,
      empty: document.querySelectorAll('[data-testid="gallery-empty"]').length,
      error: document.querySelectorAll('[data-testid="gallery-error"]').length,
    }));
    if (snap.cards > 0 || snap.empty > 0 || snap.error > 0) return;
    last = JSON.stringify(snap);
    await page.waitForTimeout(200);
  }
  throw new Error(`the gallery grid never settled in ${timeoutMs}ms (last ${last})`);
}

/**
 * Poll until "Your videos" has SETTLED — cards, or its own empty state. Same reason as
 * {@link waitForGridSettled}: the list mounts before its first request resolves, and a
 * hydration gate is a hydration gate, not a data gate.
 */
async function waitForYourVideosSettled(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => ({
      cards: document.querySelectorAll('[data-testid^="your-videos-card-"]').length,
      empty: document.querySelectorAll('[data-testid="your-videos-empty"]').length,
    }));
    if (snap.cards > 0 || snap.empty > 0) return;
    last = JSON.stringify(snap);
    await page.waitForTimeout(200);
  }
  throw new Error(`Your videos never settled in ${timeoutMs}ms (last ${last})`);
}

/** Poll until the first card's id changes away from `previous`. */
async function waitForFirstCardOtherThan(previous: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let ids: string[] = [];
  while (Date.now() < deadline) {
    ids = await cardIds();
    if (ids.length > 0 && ids[0] !== previous) return ids;
    await page.waitForTimeout(150);
  }
  throw new Error(
    `the first card stayed ${previous} after ${timeoutMs}ms (saw ${ids.length} cards)`,
  );
}

/** Open `/gallery`, anonymous or seeded, and wait past the mount gate. */
async function gotoGallery(opts: { seeded?: boolean } = {}) {
  const url = opts.seeded ? `${BASE_URL}/gallery?${SEED_QUERY}` : `${BASE_URL}/gallery`;
  await page.goto(url, { waitUntil: "load" });
  await waitForHydrated(page, "gallery-grid", { timeoutMs: 60_000 });
  await waitForGridSettled();
}

/**
 * Type into the React-controlled search input via the native setter + a bubbling
 * `input` event. A plain `.type()` is swallowed by a controlled input — the exact
 * seam `studio-hydration.e2e.ts` uses for the script textarea.
 */
async function typeIntoSearch(value: string): Promise<void> {
  await page.evaluate((v) => {
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="gallery-search-input"]',
    );
    if (!input) throw new Error("gallery-search-input is not in the DOM");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

beforeAll(async () => {
  seed = await loadSeedModule();

  // LOUD, never a skip: with foreign public items present every ordering, rank and
  // pagination assertion below is measuring somebody else's data.
  await seed.assertNoForeignGalleryItems();

  fixtures = await seed.seedGalleryFixtures({
    runId: RUN_ID,
    // Converge on the SAME User row the browser's `?seed=` seam upserts, so the
    // fixture upvotes and the browser session belong to one user.
    viewerYouversionUserId: `yv-e2e-returning-${RUN_ID}`,
  });

  stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient: await glooLlmClient(),
  });
  await stagehand.init();
  page = stagehand.context.pages()[0];
  h = makeHelpers(page);
  await page.setViewportSize(VIEWPORT.width, VIEWPORT.height);

  // Warm `/gallery` + `/api/gallery` once, outside any test. `next dev` compiles a route
  // on its FIRST request, and the containerised api was recreated moments ago by the
  // lane's globalSetup — so the very first load is the one most likely to be slow or to
  // land on an api that is still binding its port. Paying for that here means a test
  // failure below is about the gallery, not about a cold start.
  await gotoGallery();
}, 300_000);

afterAll(async () => {
  await stagehand?.close();
  // The listing is global — leftovers rot the next run's rank/pagination/search
  // assertions, so teardown is mandatory here even though the GitHub harness has none.
  await seed?.clearGalleryFixtures();
});

// ─────────────────────────────────────────────────────────────────────────────
// Anonymous browsing. Runs FIRST and with the cookie jar emptied: `/gallery` is the
// app's one public page and anonymous is its natural path, not a special case.
// ─────────────────────────────────────────────────────────────────────────────

describe("browse the gallery signed out", () => {
  beforeAll(async () => {
    await stagehand.context.clearCookies();
    await gotoGallery();
  }, 120_000);

  test("E-GU1: the grid renders the seeded cards and the nav offers sign-in", async () => {
    await waitForCardCount(Math.min(fixtures.pageSize, fixtures.publicItems.length));
    const ids = await cardIds();
    expect(ids.length).toBe(Math.min(fixtures.pageSize, fixtures.publicItems.length));
    // Every rendered id is one of ours (assertNoForeignGalleryItems already proved the
    // database holds nothing else, so this is the DOM half of the same claim).
    const seeded = new Set(fixtures.publicItems.map((i) => i.id));
    expect(ids.every((id) => seeded.has(id))).toBe(true);

    expect(await h.isVisibleByTestId("signin-nav")).toBe(true);
    expect(await countTestId("nav-profile-pill")).toBe(0);
  });

  test("E-GU1b: an UNLISTED item never appears in the public listing", async () => {
    // The fixture's unlisted rows are the MOST-upvoted in the set, so a broken
    // visibility filter takes over the top of every sort rather than hiding quietly.
    await clickTestId("gallery-sort-popular");
    await waitForCardCount(fixtures.pageSize);
    const ids = await cardIds();
    // Guard against a vacuous pass: "no unlisted item is present" is trivially true of
    // an empty grid.
    expect(ids.length).toBe(fixtures.pageSize);
    for (const unlisted of fixtures.unlistedItems) {
      expect(ids, `unlisted ${unlisted.id} leaked into the public grid`).not.toContain(
        unlisted.id,
      );
    }
  });

  test("E-GU2: the header copy is exact", async () => {
    const text = await h.bodyText();
    for (const anchor of [
      "COMMUNITY GALLERY",
      "SCRIPTURE, SHARED.",
      "Every video here started as a verse. Watch what the community has made, upvote what moves you, and publish your own.",
      "＋ Share yours",
    ]) {
      expect(text, `missing exact anchor ${JSON.stringify(anchor)}`).toContain(anchor);
    }
  });

  test("E-GU3: the grid reads as a gallery of scripture videos (semantic extract)", async () => {
    await clickTestId("gallery-sort-popular");
    await waitForCardCount(fixtures.pageSize);
    const ids = await cardIds();
    const first = fixtures.publicItems.find((i) => i.id === ids[0]);
    expect(first, "the first card is not one of the seeded items").toBeTruthy();

    const { title, scriptureReference, duration } = await stagehand.extract(
      "Looking at the FIRST video card in the gallery grid (top-left), extract: the " +
        "large display title printed across the bottom of its poster image, the small " +
        "scripture reference line directly under that title, and the duration badge " +
        "shown in the bottom-right corner of the poster.",
      z.object({
        title: z.string(),
        scriptureReference: z.string(),
        duration: z.string(),
      }),
    );

    expect(title).toContain(first!.title);
    expect(scriptureReference.replace(/\s+/g, "")).toContain(
      first!.scriptureReference.replace(/\s+/g, ""),
    );
    const mins = Math.floor(first!.durationSeconds / 60);
    const secs = String(first!.durationSeconds % 60).padStart(2, "0");
    expect(duration).toContain(`${mins}:${secs}`);
  });

  test("E-GU4: switching sort re-orders the grid and moves aria-pressed", async () => {
    await clickTestId("gallery-sort-popular");
    await waitForCardCount(fixtures.pageSize);
    expect(await attrOf("gallery-sort-popular", "aria-pressed")).toBe("true");
    const popularIds = await cardIds();
    expect(popularIds[0]).toBe(fixtures.leaders.popular);

    await clickTestId("gallery-sort-newest");
    const newestIds = await waitForFirstCardOtherThan(popularIds[0]);
    expect(await attrOf("gallery-sort-newest", "aria-pressed")).toBe("true");
    expect(await attrOf("gallery-sort-popular", "aria-pressed")).toBe("false");
    expect(newestIds[0]).toBe(fixtures.leaders.newest);

    await clickTestId("gallery-sort-trending");
    await waitForFirstCardOtherThan(newestIds[0]);
    expect(await attrOf("gallery-sort-trending", "aria-pressed")).toBe("true");
    const trendingIds = await cardIds();
    // Plan D3's P5, asserted as a PROPERTY rather than against a re-implemented
    // gravity formula: trending's leader is neither the newest nor the popular one.
    expect(trendingIds[0]).not.toBe(fixtures.leaders.newest);
    expect(trendingIds[0]).not.toBe(fixtures.leaders.popular);
  });

  test("E-GU4b: a sort switch RESETS pagination (no page-2 rows survive)", async () => {
    await clickTestId("gallery-sort-popular");
    await waitForCardCount(fixtures.pageSize);
    await clickTestId("gallery-load-more");
    await waitForCardCount(fixtures.publicItems.length);

    await clickTestId("gallery-sort-newest");
    // A preserved cursor would page a DIFFERENT ordering; the grid must fall back to
    // exactly one page.
    await waitForCardCount(fixtures.pageSize);
  });

  test("E-GU6: search narrows the grid to exactly one card", async () => {
    await clickTestId("gallery-sort-popular");
    await waitForCardCount(fixtures.pageSize);

    await clickTestId("gallery-search-toggle");
    await waitForTestId("gallery-search-input");

    const target = fixtures.publicItems[3];
    await typeIntoSearch(target.searchToken);
    await waitForCardCount(1);
    expect((await cardIds())[0]).toBe(target.id);

    // Clearing restores the full first page.
    await typeIntoSearch("");
    await waitForCardCount(fixtures.pageSize);
  });

  test("E-GU7: Load more appends page 2, de-dupes, then disappears at exhaustion", async () => {
    await clickTestId("gallery-sort-popular");
    await waitForCardCount(fixtures.pageSize);
    expect(await h.isVisibleByTestId("gallery-load-more")).toBe(true);

    await clickTestId("gallery-load-more");
    await waitForCardCount(fixtures.publicItems.length);

    const ids = await cardIds();
    expect(new Set(ids).size, `duplicate ids in the DOM: ${ids.join(",")}`).toBe(
      ids.length,
    );
    // `nextCursor === null` means GENUINELY exhausted, which is what lets the button
    // hide honestly.
    await h.waitForGone("gallery-load-more");
  });

  test("E-GU8: rank badges follow the popular ordering (trophy at #1, none past #3)", async () => {
    await clickTestId("gallery-sort-popular");
    await waitForCardCount(fixtures.pageSize);
    const ids = await cardIds();

    expect(await testidText(`gallery-rank-${ids[0]}`)).toBe("🏆 #1");
    expect(await testidText(`gallery-rank-${ids[1]}`)).toBe("#2");
    expect(await testidText(`gallery-rank-${ids[2]}`)).toBe("#3");
    expect(await countTestId(`gallery-rank-${ids[3]}`)).toBe(0);
  });

  test("E-GU8b: NO rank badge is rendered under a non-popular sort", async () => {
    // `rank` is a property of the global POPULAR ordering; the API sends null under
    // the other two sorts and a "#7" badge there would assert something untrue.
    await clickTestId("gallery-sort-newest");
    await waitForCardCount(fixtures.pageSize);
    const ids = await cardIds();
    for (const id of ids.slice(0, 4)) {
      expect(await countTestId(`gallery-rank-${id}`), `rank badge on ${id}`).toBe(0);
    }
  });

  test("E-GU9: an anonymous upvote opens the sign-in prompt and changes nothing", async () => {
    await clickTestId("gallery-sort-popular");
    await waitForCardCount(fixtures.pageSize);
    const id = (await cardIds())[0];

    const before = await testidText(`gallery-upvote-count-${id}`);
    expect(await attrOf(`gallery-upvote-${id}`, "aria-pressed")).toBe("false");

    await clickTestId(`gallery-upvote-${id}`);
    await waitForTestId("gallery-signin-prompt", 10_000);

    expect(await testidText(`gallery-upvote-count-${id}`)).toBe(before);
    expect(await attrOf(`gallery-upvote-${id}`, "aria-pressed")).toBe("false");
    expect(await attrOf(`gallery-upvote-${id}`, "data-voted")).toBe("false");
  });

  test("E-GU11: the ▶ opens the player and the video actually loads metadata", async () => {
    await clickTestId("modal-close").catch(() => undefined); // dismiss the prompt if open
    await page.waitForTimeout(200);
    await clickTestId("gallery-sort-popular");
    await waitForCardCount(fixtures.pageSize);
    const id = (await cardIds())[0];

    await clickTestId(`gallery-play-${id}`);
    await waitForTestId("gallery-player", 15_000);
    await waitForTestId("gallery-player-video", 15_000);

    const src = await page.evaluate(
      () =>
        document.querySelector<HTMLVideoElement>(
          '[data-testid="gallery-player-video"]',
        )?.currentSrc ?? "",
    );
    // The presigned URL points at the PUBLIC S3 endpoint (MinIO in Compose), never at
    // the app origin — the browser fetches the object directly.
    expect(src).toMatch(/^https?:\/\//);
    expect(src).not.toContain(BASE_URL);
    expect(src).toContain("X-Amz-Signature");

    // `readyState > 0` (HAVE_METADATA) rather than a play assertion: headless autoplay
    // is unreliable, but a genuinely playable object always reaches metadata. This is
    // ALSO the only assertion that would catch a missing S3 object, because
    // `presignPublicKey` signs locally and returns 200 either way.
    const deadline = Date.now() + 20_000;
    let readyState = 0;
    while (Date.now() < deadline) {
      readyState = await page.evaluate(
        () =>
          document.querySelector<HTMLVideoElement>(
            '[data-testid="gallery-player-video"]',
          )?.readyState ?? 0,
      );
      if (readyState > 0) break;
      await page.waitForTimeout(250);
    }
    expect(readyState, "the <video> never loaded metadata").toBeGreaterThan(0);

    await clickTestId("modal-close");
    await h.waitForGone("gallery-player");
  });

  test("E-GU13a: 'Gallery' is a real link from the landing nav", async () => {
    await page.goto(BASE_URL, { waitUntil: "load" });
    await h.waitForText("Supagloo");
    await page.waitForSelector('[data-testid="nav-gallery"]', {
      state: "visible",
      timeout: 20_000,
    });
    await clickTestId("nav-gallery");
    await waitForHydrated(page, "gallery-grid", { timeoutMs: 30_000 });
    expect(await page.evaluate(() => window.location.pathname)).toBe("/gallery");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Signed in, through the shipped `?seed=` seam.
// ─────────────────────────────────────────────────────────────────────────────

describe("upvote and navigate signed in", () => {
  beforeAll(async () => {
    await gotoGallery({ seeded: true });
  }, 120_000);

  test("E-GU10: voting flips the pill and moves the count by exactly 1", async () => {
    await clickTestId("gallery-sort-popular");
    await waitForCardCount(fixtures.pageSize);

    // Pick a card the viewer has NOT already upvoted (the fixture pre-votes one).
    const ids = await cardIds();
    const target = ids.find((id) => {
      const item = fixtures.publicItems.find((i) => i.id === id);
      return item && !item.viewerHasUpvoted;
    });
    expect(target, "every visible card was already upvoted by the viewer").toBeTruthy();
    const item = fixtures.publicItems.find((i) => i.id === target)!;

    expect(await attrOf(`gallery-upvote-${target}`, "aria-pressed")).toBe("false");
    expect(await testidText(`gallery-upvote-count-${target}`)).toBe(
      String(item.upvoteCount),
    );

    await clickTestId(`gallery-upvote-${target}`);
    await pollAttr(`gallery-upvote-${target}`, "aria-pressed", "true");
    expect(await attrOf(`gallery-upvote-${target}`, "data-voted")).toBe("true");
    expect(await testidText(`gallery-upvote-count-${target}`)).toBe(
      String(item.upvoteCount + 1),
    );
    // No sign-in prompt for an authed voter.
    expect(await countTestId("gallery-signin-prompt")).toBe(0);

    await clickTestId(`gallery-upvote-${target}`);
    await pollAttr(`gallery-upvote-${target}`, "aria-pressed", "false");
    expect(await attrOf(`gallery-upvote-${target}`, "data-voted")).toBe("false");
    expect(await testidText(`gallery-upvote-count-${target}`)).toBe(
      String(item.upvoteCount),
    );
  });

  test("E-GU10b: the viewer's PRE-EXISTING vote renders filled on first paint", async () => {
    // Proves the listing reads viewer vote state from the bearer the BFF forwards —
    // not from anything the client remembers.
    await gotoGallery({ seeded: true });
    await clickTestId("gallery-sort-popular");
    await waitForCardCount(fixtures.pageSize);

    const preVoted = fixtures.publicItems.find((i) => i.viewerHasUpvoted);
    expect(preVoted, "the fixture seeded no viewer upvote").toBeTruthy();
    if ((await countTestId(`gallery-upvote-${preVoted!.id}`)) === 0) {
      await clickTestId("gallery-load-more");
      await waitForCardCount(fixtures.publicItems.length);
    }
    expect(await attrOf(`gallery-upvote-${preVoted!.id}`, "data-voted")).toBe("true");
  });

  test("E-GU13b: 'Gallery' is a real link from the workspace nav", async () => {
    await page.goto(`${BASE_URL}/?${SEED_QUERY}`, { waitUntil: "load" });
    await waitForTestId("workspace-home", 30_000);
    await clickTestId("workspace-nav-gallery");
    await waitForHydrated(page, "gallery-grid", { timeoutMs: 30_000 });
    expect(await page.evaluate(() => window.location.pathname)).toBe("/gallery");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// "Your videos".
//
// The fixture RENDERS belong to the eight seeded AUTHORS, not to the browser's
// `?seed=` viewer (who owns votes, not projects). So this block signs in AS an author
// by planting that user's real session token — the helper mints live `Session` rows
// whose raw tokens are usable verbatim as the app's session cookie. Runs LAST because
// it replaces the cookie jar.
// ─────────────────────────────────────────────────────────────────────────────

describe("Your videos", () => {
  let owner: { id: string; sessionToken: string };
  let owned: FixtureItemLike[];

  beforeAll(async () => {
    owner = fixtures.users[0];
    owned = fixtures.items.filter((i) => i.ownerId === owner.id);
    expect(owned.length, "fixture author 0 owns no renders").toBeGreaterThan(0);

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
  }, 60_000);

  test("E-GU12: the nav item routes to /your-videos and lists the owner's renders", async () => {
    await page.goto(`${BASE_URL}/gallery`, { waitUntil: "load" });
    await waitForHydrated(page, "gallery-grid", { timeoutMs: 30_000 });

    // MANDATORY (plan risk table): `nav-your-videos` reads `useSession()`, not
    // `useYVAuth()`. Under a cookie session there is no YouVersion auth at all, so the
    // old gate left this link permanently invisible and unclickable.
    await page.waitForSelector('[data-testid="nav-your-videos"]', {
      state: "visible",
      timeout: 20_000,
    });
    await clickTestId("nav-your-videos");

    await waitForHydrated(page, "your-videos-list", { timeoutMs: 60_000 });
    await waitForYourVideosSettled();
    expect(await page.evaluate(() => window.location.pathname)).toBe("/your-videos");

    const shown = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid^="your-videos-card-"]'),
      ).map((el) => el.getAttribute("data-render-id") ?? ""),
    );
    for (const item of owned) {
      expect(shown, `render ${item.renderJobId} missing from Your videos`).toContain(
        item.renderJobId,
      );
    }
  });

  test("E-GU12b: each card carries a status chip and a real duration badge", async () => {
    const first = owned[0];
    expect(await testidText(`your-videos-chip-${first.renderJobId}`)).toBe("RENDERED");

    // framesTotal / fps === durationSeconds by construction, so the badge here and the
    // gallery card's badge must read identically — one screen must not contradict the
    // other. And it is never "0:00": framesTotal is never 0 (0 means INDETERMINATE).
    const mins = Math.floor(first.durationSeconds / 60);
    const secs = String(first.durationSeconds % 60).padStart(2, "0");
    expect(await testidText(`your-videos-duration-${first.renderJobId}`)).toBe(
      `${mins}:${secs}`,
    );
  });
});

/** Poll one attribute to an expected value (an optimistic flip is 0-16ms; a reconcile
 *  is a round trip). */
async function pollAttr(
  id: string,
  attr: string,
  expected: string,
  timeoutMs = 20_000,
) {
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
