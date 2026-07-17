---
name: turn13-14-studio-publish-wizard
description: Turn 14 plan — studio Publish wizard (14a) + version dropdown (14b) + render overlay (14c); the two-step publish bump + warm-skin decisions and the exact model/testid contracts. Plus §7 scope amendment — 13b left-panel scene-tree + inspector simplification.
metadata:
  type: decision
---

Step 6 TDD plan for Turn 14 (the three overlays hanging off the already-built 13b studio top bar):
`scratch/turn13-14-studio-publish-wizard.md`. Frontend-only, mocked. Builds on
[[turn12-13-project-wizards]] (which shipped `/studio/[id]`, the warm shell, the 13b top bar, and the
reducer's dirty/commit/publish machinery).

Two load-bearing judgment calls (flagged for the Step-8 checkpoint):
- **D-PUBLISH-SEMANTICS — publish is a TWO-STEP version bump.** Publishing from `vX` tags
  `publishedVersion=nextVersion(vX)` onto main AND cuts a fresh working branch
  `postPublishBranch=nextVersion(nextVersion(vX))` (v0.0.1 → live v0.0.2 → working v0.0.3). This is what
  makes 14b's dropdown coherent (else v0.0.2 would render as BOTH the working row and the LIVE-ON-MAIN
  row). **Rewrites already-green `U-R16` (reducer) + `E-SP3` (studio-project.e2e).** New helpers in
  `lib/studio/project.ts`: `prevVersion`, `publishedVersion`, `postPublishBranch`. `PUBLISH_DONE` also
  records `lastPublishedVersion`.
- **D-SKIN — build 14a/14b/14c WARM + studio-scoped** (`app/studio/_components/*`), mirroring the LOGIC
  of `app/_components/project-wizard/*` primitives but re-skinning views amber to match the studio.
  Pure logic reused from `lib/` verbatim; views NOT imported. Cheaper rejected alt: reuse neutral
  `--sg-*` primitives for 14a only.

New pure models (unit-tested): `lib/studio/version-history.ts`, `lib/studio/render-model.ts`,
`lib/studio/publish-review.ts`; extend `lib/project-wizard/provisioning-log.ts` (`publishLogRows`) and
`lib/studio/reducer.ts` (publishFlow/publishLog/lastPublishedVersion/versionMenuOpen/render + actions).
New warm views: `studio-log.tsx`, `publish-wizard.tsx`, `version-menu.tsx`, `render-overlay.tsx`.
Rewire only: `top-bar.tsx` (publish-button → openPublish; chip ▾ → version-menu-trigger),
`studio-context.tsx`, `studio-app.tsx`.

