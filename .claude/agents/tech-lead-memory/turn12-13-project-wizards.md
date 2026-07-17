---
name: turn12-13-project-wizards
description: Turn 12/13 plan — New-project + Import wizards + /studio/[id] migration; Step 7 tests written & RED; the exact model/testid contracts Step 9 (Green) must match
metadata:
  type: decision
---

Turn 12/13 = the New-project wizard (12a create-new + 13a existing-empty tabs), the Import wizard
(12b, happy + "not a Supagloo project" error), and migrating the studio editor from bare `/studio`
to `/studio/[id]` (13b top bar: version-branch chip + Commit/Publish). **FRONTEND-ONLY, MOCKED**
(same as Turn 5/10/11): no real GitHub/Railway/git — every async beat is a pure reducer +
caller-owned `setTimeout`. Full Step-6 plan: `scratch/turn12-13-project-wizards.md` (authoritative;
resolves 6 ambiguities A1–A6, decisions D-*). Builds on [[workspace-onboarding-plan]],
[[studio-editor-e2e]], [[test-harness]], [[remotion-integration]].

## Step 7 DONE (2026-07-16) — tests written + verified RED; regression trio GREEN

Files CREATED (unit, colocated): `lib/project-wizard/{repos-model,provisioning-log,new-project-model,
import-model}.test.ts`, `lib/studio/project.test.ts`. MODIFIED unit: `lib/studio/reducer.test.ts`
(init now takes a StudioProject; +dirty/commit/publish cases U-R12–U-R16). CREATED E2E:
`tests/e2e/{project-wizards,studio-project}.e2e.ts` (Gloo-free Stagehand, no `llmClient`, full
data-testid contract header block). MODIFIED E2E: `tests/e2e/studio.e2e.ts` (URL →
`/studio/psalm-121`; identity anchors `VERSE OF THE DAY`/`PREVIEW`/`· Jul 4`/`GENERATE`/`SHARE` →
`psalm-121`/`ashsrinivas/psalm-121`; body unchanged — still the John 1:23 storyboard).

