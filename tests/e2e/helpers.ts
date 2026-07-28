import type { Stagehand } from "@browserbasehq/stagehand";

/**
 * Shared Stagehand v3 E2E helpers.
 *
 * These are the reusable `evaluate`-based helpers that were inlined in
 * `landing.e2e.ts`, lifted here VERBATIM (same bodies, now closing over the
 * `page` passed to `makeHelpers`) so the landing suite and the Turn 10/11
 * workspace/onboarding suites share one implementation. The landing suite is the
 * regression control: extracting these must not change its behavior.
 *
 * The Stagehand v3 understudy `Page` has no Playwright-style
 * `getByText`/`innerText`/`locator().waitFor()`; it exposes `evaluate`,
 * `locator`, `goto`, `waitForSelector`, `waitForTimeout`. Everything below is
 * built on `evaluate` + polling.
 */

export type StagehandPage = ReturnType<Stagehand["context"]["pages"]>[number];

// ── the hydration gate (plan row 68) ─────────────────────────────────────────

/**
 * THE RULE, and it is the whole of plan row 68:
 *
 *   **Wait on a mount-gated testid, or on an explicit hydration predicate —
 *   never on an SSR'd one.**
 *
 * A `data-testid` that a Server Component emits is in the FIRST HTML BYTE. Its
 * presence proves the HTML arrived; it proves nothing about React having
 * hydrated, and `page.goto(..., { waitUntil: "load" })` adds no protection —
 * `document.readyState` reaches `"complete"` while the island is still cold.
 * Everything that needs a live React tree — a click that must run an `onClick`,
 * a synthetic `input` event that must reach an `onChange`, any measurement of a
 * box — is a silent no-op in that window.
 *
 * The two sides of the rule, both live in this repo:
 *
 *   - `studio-frame` is **SSR'd** (`app/studio/[id]/page.tsx` resolves the demo
 *     catalog synchronously and renders `<StudioApp>`; the div is in
 *     `app/studio/_components/studio-app.tsx`). Polling for it returns
 *     immediately, before hydration. That is the single root cause behind BOTH
 *     of row 68's reported mock-lane failures — the lost `input` event that
 *     leaves `data-dirty="false"`, and Stagehand's `-32000 Node does not have a
 *     layout object` when it clicks a node with no layout box. They are one bug,
 *     not two, and raising the assertion's timeout fixes neither: the event is
 *     LOST, not slow (the mock commit path is 320 ms and the observed flip
 *     latency is 0-16 ms).
 *   - `workspace-home` is **mount-gated** (`app/_components/home-switch.tsx`
 *     renders the public landing until `mounted && session.isAuthed`), so its
 *     presence genuinely IS a post-hydration signal. `project-wizards.e2e.ts`'s
 *     `gotoWorkspace` looks identical to the broken `gotoStudio` and is immune
 *     purely by that accident — do not read it as a pattern to copy.
 *
 * Measured over 16 navigations against a warm `next dev`: 2 returned with the
 * frame present, `readyState === "complete"`, `getBoundingClientRect() === 0x0`,
 * no `__reactProps$` key and `document.styleSheets.length === 4` instead of 5 —
 * and in exactly those 2, the E-SP2 script edit never dirtied the chip.
 * `waitForSelector({ state: "visible" })` alone is NECESSARY BUT NOT SUFFICIENT
 * (1/16 satisfied it while unhydrated). A non-zero box AND a `__reactProps$` key
 * is 0/16, and costs 0-70 ms.
 *
 * The gate is deliberately split in three so it can carry a unit test at all:
 * `vitest.config.ts` is `environment: "node"` with no jsdom, so `pollUntil` and
 * `isHydratedSnapshot` are PURE (injected `read`/`sleep`/`now`, plain snapshot
 * objects — the same shape as `lib/project-wizard/provision-effects.ts`'s
 * `pollJobUntilTerminal`), and only `waitForHydrated` touches a browser. Its
 * unit suite is `tests/unit/hydration-gate.test.ts`.
 *
 * FOLLOW-UP, deliberately out of scope for row 68: there are ~17 hand-rolled
 * poll loops across 14 e2e files that should collapse into `pollUntil`.
 */

/** One element's hydration evidence, measured in-page. */
export interface HydrationSnapshot {
  width: number;
  height: number;
  /** Does the node carry a React fiber-props key (`__reactProps$…`)? */
  hasReactProps: boolean;
}

