---
name: test-harness
description: How tests run in this repo — none existed; Vitest (unit) + Stagehand/Gloo (E2E) is the plan
metadata:
  type: decision
---

The repo shipped with **no test runner** (only dev/build/start/lint scripts; no vitest/jest/playwright
config, no test files). Plan of record (Turn 7 landing work, see `scratch/turn7-landing-page.md`):

- **Unit → Vitest**, `environment:"node"`, pure logic only (e.g. `lib/initials.ts`). Colocated
  `*.test.ts`. `npm run test`.
- **E2E → Vitest + Stagehand v3 `env:"LOCAL"`** (real local Chromium) for UI verification.
  `npm run test:e2e` → `vitest run --config vitest.e2e.config.ts`. A `globalSetup` boots `next dev` on
  :3000 (reusing an existing server), a `setupFiles` loads `.env.local` into the worker via
  `process.loadEnvFile` so `GLOO_*` is visible. Long timeouts (~120s), `fileParallelism:false`.
- **Stagehand needs a Gloo `llmClient`** (no such module exists yet — must be CREATED at
  `lib/gloo/llm-client.ts` per CLAUDE.md's "LLM Provider: Gloo AI Studio" recipe: OAuth2
  client-credentials → ~1h bearer → `createOpenAI({baseURL:".../ai/v2", apiKey}).chat(id)` wrapped in
  `AISdkClient`). Do NOT use `model:"openai/…"` (Responses API; Gloo ignores structured output there).
- **`@ai-sdk/openai@2.0.112`, `zod@4.4.3`, `ai@5.0.213` are present only as TRANSITIVE deps of
  Stagehand** (hoisted to node_modules root), NOT in `package.json`. Promote `@ai-sdk/openai` + `zod`
  to explicit devDeps before relying on them in the harness.
- `@browserbasehq/stagehand@3.7.0` exports `Stagehand` (`V3` alias), `AISdkClient`, `LLMClient` at the
  package root — CLAUDE.md's recipe imports are valid.
- E2E prereqs: network, a local browser (Stagehand LOCAL downloads its own; else
  `npx playwright install chromium`), and `.env.local` (`GLOO_CLIENT_ID/SECRET/GLOO_STAGEHAND_MODEL`,
  `YV_APP_KEY`). Treat E2E as integration-level, not hermetic.

**Assertion tactic:** exact-copy anchors with glyphs/middots/en-dashes are asserted on **DOM text**,
NOT LLM `extract` output (the LLM normalizes punctuation) — this also keeps exact-anchor checks passing
when Gloo is flaky. Use `observe`/`extract` for semantic/structural checks only. See [[auth-integration]]
for the client/auth seams the tests target.

## Step 7 IMPLEMENTED (2026-07-15) — harness is live, verified RED

Files created: `lib/gloo/llm-client.ts` (verbatim CLAUDE.md recipe), `lib/initials.test.ts`,
`vitest.config.ts`, `vitest.e2e.config.ts`, `tests/e2e/{load-env,global-setup,landing.e2e}.ts`.
package.json scripts: `test`/`test:unit` = `vitest run`, `test:e2e` = `vitest run --config vitest.e2e.config.ts`.
Node 24 here → `process.loadEnvFile` is available; **no `dotenv` needed**.

**Stagehand v3.7.0 real API (verified against installed .d.ts — NOT Playwright):**
- Teardown is **`await stagehand.close()`** (not `done()`).
- `stagehand.context.pages()[0]` is a v3 **understudy `Page`**, which has `goto(url,{waitUntil})`,
  `evaluate(fn)`, `locator(css)`, `waitForSelector`, `waitForLoadState`, `waitForTimeout`, `url()`,
  `title()`. It does **NOT** have `getByText`/`getByTestId`/`innerText`/`locator().waitFor()`.
- `locator(cssSelector)` → understudy Locator with `.count()`, `.textContent()`, `.innerText()`,
  `.first()`, `.nth()`, `.click()` (no `getByText`, no `waitFor`). Selector is CSS, e.g.
  `page.locator('[data-testid="signin-hero"]').count()`.