Resolved ambiguities: (a) 14c triggers ONLY from 14a step-3 "Render & share ▸"; top-bar
render-share/ship-menu untouched. (b) 14b rows/restore/Compare INERT. (c) 14c dismiss only via its two
footer buttons (Run-in-background hides + keeps rendering; Cancel clears). (d) diff tones = code(.tsx
green)/data(.json gold). (f) 13b left panel + scene-inspector — **OUT OF SCOPE was OVERRIDDEN by the user
2026-07-17; now planned in §7** (see below). Derive-from-real-model:
frame total = `totalFrames`=900 (NOT the wireframe's 840), dims via `aspectDimensions`, caption from the
selected scene, version numbers from reducer state.

E2E (Gloo-free Stagehand, no llmClient, deterministic testids): NEW `tests/e2e/studio-publish.e2e.ts`
(E-PUB1-4, E-VER1-3, E-RND1-4); MIGRATE `studio-project.e2e.ts` E-SP3. Full testid contract is in §4.3
of the plan.

## Step 7 DONE (2026-07-17) — tests written + verified RED; regression controls GREEN

Files CREATED (unit, colocated): `lib/studio/{version-history,render-model,publish-review}.test.ts`.
MODIFIED unit: `lib/project-wizard/provisioning-log.test.ts` (+U-PL9 publishLogRows), `lib/studio/
project.test.ts` (+U-SP7 prevVersion / +U-SP8 publishedVersion / +U-SP9 postPublishBranch),
`lib/studio/reducer.test.ts` (REWROTE U-R16 → two-step bump; ADDED U-R17..U-R20). CREATED E2E:
`tests/e2e/studio-publish.e2e.ts` (full testid header block). MODIFIED E2E: `tests/e2e/
studio-project.e2e.ts` (E-SP3 repurposed → "Publish OPENS the wizard, no direct bump"; deleted the two
now-unused local `waitForTestidText*` helpers to keep it lint-clean).

- **Unit RED (right reason):** 3 new files fail `Cannot find module` (`./version-history`,
  `./render-model`, `./publish-review`); U-PL9 → `publishLogRows is not a function` (missing EXPORT, not
  missing module — Vite yields `undefined` for a missing named export from an existing module, so the
  other 8 provisioning-log tests stay GREEN); U-SP7/8/9 → `prevVersion/publishedVersion/postPublishBranch
  is not a function` (missing exports; other 6 project tests GREEN); U-R16..U-R20 → new StudioState
  fields/actions read `undefined` (esbuild strips types so the file still RUNS; U-R1..U-R15 GREEN). Net:
  6 suites red, 125 other unit tests GREEN.
- **E2E RED (right reason, Gloo-free, ran locally):** `studio-publish` 11/11 fail — mostly `publish-wizard
  never appeared within 8000ms` (overlay absent + publish-button still direct-bumps), E-VER1 `expected 0
  to be greater than 0` on `version-menu-trigger` (chip ▾ still an inert glyph), E-VER3
  `StagehandElementNotFoundError: version-menu-trigger`. `studio-project` E-SP3 fails `publish-wizard
  never appeared` (migration); **E-SP1/E-SP2/E-SP4 stay GREEN** (13b regression control). Dev server
  booted, Chrome launched, evaluate/locator connected — no harness errors. Run ~66s.
- **Scope confirmed:** production UNCHANGED — `top-bar.tsx`, `studio-context.tsx`, `studio-app.tsx`,
  `reducer.ts`, `project.ts`, `provisioning-log.ts`; the 3 new lib modules are ABSENT (RED-via-missing-
  module, this repo's convention). Nothing new under `app/studio/_components/`. Test-only diff.

The contracts Step 9 (Green) must match are LOCKED by these tests — see the plan §4.1/§4.2/§4.3 and the
E2E header block in `studio-publish.e2e.ts`. Key derived values the tests pin: render frame total = 900
(NOT 840); `renderSpecLine("9:16",30)="1080×1920 · 9:16 · 30fps · H.264"`; publishReview = 2 `.tsx`
(tone code) + 1 `.json` (tone data, path contains the project id); publishLogRows = the 5 exact lines;
two-step bump v0.0.1 → live v0.0.2 → working v0.0.3 (chip v0.0.3, Publish button "Publish v0.0.4 ▸").

## §7 scope amendment (2026-07-17) — 13b left-panel scene-tree + inspector rebuild (PLANNED)

User overrode D-13B-PANELS-DEFERRED. Planned as §7 in `scratch/turn13-14-studio-publish-wizard.md`,
additive to §1–§6. **Headline: view-only — ZERO new reducer state/actions** (contrast Turn 14). Real cost
is a big `studio.e2e.ts` migration. Three flagged judgment calls:
- **D-NAVRAIL-REPLACE** — DELETE `nav-rail.tsx` outright (every button is `onClick={noop}`, purely
  decorative; "Back to workspace" lives in `top-bar.tsx`'s `studio-back`, not the rail). Scene-tree takes
  its slot.
- **D-INSPECTOR-KEEP-EDIT** — KEEP the edit seams, restyle to 13b. `script-input` already renders as a
  13b-style italic red-border blockquote AND is the primary `dirty` seam (E8/E-SP2/E-VER2 depend on it) —
  keep it editable. Keep `visual-input`; replace the two-way `onscreen-show/voice` pill with a single
  `captions-switch` (still `SET_ON_SCREEN_TEXT`); ADD `scene-duration` + inert `reroll-visual`; DELETE the
  voice-preview row, music-mood cycler, `+ Drop image` dropzone, footer tagline, `scene-range`,
  `reroll-scene`, big Anton number. Keep `scene-number` in the new "SCENE NN · INSPECTOR" header.
- **D-13B-LAYOUT** — remove NavRail → top bar/timeline go full-width; `SceneTree` first in the body row;
  `scene-inspector` → `width:300`; `player-panel` wrapper → `flex:1` (center-fill). Timeline STAYS a
  full-width bottom strip (13b nests it in the center — deliberate out-of-scope divergence).

Scene-tree = root(`🎬 name` + `aspectDimensions`) + inert `◷ AudioTrack` + N real scene rows
(`sceneTreeLabel` = `Scene 01 · wilderness · dawn`, derived — NOT the wireframe Psalm mock) + inert
`＋ Add scene`. **EndCard DROPPED** (scene `s4`="verse card" already IS the end card — a 5th node would
double-count). Rows call the existing `selectScene` — a 2nd surface onto `selectedSceneId`, no dup state.

New pure logic (only unit test): `sceneTreeLabel(scene)` in `lib/studio/storyboard.ts`. Files: DELETE
`nav-rail.tsx`; CREATE `scene-tree.tsx`; REWRITE `scene-inspector.tsx`; MODIFY `studio-app.tsx` (mount
swap) + `player-panel.tsx` (wrapper flex, off the UNTOUCHED list — no behavior change). E2E: NEW E14-E16
(scene-tree) + MIGRATE `studio.e2e.ts` E2 (anchor list)/E5 (scene-range→scene-duration)/E7 (pill→
captions-switch)/E9,E13 (reroll trigger → top-bar `regenerate`). New testids: `scene-tree(-root/-audio/
-row[+data-scene-id/data-selected]/-add)`, `scene-inspector`, `scene-duration`, `reroll-visual`,
`captions-switch[+data-on]`. Removed: `scene-range`, `reroll-scene`, `onscreen-show`, `onscreen-voice`.
Minor risk R-MUSIC-MOOD-UNSURFACED: `musicMood` loses its only UI surface (kept in state).

### §7 Step 7 amendment DONE (2026-07-17) — tests written + verified RED; regression + Turn-14 controls unaffected

Test-only diff, exactly two files: `lib/studio/storyboard.test.ts` (+`U-ST-TREE`) and
`tests/e2e/studio.e2e.ts` (header §7 testid contract; `attrBySelector` helper; EXACT_ANCHORS inspector
section migrated; E5/E7/E9/E13 migrated; E14-E16 appended).

- **Unit RED (right reason):** `U-ST-TREE` → `sceneTreeLabel is not a function` (missing named export
  from the existing `storyboard.ts`; the other 13 storyboard tests stay GREEN, same missing-export
  pattern as U-PL9/U-SP7). Full unit suite: **10 failed / 125 passed** = the 9 Turn-14 failures (U-PL9,
  U-SP7/8/9, U-R16..R20, + the 3 whole-file "missing module" collect-errors publish-review/render-model/
  version-history) **UNCHANGED**, plus this 1 new. Turn-14 RED status untouched.
- **E2E RED (right reason, Gloo-free, ran locally ~8s):** `studio.e2e.ts` **6 failed / 10 passed (16)**.
  RED = E2 (missing NEW inspector anchors: `INSPECTOR`, `· whole video`, `↻ Reroll visual`, `On-screen
  captions`, `Show verse text`, `Duration`, `Scene length`, `9.0s`), E5 (`scene-duration` "" vs "8.0s"),
  E7 (`captions-switch` count 0), E14/E15/E16 (`scene-tree*` count 0). **GREEN = E1,E3,E4,E6,E8,E9,E10,
  E11,E12,E13** — crucially E9 & E13 STAY green because they were decoupled from the doomed inspector
  `reroll-scene` onto the top-bar `regenerate` (which already exists). E8 green (script-input kept).
- **Note for Step 9 (Green):** `→ AI` and `SCRIPT` anchors are incidentally already satisfied (`→ AI` via
  the current `→ AI VOICE` substring; `SCRIPT` via the timeline track label), so they are NOT in the E2
  missing list — the 8 listed above are the load-bearing RED anchors. Step 9 must render all of them and
  DELETE the removed copy or E2 flips to GREEN correctly. Scene-tree row label pins `Scene NN · <label>`;
  E14 asserts exactly 4 rows + NOT `Shelter`/`Still Waters`/`EndCard`; root shows `1080×1920`/`1920×1080`
  tracking the aspect; initial selection = `s2`. Turn-14 test files were NOT touched.

## Step 9 IMPLEMENTED (2026-07-17) — all GREEN (unit 149/149, e2e 66/66, tsc+lint clean)

Turn 14 (14a/b/c) + the §7 13b rebuild shipped and verified. New: `lib/studio/{version-history,
render-model,publish-review}.ts`; `app/studio/_components/{scene-tree,studio-log,publish-wizard,
version-menu,render-overlay}.tsx`. Extended: `project.ts` (prev/published/postPublishBranch),
`provisioning-log.ts` (publishLogRows), `reducer.ts` (5 new state fields + 9 actions + two-step
PUBLISH_DONE), `storyboard.ts` (sceneTreeLabel). Rewired: `top-bar.tsx` (publish→openPublish, chip ▾→
version-menu-trigger), `studio-context.tsx` (removed `publish()`, added the overlay drivers),
`studio-app.tsx` (mount the 3 overlays + scene-tree, dismiss family += versionMenuOpen, owns the render
ticker). DELETED `nav-rail.tsx`. `scene-inspector.tsx` rewritten to 13b; `player-panel.tsx` → flex-fill.

- **Flush-viewport (verbal req, no test):** `StudioFrame` is now `position:fixed; inset:0` (was a fixed
  1300×950 card centered in `.backdrop`). `fixed` escapes the shared `.backdrop` centering+padding
  WITHOUT touching `[id]/page.tsx` or the shared `studio.module.css .backdrop` (which `not-found.tsx`
  still uses centered). Verified in real Chrome (Stagehand screenshot + geometry): frame rect exactly
  {0,0,innerW,innerH}, scene-tree left=0, no scroll overflow — edge-to-edge, matches the 13b mockup.
- **Two content-edit reducer nuance:** content edits (EDIT_SCRIPT/VISUAL/ON_SCREEN/MUSIC) now also clear
  `versionMenuOpen` — the 14b spec's "edit → REOPEN the menu" (E-VER2) needs the dropdown to dismiss on a
  content edit (typeIntoScript fires no pointer event, so the outside-click dismiss wouldn't catch it).
- **E2E flakiness — 3 real fixes (studio-publish.e2e.ts, ~10s Gloo-free suite of 11):** the publish flow
  is uniquely flaky because clicks there unmount their own subtree + auto-advancing tickers churn the DOM.
  (1) `StudioLog` row indicator is ONE PERSISTENT node whose class/border/text update in place — never an
  element↔text swap per tick — which was racing the understudy's node geometry. (2) `clickTestId` retries
  on the transient CDP `-32000 Node does not have a layout object` (an AWAITED reject from
  `locator.click`'s pre-dispatch `getBoxModel` when the target unmounts; the reject stack shows only
  `cdp.onMessage` because `session.send` is a manually-managed promise — misleading, it IS the click).
  `getBoxModel` precedes the synthetic mouse dispatch, so a rejected click performed NO action → retry is
  safe. (3) `gotoStudio` settles 700ms after `studio-frame` appears: the studio island is SSR'd, so the
  frame is in the DOM BEFORE hydration attaches onClick — clicking `publish-button` in that window is a
  silent no-op and `waitForTestId("publish-wizard")` times out at ~8s (the mount-gate race, [[test-harness]]).
  Also slowed the render ticker (10 frames/150ms ≈ 13.5s > the 10s "progress climbs" poll window) so
  E-RND2 never samples a completed render. All test-LOCAL helper changes; zero assertion edits.
- **Publish card geometry:** the wizard card is TOP-anchored (`top:32`, translateX only), NOT vertically
  centered, so the full-frame `publish-backdrop`'s geometric center stays exposed — the understudy's
  coordinate click on `publish-backdrop` must land on the dimmer (not the card) to dismiss step 1 (E-PUB3).
- **Stable across reruns:** publish suite 3×11/11, E-VER2 5/5, full e2e 66/66. One pre-existing lint
  WARNING (`allTestidText` unused, a Step-7 helper) left untouched.