/**
 * Is this node both laid out and wired to React? Both halves are load-bearing:
 * a zero box means Blink has no layout object (Stagehand's
 * `DOM.scrollIntoViewIfNeeded` / `DOM.getBoxModel` throw `-32000` on it), and a
 * missing fiber-props key means React's delegated root listener will find no
 * props for a dispatched event, so `onChange`/`onClick` never run.
 */
export function isHydratedSnapshot(s: HydrationSnapshot): boolean {
  return s.width > 0 && s.height > 0 && s.hasReactProps;
}

export interface PollUntilOptions {
  /** What we are waiting for, named in the timeout message. */
  label: string;
  /** One observation. Resolve true to stop. */
  read: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  timeoutMs: number;
  intervalMs: number;
  /** Last observed state, rendered into the timeout message. */
  describe: () => Promise<string> | string;
}

/**
 * The generic condition wait this repo has never had: poll `read` every
 * `intervalMs` until it goes true, or throw a message naming the target AND the
 * last observed state. Pure — every clock and every I/O is injected, so the
 * timing contract is unit-testable with no browser and no jsdom.
 *
 * Reads are bounded by the deadline as well as sleeps: a predicate is never
 * evaluated once `now()` has passed the deadline.
 */
export async function pollUntil(opts: PollUntilOptions): Promise<void> {
  const deadline = opts.now() + opts.timeoutMs;
  for (;;) {
    if (await opts.read()) return;
    if (opts.now() >= deadline) break;
    await opts.sleep(opts.intervalMs);
  }
  throw new Error(
    `Timed out after ${opts.timeoutMs}ms waiting for ${opts.label}. ` +
      `Last observed: ${await opts.describe()}`,
  );
}

const DEFAULT_HYDRATION_TIMEOUT_MS = 8000;
const DEFAULT_HYDRATION_INTERVAL_MS = 100;

/**
 * Wait until at least one element carrying `testid` is BOTH laid out and
 * hydrated. This is the "explicit hydration predicate" half of the rule above,
 * and it is what makes waiting on an SSR'd testid safe.
 *
 * ANY matching element counts (not just the first): under this repo's dual-copy
 * convention a testid can appear in both a hidden desktop copy and a visible
 * mobile one, exactly as `isVisibleByTestId` already handles.
 *
 * Returns true when the gate passes. Throws on timeout — the race must be LOUD;
 * silently returning is what let row 68's defect survive a whole task. Pass
 * `{ optional: true }` to get `false` instead, which is the documented opt-out
 * for a Step-7 RED phase where the route legitimately 404s and the per-test
 * presence guard is the assertion that should report it.
 */
export async function waitForHydrated(
  page: StagehandPage,
  testid: string,
  opts: { timeoutMs?: number; intervalMs?: number; optional?: boolean } = {},
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HYDRATION_TIMEOUT_MS;
  const intervalMs = opts.intervalMs ?? DEFAULT_HYDRATION_INTERVAL_MS;

  const readSnapshots = (): Promise<HydrationSnapshot[]> =>
    page.evaluate(
      (id) =>
        Array.from(
          document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
        ).map((el) => {
          const r = el.getBoundingClientRect();
          return {
            width: r.width,
            height: r.height,
            // React 18+ attaches fiber props under a `__reactProps$<hash>` key.
            // Its ABSENCE is the precise, observable statement of "this node is
            // in the DOM but React has not adopted it yet".
            hasReactProps: Object.keys(el).some((k) =>
              k.startsWith("__reactProps$"),
            ),
          };
        }),
      testid,
    );

  try {
    await pollUntil({
      label: `[data-testid="${testid}"] to be laid out and hydrated`,
      read: async () => (await readSnapshots()).some(isHydratedSnapshot),
      sleep: (ms) => page.waitForTimeout(ms),
      now: Date.now,
      timeoutMs,
      intervalMs,
      describe: async () => JSON.stringify(await readSnapshots()),
    });
    return true;
  } catch (err) {
    if (opts.optional) return false;
    throw err;
  }
}

export interface E2EHelpers {
  bodyText(): Promise<string>;
  waitForText(needle: string, timeoutMs?: number): Promise<void>;
  isVisibleByTestId(testid: string): Promise<boolean>;
  widthByTestId(testid: string): Promise<number>;
  textIsVisible(label: string): Promise<boolean>;
  waitForGone(testid: string, timeoutMs?: number): Promise<void>;
}