- `stagehand.observe(instr)` → `Action[]`; `stagehand.extract(instr, zodSchema)` → typed object.
  Both operate on the active page. zod v4 `z.object` works.
- To wait for text / read body text, use `page.evaluate(...)` (see gotcha below); poll with
  `page.waitForTimeout` since there is no `locator.waitFor`.

**GOTCHA 1 — reading page text:** `document.body.textContent` includes Next's inline RSC/flight
`<script>` JSON, which embeds metadata (e.g. the `"Supagloo"` `<title>`) → **false positives** matching
real copy. Fix: in `evaluate`, clone `<body>`, remove `script,style,noscript,template`, then read
`textContent`. Use **`textContent` (not `innerText`)** so `text-transform:uppercase` copy (e.g. the
"▶ Start from this demo" button, uppercased only in CSS) matches its SOURCE case. Anchor strings must be
byte-for-byte from `scratch/design/fig7a.raw.html` (em dash U+2014, en dash U+2013 in "1:1–4", middot
U+00B7); `&amp;` renders to `&`.

**GOTCHA 2 — `global-setup.ts` must load `.env.local` before spawning `next dev`.** globalSetup runs in
Vitest's MAIN process, which does NOT execute the worker `setupFiles` (`load-env.ts`), and the spawned
server did not otherwise get `YV_APP_KEY` → `app/layout.tsx`'s module-scope `if(!appKey) throw` fired →
`/` served a 500 `/_error` overlay. That error page **churns under Next dev HMR and drops the CDP
session → `StagehandNotInitializedError`** on later `extract` calls (looks like a broken harness but
is a symptom of the crashing page). Fix: `global-setup` calls `process.loadEnvFile(".env.local")` before
`spawn`. This matters for Step 9 too (layout keeps the guard).