- **Unit RED:** 6 suites fail `Cannot find module` (`./repos-model`, `./provisioning-log`,
  `./new-project-model`, `./import-model`, `./project` ×2). Other 10 unit suites GREEN (74 tests).
  Trick that makes reducer.test + new-project/import tests RED cleanly: `import { fn, type X }` — the
  **value** import forces module resolution (esbuild strips `import type`, so type-only wouldn't).
- **E2E RED (right reason):** project-wizards 6 tests fail on missing entry-point testids
  (`countTestId("workspace-new-project")` = 0); studio-project 4 fail on missing `/studio/[id]` route
  (`studio-frame` = 0) and E-SP4 fails `expected 1 to be 0` because **bare `/studio` still renders the
  OLD editor** (Step 9 must DELETE `app/studio/page.tsx`); studio.e2e 13 fail on the moved route.
  Regression trio (landing, workspace-profile, onboarding-wizard) = 3 files / 29 tests GREEN. Stagehand
  init/goto/evaluate/locator all connected. `NEXT_PUBLIC_SUPAGLOO_DEMO=1` already in `.env.local`, so
  `/?mock=authed-returning` reaches the workspace.

## The contracts Step 9 (Green) must match EXACTLY (locked by the tests)

- **`repos-model.ts`**: `interface MockRepo {fullName,shortName,owner,isEmpty,isSupaglooProject,
  updatedLabel,latestBranch:string|null}`; `MOCK_REPOS` (4): psalm-121 (empty,!supagloo,latestBranch
  null), genesis-light (!empty), exodus-red-sea (supagloo,"v0.2.3","Updated 5 days ago"), notes-app
  (!supagloo,"Updated 2 weeks ago"). `OWNER="ashsrinivas"`; `reposForNewProject()` ⊇ {psalm-121,
  genesis-light}; `reposForImport()` ⊇ {exodus-red-sea,notes-app}; `searchRepos(repos,q)` = case-insens
  fullName filter (empty/whitespace q → all); `findRepo(fullName)`; `deriveShortName` slugs (lowercase,
  trim, spaces→hyphens; `"Psalm 121"`→`"psalm-121"`).
- **`provisioning-log.ts`**: `LogSequence{rows,activeIndex}`; `LogRowStatus`; `initLog`(idx0)/
  `advanceLog`(idx+1, clamp ≤len)/`logRowStatus`(i<active completed,==active,>queued)/`isLogComplete`
  (idx≥len); `PROVISION_ROW_DELAY_MS`>0. `newProjectLogRows("create-new",{fullName,branch})` = 7 rows
  starting `"Created repo ashsrinivas/psalm-121"` … `"Opening studio"`; `"existing-empty"` = same **minus
  row 1** (6 rows — the 13a gap). `importLogRows({latestBranch})` = 4 rows (`Cloned…`/`Found valid
  Remotion project · remotion.config.ts`/`Latest version branch v0.2.3`/`Checking out v0.2.3 · opening
  studio…`). Row copy is label-only (view prepends ✓/spinner/○).
- **`new-project-model.ts`**: `NewProjectStep=configure|scaffolding|ready`; `RepoTab=create-new|
  existing-empty`; `progressFill`=33/66/100; `stepEyebrow`="NEW PROJECT · STEP 1/2 OF 3"|null(ready);
  `ctaLabel`= "Create & scaffold →"|"Scaffold into this repo →"; `defaultProjectName(s)=s`;
  `canScaffold({tab,repoName,selectedRepo})` (create-new: non-blank name; existing-empty: selectedRepo
  && isEmpty); `deriveProjectId(sameInput)` (create-new→deriveShortName(repoName); existing-empty→
  selectedRepo.shortName).
- **`import-model.ts`**: `ImportStep=pick|verifying|ready|error`; `progressFill`=50/88;
  `stepEyebrow`="IMPORT PROJECT · STEP 1/2 OF 2"; `IMPORT_FAILED_EYEBROW="IMPORT FAILED"`;
  `canImport(repo|null)`; `verifyOutcome(repo)`=repo.isSupaglooProject?"success":"failure";
  `deriveProjectId(repo)=repo.shortName`.
- **`lib/studio/project.ts`**: `interface StudioProject {id,projectName,repo,versionBranch,storyboard}`;
  `STUDIO_PROJECTS` covers genesis-light/psalm-23/beatitudes (workspace ids) + psalm-121(`v0.0.1`) +
  exodus-red-sea(`v0.2.3`), ALL mapping to `DEMO_STORYBOARD`; `projectName`=the shortName (E-SP1/E-SP4
  assert `studio-project-name`="psalm-121"/"genesis-light"); psalm-121.repo="ashsrinivas/psalm-121".
  `findStudioProject(id)`→null on miss; `nextVersion("v0.0.1")="v0.0.2"`, `"v0.0.9"="v0.0.10"` (integer
  patch bump); `publishLabel(b)="Publish "+nextVersion(b)+" ▸"`; `studioUrl(id)="/studio/<id>"`;
  `studioChipUrl(id)="supagloo.com/studio/<id>"`.
- **`reducer.ts`**: `StudioState` += `versionBranch,dirty,committing,publishing`; **`initialStudioState`
  signature changes `(Storyboard)→(StudioProject)`** (reads `.storyboard`, seeds `versionBranch`,
  dirty/committing/publishing false) — ripples to `studio-context`/`studio-app`/`[id]/page.tsx`
  (R-REDUCER-SIG). Content edits (EDIT_SCRIPT/EDIT_VISUAL_PROMPT/SET_ON_SCREEN_TEXT/SET_MUSIC_MOOD) set
  dirty:true; view actions (SET_ASPECT/SELECT_SCENE/PLAY/toggles) do NOT. New actions COMMIT_BEGIN/
  COMMIT_DONE(dirty:false)/PUBLISH_BEGIN/PUBLISH_DONE(dirty:false, versionBranch=nextVersion(...)).
  Reducer imports `nextVersion` from `./project`. `MOCK_COMMIT_DELAY_MS`/`MOCK_PUBLISH_DELAY_MS`.

## data-testid seams Step 9 must emit (E2E-locked)

Workspace wiring: `workspace-new-project`, `workspace-import-repo`, `recent-new-project-card`,
`project-open-<id>`. New-project: `new-project-wizard`, `modal-backdrop`, `new-project-progress`(+`-fill`),
`new-project-eyebrow`, `new-project-close`, `tab-create-new`/`tab-existing-empty` (aria-pressed),
`new-repo-name`, `repo-visibility`, `project-name-display`, `repo-search`, `repo-row-<shortName>`
(+`data-selected`/`data-disabled`), `new-project-cta`, `provisioning-log`, `log-row`(+`data-status`),
`project-ready-card`, `open-in-studio`. Import: `import-wizard`, `import-progress`(+`-fill`),
`import-eyebrow`, `import-close`, `import-cta`, `import-error-card`, `import-error-choose-another`,
`import-error-start-new`. Studio 13b: `studio-back`, `studio-project-name`, `studio-project-rename`,
`studio-repo-path`, `version-branch-chip`(+`data-dirty`), `unsaved-dot` (present ONLY when dirty),
`dirty-caption` ("All changes committed"|"Edited … · not committed"), `commit-button` (disabled when
clean), `publish-button`, `studio-avatar`("AS"), `studio-not-found`; **retained** (D-TOPBAR extend, NOT
replace) `aspect-9x16/16x9/1x1`, `regenerate`, `render-share`, `script-input`, `studio-frame`.

## Step 9 DONE (2026-07-16) — all GREEN

Implemented to the locked contracts; unit 126/126 (16 files), E2E 52/52 (6 files, incl. the
landing/workspace-profile/onboarding regression trio), `tsc --noEmit` clean, eslint clean. Files
CREATED: `lib/project-wizard/{repos-model,provisioning-log,new-project-model,import-model}.ts`,
`lib/studio/project.ts`; views `app/_components/project-wizard/{wizard-shell,segmented-control,
repo-picker,provisioning-log,terminal-ready-card,wizard-cta,new-project-wizard,import-wizard}.tsx`
+ `wizard.module.css` (scoped `sg-spin` keyframe — NOT globals.css); `app/studio/[id]/page.tsx`,
`app/studio/not-found.tsx`, `app/studio/ws-tokens.ts`. MODIFIED: `lib/studio/reducer.ts`,
`app/studio/_components/{studio-app,studio-context,top-bar}.tsx`, `app/_components/workspace/
{workspace-home,recent-projects}.tsx`.

### KEY DEVIATION — bare `/studio` guard (do NOT "fix" back to a plain delete)
The plan/§3 said DELETE `app/studio/page.tsx` so bare `/studio` 404s. **Deleting alone is
insufficient in Next 16**: a nested `not-found.tsx` only catches `notFound()` throws in its segment;
unmatched URLs are handled ONLY by a ROOT `app/not-found.tsx` (none exists) → bare `/studio` fell
through to Next's generic 404 whose body reads *"could not be found"*, which does NOT match E-SP4's
`/not found/i` and lacks the `studio-not-found` testid → E-SP4 bare case FAILED. Verified live vs
`next dev` (2026-07-16, curl). **Fix kept in place:** `app/studio/page.tsx` is a 1-line guard that
calls `notFound()` → renders the themed `app/studio/not-found.tsx` (studio-not-found + "PROJECT NOT
FOUND" copy). Same user-facing intent (bare `/studio` 404s, never the editor), scoped to the studio
segment (no app-wide root not-found). `notFound()` returns HTTP 200 for the streamed dev response
(status not asserted by E-SP4). Unknown ids (`/studio/xxx`) 404 correctly via `[id]/page.tsx`'s
`notFound()`.

### Other Step-9 notes
- `bodyText()` in the wizard E2E reads `textContent` ONLY (no input `.value` append, unlike
  `studio.e2e`'s `readableText`), so the `"psalm-121"` E-NP1 anchor is satisfied by the rendered
  `project-name-display` div, NOT the `new-repo-name` input value. Keep a rendered text mirror of any
  input the E2E anchors on.
- `repo-picker` disabled (non-empty) rows use `aria-disabled`+`data-disabled` and a guarded onClick,
  NOT the native `disabled` attr — so the Stagehand understudy's `.click()` on a disabled row never
  times out (E-NP3 clicks it and asserts no selection).
- Log auto-advance: caller `setTimeout(advanceLog, PROVISION_ROW_DELAY_MS=140)`; New-project advances
  to `ready` one tick after `isLogComplete`; Import stops at complete and shows the manual
  `open-in-studio` CTA (no self-nav, D-REDIRECT). `MOCK_COMMIT_DELAY_MS=320`/`MOCK_PUBLISH_DELAY_MS=480`.
- `STUDIO_PROJECTS` version branches: genesis-light v0.3.0, psalm-23 v0.1.2, beatitudes v0.0.4,
  psalm-121 v0.0.1, exodus-red-sea v0.2.3 (only psalm-121/exodus/genesis asserted).
- D-TOPBAR shipped "extend": kept aspect toggle + Regenerate + Render & Share; dropped only the
  GENERATE/PREVIEW/SHARE step indicator. Wilderness palette (hardcoded #… + a few rgba) not `--sg-*`.

## Deviations / open flags for Step 9
- **E-NP3 skips the optional scaffold** that would prove the existing-empty log drops the "Created
  repo" row — that A/13a gap is locked deterministically in `provisioning-log.test.ts` U-PL2 instead
  (avoids flaky auto-sequencing timing in E2E). Fine as-is.
- **D-TOPBAR is the one judgment call** (keep Regenerate/Render&Share vs strict-13b delete) — chosen
  "extend"; user can veto for strict. E-SP1 cross-checks the retained seams stay present.
- E2E log/commit/publish assertions **poll** (never fixed sleeps) — R-LOG-TIMING. If Step-9 GREEN is
  flaky, tune `PROVISION_ROW_DELAY_MS` / the poll windows, don't add sleeps.