export function makeHelpers(page: StagehandPage): E2EHelpers {
  /**
   * Read the page's visible text. The Stagehand v3 understudy `Page` has no
   * Playwright-style `getByText`/`innerText`; it exposes `evaluate`, `locator`,
   * `goto`, `waitForSelector`. We read via `evaluate`.
   *
   * We clone `<body>`, strip `<script>/<style>/<noscript>/<template>`, then read
   * `textContent`:
   *  - Stripping scripts excludes Next.js's inline RSC/flight JSON, which embeds
   *    metadata (e.g. the "Supagloo" title) that would otherwise cause false
   *    positives against real page copy.
   *  - `textContent` (vs `innerText`) returns SOURCE text, so exact-copy anchors —
   *    middots `·`, en/em dashes, and buttons whose CSS `text-transform:uppercase`
   *    would alter `innerText` — match verbatim.
   *
   * NOTE: `textContent` includes `display:none` nodes, so under dual-copy BOTH
   * the desktop and mobile-short strings are present at every viewport. Use
   * `bodyText()` for exact-copy PRESENCE anchors only; prove a SWAP (shown /
   * hidden) with `isVisibleByTestId` / `textIsVisible` below.
   */
  async function bodyText(): Promise<string> {
    return page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll("script, style, noscript, template")
        .forEach((el) => el.remove());
      return clone.textContent ?? "";
    });
  }

  /**
   * Poll until the rendered text contains `needle`, else throw. Replaces the
   * plan's `getByText(...).waitFor()`, which the v3 understudy page does not
   * expose. Used to wait past the client mount-gate (the server-rendered
   * wordmark appears as soon as the correct page renders).
   */
  async function waitForText(needle: string, timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let seen = "";
    while (Date.now() < deadline) {
      seen = await bodyText();
      if (seen.includes(needle)) return;
      await page.waitForTimeout(500);
    }
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for page text to include ` +
        `${JSON.stringify(needle)}. First 300 chars seen: ` +
        `${JSON.stringify(seen.slice(0, 300))}`,
    );
  }

  /**
   * Is the element carrying `data-testid={testid}` actually rendered on screen?
   * Deterministic (no LLM): fails for a missing element, a `display:none` /
   * `visibility:hidden` element, or one collapsed to a zero box (e.g. an ancestor
   * hidden by a `md:hidden` / `hidden md:*` responsive class). This is how we
   * assert the auth/viewport SWAPS, since `textContent` can't tell shown from
   * hidden under dual-copy.
   */
  async function isVisibleByTestId(testid: string): Promise<boolean> {
    return page.evaluate((id) => {
      const vis = (el: HTMLElement) => {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      // ANY matching element visible — with dual-copy there can be >1 element per
      // testid; a first-match-only check could report the hidden desktop/mobile
      // copy and miss the visible one (the F1 fix).
      return Array.from(
        document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
      ).some(vis);
    }, testid);
  }

  /**
   * Bounding-rect width of the first VISIBLE element carrying `testid` (falls
   * back to the first match, else 0). Prefers the visible copy under dual-copy.
   */
  async function widthByTestId(testid: string): Promise<number> {
    return page.evaluate((id) => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
      );
      const visible = els.find((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const el = visible ?? els[0];
      return el ? el.getBoundingClientRect().width : 0;
    }, testid);
  }

  /**
   * Is there a VISIBLE element whose trimmed textContent exactly equals `label`?
   * Lets us probe visibility without a testid. Iterates ALL matches and returns
   * true iff any is visible — a control can exist in both a hidden desktop copy
   * and a visible mobile copy under dual-copy (the F1 fix).
   */
  async function textIsVisible(label: string): Promise<boolean> {
    return page.evaluate((needle) => {
      const vis = (el: HTMLElement) => {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      return Array.from(
        document.querySelectorAll<HTMLElement>("button, a, span, div"),
      ).some((e) => (e.textContent ?? "").trim() === needle && vis(e));
    }, label);
  }

  /**
   * Poll until no element carries `testid`, else throw. Conditionally rendered
   * UI (`{open && …}`, e.g. the mobile sheet / the wizard overlay / a modal on
   * close) DETACHES rather than going `display:none`; the understudy's
   * `waitForSelector(state:"hidden")` waits for an attached-but-hidden node and
   * never resolves for a removed one. Asserting the node is GONE is the
   * equivalent "closed" guarantee.
   */
  async function waitForGone(testid: string, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await page.locator(`[data-testid="${testid}"]`).count()) === 0)
        return;
      await page.waitForTimeout(100);
    }
    throw new Error(
      `[data-testid="${testid}"] still present after ${timeoutMs}ms (expected gone)`,
    );
  }

  return {
    bodyText,
    waitForText,
    isVisibleByTestId,
    widthByTestId,
    textIsVisible,
    waitForGone,
  };
}

// ── real-lane seeding: one real commit, through the app's own BFF ────────────

/**
 * Put ONE real commit on `branch` of the project with slug `slug`, through the app's own
 * BFF routes with the browser's real session cookie — read the committed manifest, swap
 * in one scene, POST it to `/api/projects/:id/commit`, then poll the ProjectJob to a
 * terminal status.
 *
 * This is seeding through the real system, not a stub: the same api, the same DBOS
 * git-ops worker and the same github.com the UI would drive. It exists because a
 * freshly-scaffolded manifest has `scenes: []` — so the studio renders `<StudioEmpty />`
 * and offers no `script-input` to dirty (the same gap `studio-hydration.e2e.ts` documents
 * as its own skip reason), AND the working branch is cut AT `pr.mergeSha` (dbos
 * `de745d2`), so it is ZERO commits ahead of main and a publish 422s with
 * "No commits between main and v0.0.1".
 *
 * ONE copy, shared by `studio-publish-real.e2e.ts` and `studio-render-real.e2e.ts`.
 * It lived in the publish spec first; the render spec needed a byte-identical body, and a
 * second copy of seeding logic is how the two drift.
 *
 * Callers must `page.reload()` afterwards if they intend to read anything derived from
 * `GET /versions` (the Publish gate): the loaded page's `state.versions` predates this
 * commit and would still report "nothing to publish".
 *
 * `helpers.ts` is imported by MOCK-lane specs too. This is a plain exported async
 * function with no import-time side effects and no network of its own, so adding it here
 * changes nothing about that lane.
 */
export async function commitOneSceneViaBff(
  page: StagehandPage,
  slug: string,
  branch: string,
): Promise<void> {
  const outcome = await page.evaluate(
    async ({ slug: wantedSlug, ref }) => {
      // The studio holds a SLUG; every API path takes the cuid. `GET /api/projects` is
      // the only slug→id index the API exposes — the same hop `studio-data.ts` makes.
      const listRes = await fetch("/api/projects", { cache: "no-store" });
      if (!listRes.ok) return { ok: false, why: `projects ${listRes.status}` };
      const { projects } = (await listRes.json()) as {
        projects: Array<{ id: string; slug: string }>;
      };
      const id = projects.find((p) => p.slug === wantedSlug)?.id;
      if (!id) return { ok: false, why: `no project with slug ${wantedSlug}` };

      const manifestRes = await fetch(
        `/api/projects/${id}/manifest?ref=${encodeURIComponent(ref)}`,
        { cache: "no-store" },
      );
      if (!manifestRes.ok) return { ok: false, why: `manifest ${manifestRes.status}` };
      const { manifest } = (await manifestRes.json()) as { manifest: Record<string, unknown> };

      const scenes = [
        {
          id: "s1",
          name: "seeded scene",
          scriptText: "In the beginning God created the heavens and the earth.",
          reference: "Genesis 1:1",
          translation: "ASV",
          visualPrompt: "a dark formless deep at the first light",
          durationSeconds: 5,
          captions: true,
        },
      ];

      const commitRes = await fetch(`/api/projects/${id}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          manifest: { ...manifest, scenes },
          message: "Seed one scene so there is something to publish",
        }),
      });
      if (!commitRes.ok) {
        return { ok: false, why: `commit ${commitRes.status} ${await commitRes.text()}` };
      }
      const { jobId } = (await commitRes.json()) as { jobId: string };

      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        const jobRes = await fetch(`/api/projects/${id}/jobs/${jobId}`, {
          cache: "no-store",
        });
        if (jobRes.ok) {
          const { job } = (await jobRes.json()) as {
            job: { status: string; error: string | null };
          };
          if (job.status === "succeeded") return { ok: true, why: "" };
          if (job.status === "failed" || job.status === "canceled") {
            return { ok: false, why: `job ${job.status}: ${job.error ?? ""}` };
          }
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      return { ok: false, why: "commit job never reached a terminal status" };
    },
    { slug, ref: branch },
  );

  if (!outcome.ok) throw new Error(`seed commit failed: ${outcome.why}`);
}