**Browser for `env:"LOCAL"`:** Stagehand uses **`chrome-launcher`** → it drives the **system Google
Chrome** (`/Applications/Google Chrome.app` on this Mac), NOT Playwright's chromium. `npx playwright
install chromium` would **not** help; if Chrome is missing, install Chrome. It uses a fresh temp profile
(won't attach to your running Chrome).

**Confirmed RED (2026-07-15):** unit `lib/initials.test.ts` → `Cannot find module './initials'` (missing
symbol). E2E all 6 tests RED against the JHN 3:16 verse page (visible body text seen:
`"Sign in with YouVersion...JHN 3:16 (BSB)Public Domain"`), no infra errors, no straggler dev server.
Harness proven: dev server booted w/ env, Gloo OAuth token + inference round-trip worked (extract
returned real verse-page data), Chromium launched, page loaded. E2E run ~110s; one `extract` spiked to
50s (Gloo latency, under the 120s timeout).

## Step 9 IMPLEMENTED (2026-07-15) — all GREEN (unit 5/5, e2e 6/6, lint clean, build ok)

Figure 7a landing page shipped (see `app/_components/landing/*` + atoms/client leaves in
`app/_components/`; `app/page.tsx` is now a static RSC — build shows `/` as `○ (Static)`). Full run
~50s; each `extract`/`observe` 10–17s.

**Harness hardening done:** `global-setup.ts` `serverIsUp()` now requires `response.ok` (HTTP 200), not
just *any* response — a keyless/crashing 500 `/_error` overlay must NOT be reused (would cause
wrong-reason Reds). Cold-boot path re-verified: global-setup spawns `next dev`, polls to 200, tears down
(no straggler).

**BIG LESSON — steering semantic `extract`/`observe` without weakening tests.** Stagehand v3 `extract`
runs off a **CDP accessibility snapshot** (`extractHandler` → `captureHybridSnapshot(page,{...})` →
`combinedTree`, the `domElements` handed to the LLM), NOT raw DOM. It does NOT filter AX `ignored`
explicitly, BUT an `aria-hidden` element's StaticText loses its accessible *name*, so
`buildHierarchicalTree`'s `keep` filter (needs name OR children OR non-structural role) drops it. Net:
**`aria-hidden` reliably removes a node from what `extract`/`observe` see, while `textContent` (the
exact-anchor `.includes` checks) still includes it.** So decorative/competing copy can stay a byte-exact
anchor yet vanish from the LLM's view.
- Concrete: the semantic test `extract("the small label above the demo card, and the demo's title")`
  deterministically returned the *competing* labels ("DEMO" poster chip, then "FEATURED STARTER SCRIPT"
  overline) instead of the intended section eyebrow "⚡ START IN ONE CLICK — NO BLANK PAGE". Fix that
  kept the spec intact: `aria-hidden` the decorative poster (pure gradient thumbnail → removes DEMO +
  caption from a11y) and `aria-hidden` the redundant "FEATURED STARTER SCRIPT" overline (folded into the
  `<h2>`); both stay visible + in DOM text so their exact anchors still pass. 3/3 stable afterward.
- **Debug tactic (fast, cheap):** deep-import the snapshot builder and print the exact tree the LLM
  sees, and run just the one failing `extract` in a loop (don't iterate the whole 6-test suite ~50s):
  `import { captureHybridSnapshot } from "<abs path>/node_modules/@browserbasehq/stagehand/dist/esm/lib/v3/understudy/a11y/snapshot/index.js"`
  then `(await captureHybridSnapshot(page,{})).combinedTree`. Node 24 runs a `.mts` with type-stripping
  (`node scratch/x.mts`); the package export map rewrites subpath imports, so use the absolute node_modules
  path. Reuse a manually-spawned `next dev` (HMR picks up edits between extracts).

## Step 15 (2026-07-15) — Stagehand viewport + the featured-demo extract is inherently flaky

- **Stagehand `env:"LOCAL"` default viewport = 1288×711** (E2E sets no `viewport`, so `launchLocalChrome`
  adds no `--window-size` and chrome-launcher's default window applies). This matters for responsive work:
  the E2E renders the landing at **1288px**, i.e. BELOW the 1320px fixed-design width. So any
  `min-[1320px]:` breakpoint is INACTIVE during the E2E. (Verified by `page.evaluate(()=>innerWidth)`.)
- **The `featured-demo band is present (semantic extract)` test (landing.e2e.ts:191-200) is inherently
  ~50% flaky** and always was — the memory's earlier "3/3 stable" was a lucky streak. The `extract(
  "the small label above the demo card, and the demo's title")` nondeterministically splits the `<h2>`
  "GENESIS · LET THERE BE LIGHT" into demoLabel="GENESIS ·" / demoTitle="LET THERE BE LIGHT" (the middot
  reads as a label separator, and the gold `<span>` exposes TWO StaticText nodes under the heading). Measured
  2/4 then, after fixing, 6/6.
- **Deterministic fix (production a11y steer, no test change, no visible-text change):** collapse the title
  to ONE atomic heading node so it can't be split — `aria-hidden` the visible title `<span>` (removes both
  StaticTexts from the a11y tree per the Step-9 lesson) and put `aria-label="GENESIS · LET THERE BE LIGHT"`
  on the `<h2>` so the heading keeps that single name. Tree goes from `heading > StaticText "GENESIS ·" +
  StaticText "LET THERE BE LIGHT"` to a leaf `heading: GENESIS · LET THERE BE LIGHT`. `textContent` is
  untouched → all 32 exact-copy anchors still pass. After this the eyebrow "⚡ START IN ONE CLICK…" (the
  `group`'s `aria-labelledby` name) is the ONLY "label above the card" candidate → 6/6 stable.
- **Fast flakiness/tree debugging (Gloo-free for the tree):** `new Stagehand({env:"LOCAL",verbose:0})`
  WITHOUT an `llmClient` still does `init`/`goto`/`evaluate`/`captureHybridSnapshot`. Deep-import the
  snapshot builder via a **direct file path** (NOT the package specifier — the export map double-prefixes
  `dist/esm`): `import { captureHybridSnapshot } from "../node_modules/@browserbasehq/stagehand/dist/esm/lib/v3/understudy/a11y/snapshot/index.js"`;
  `(await captureHybridSnapshot(page,{})).combinedTree` is a printable STRING. To measure extract stability,
  build Stagehand WITH `glooLlmClient()` and loop the single `extract` N× in one session (one Chrome boot).
  Put throwaway `.mjs/.mts` in `scratch/` (gitignored) so node resolves `node_modules`; **delete them after**
  — eslint lints `scratch/` and `tsc` type-checks it, so leftover scripts break `npm run lint`/`tsc --noEmit`.

## Step 6 plan (2026-07-16) — Turn 8/9 auth+viewport E2E seams (verified API facts)

- **Mobile-viewport E2E without a second browser boot:** the v3 understudy `Page` exposes
  **`page.setViewportSize(width, height, { deviceScaleFactor? })`** (verified `page.d.ts:303`; CDP
  `Emulation.setDeviceMetricsOverride` under the hood → media queries re-evaluate on resize). So one
  Stagehand session can assert desktop (8a @ the default 1288×711) then `setViewportSize(390,844)` and
  assert mobile (9b). Discipline: put the mobile `describe` LAST and restore `setViewportSize(1288,711)`
  in its `afterAll`; add a small `waitForTimeout` after resize for reflow. Also verified:
  `waitForSelector(sel, { state: "visible"|"hidden"|"attached"|"detached", timeout, pierceShadow })`.
- **D2 dual-copy caveat:** when mobile-short copy is rendered alongside desktop copy via `hidden md:block`
  ⁄ `md:hidden`, BOTH strings stay in `textContent` (hidden one is `display:none`). Exact-anchor
  `.includes()` tolerates it, but proving a mobile SWAP (short shown / long hidden) needs
  `evaluate(getComputedStyle)` or bounding-rects, NOT `textContent`. (`extract` respects `display:none`
  via the a11y snapshot but is flaky — prefer deterministic computed-style checks for the swaps.)
- **Favicon (7b) is Next 16 file-convention, no layout edit:** `app/icon.svg` (static) → auto
  `<link rel="icon" type="image/svg+xml" sizes="any">`; `app/apple-icon.tsx` (`next/og` `ImageResponse`,
  export `size`+`contentType`) → `<link rel="apple-touch-icon">`; `app/favicon.ico` stays legacy;
  DELETE `app/icon.jpg` (the clipped photo = the Safari bug). E2E guards it by `page.evaluate`-scanning
  the `<head>` icon links (present in SSR HTML). Full plan: `scratch/turn8-9-landing.md`.

**E2E is fully blocked when Gloo OAuth is degraded (seen 2026-07-16).** `beforeAll` builds
`glooLlmClient()` (fetches the OAuth token) BEFORE `stagehand.init()`, and Stagehand requires the
`llmClient` at construction — so if the token fetch fails, **every** E2E test skips, including the
deterministic Gloo-free ones (testid/computed-style checks). Symptom: `getGlooAccessToken` throws
`400 … PreTokenGenerationV3_0 failed … Organization lookup failed for client <id> … Read timed out
(read timeout=2.0)`. That 400 is a **Gloo-side outage** (its Cognito pre-token Lambda can't reach its
own backend), NOT bad creds (the client id resolves) and NOT an env problem — retries don't help; wait
it out. If we ever want the deterministic tests to survive a Gloo outage, split them into a suite that
builds Stagehand WITHOUT an `llmClient` (init/goto/evaluate/locator all work Gloo-free; only
`extract`/`observe` need it).

**Non-Gloo rendering verification (used when Gloo OAuth was down, 2026-07-16):** the app itself
needs no Gloo (only Stagehand's LLM token does), so verify real DOM with the `webapp-testing` skill
(native **Python Playwright**, NOT the repo's Stagehand): `npm run build` then serve via
`with_server.py --server "npm run start" --port 3000 -- <venv>/python verify.py`. Playwright isn't
installed by default — make a venv, `pip install playwright`, `python -m playwright install chromium`.
Drive TWO `browser.new_context(viewport=...)` (1288×711 desktop, 390×844 mobile), `goto(...,
wait_until="networkidle")` (use `next start`, NOT `next dev` — HMR websocket defeats networkidle),
`wait_for_selector('[data-testid="signin-nav"]')` to pass the mount-gate, then assert via the testid
seams + `getComputedStyle`/`bounding_box`. Gotcha: a control that exists in both a `hidden md:*` and a
`md:hidden` copy → `get_by_text(...).first` may pick the HIDDEN one; assert "any instance visible".
This gave 22/22 DOM checks + screenshots with Gloo down — the full compile-safety net is unit +
`tsc --noEmit` + `eslint` + `build` + this Playwright pass.

## E2E robustness fixes (2026-07-16, Turn 8/9 landing, code-review round 2)

Three real-Gloo E2E flakes, all **test** issues (product verified 31/31 via Playwright), not regressions:
- **Mount-gate race:** `beforeAll`'s `waitForText("Supagloo")` returns on the SERVER-rendered wordmark,
  BEFORE hydration — so any assertion on a **mount-gated** client leaf (`NavAuth`→`signin-nav`, hero
  swaps, etc.) can find 0. Fix: also `await page.waitForSelector('[data-testid="signin-nav"]',
  {state:"visible"})` in `beforeAll`. Rule: when a test targets a mount-gated seam, wait for that seam,
  not just server-rendered text.
- **Understudy `waitForSelector(state:"hidden")` never resolves for a DETACHED node.** Conditionally
  rendered UI (`{open && …}`, e.g. the mobile sheet) UNMOUNTS on close, so "hidden" (which waits for an
  attached-but-hidden element) hangs → timeout. Playwright's own `state:"hidden"` treats detached as
  hidden, but the Stagehand v3 understudy does NOT. Fix: poll `page.locator(sel).count() === 0`
  (helper `waitForGone`) — the equivalent "closed" guarantee. (Or `state:"detached"`.)
- **Multi-field Stagehand `extract` intermittently returns an EMPTY field** (saw `eyebrow:""` in a
  4-field hero extract). Keep semantic extracts to the ONE field that genuinely needs the LLM; cover
  everything else with deterministic `textContent` anchors / testid+computed-style. The 8a hero test
  now extracts only `primaryCta` ("Watch the Genesis demo", not sign-in); eyebrow/headline/sub-copy are
  anchor-covered. Landing E2E 13/13 stable (ran twice).

**Cross-workstream `tsc --noEmit` is RED from OTHER suites** (`lib/studio/*` missing modules + a
`.next/types` ref to `app/spike/page`) — those are separate in-flight TDD workstreams, NOT the landing.
Scope type-checks to your files (grep the error paths); landing (`app/_components/landing/*`,
`lib/landing/*`, `tests/e2e/landing.e2e.ts`) stays type-clean + eslint-clean.

**Lint gotcha (eslint flat config = core-web-vitals + ts):** the mount-gate `useEffect(()=>setMounted(true),[])`
now trips `react-hooks/set-state-in-effect` (an ERROR). It's the intended post-hydration one-shot gate —
disable that one line with a rationale comment (`// eslint-disable-next-line react-hooks/set-state-in-effect`).
Also: render exact-copy strings via JS expressions `{"…"}` (not JSX text) to dodge
`react/no-unescaped-entities` on apostrophes AND to avoid JSX whitespace-collapsing — guarantees
byte-exact anchors. `<img>` for a runtime avatar URL trips `@next/next/no-img-element` (a warning, but
disable-line it to keep output clean rather than add next/image remotePatterns for one dynamic src).
