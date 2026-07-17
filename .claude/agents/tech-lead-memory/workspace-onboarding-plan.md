---
name: workspace-onboarding-plan
description: Turn 10/11 plan — flag-gated mock-session seam, HomeSwitch RSC-via-props branch, shared connections-model, wizard state machine, new modal primitive
metadata:
  type: decision
---

Turn 10/11 = 5 signed-in screens (10a workspace, 10b profile & connections, 11a first-time wizard,
11b/11c connect modals). **FRONTEND-ONLY, user-confirmed**: no real GitHub/OpenRouter/YouVersion OAuth,
no data model, no backend — all connection/onboarding/auth-reachability state is **mocked** via pure
`lib/*` models + one client context. Full TDD plan: `scratch/turn10-11-workspace-onboarding.md` (Step 6).
Builds on [[auth-integration]], [[landing-auth-viewport]], [[test-harness]], [[studio-editor-e2e]].

## Load-bearing decisions
- **D-AUTH — flag-gated mock-session override (the E2E reachability seam).** Stagehand can't do real YV
  OAuth, so the signed-in UI is unreachable by the landing-suite approach. One client `SessionProvider`
  /`useSession()` is the single source of truth; in prod it derives `isAuthed`/`user` from `useYVAuth()`
  + `hasOnboarded` from a localStorage stopgap keyed by `userInfo.userId`; in **demo mode only**
  (`NEXT_PUBLIC_SUPAGLOO_DEMO==="1"`, set in `.env.local`/E2E, absent in prod) a `?mock=<scenario>` param
  forces a deterministic signed-in session. Scenarios: `authed-fresh` (→ wizard overlays workspace),
  `authed-returning` (onboarded, wireframe seed: github+openrouter connected, gloo not-linked),
  `authed-unlinked` (all not-linked → so 10b shows the "Connect" buttons that open 11b/11c). Parse +
  precedence is pure/unit-tested (`lib/session/session-model.ts`).
- **D-ROUTE — `/` branches without a server session.** `app/page.tsx` (RSC) renders a mount-gated client
  `<HomeSwitch publicLanding={<PublicLanding/>} workspace={<WorkspaceHome/>} />`. Both trees passed as
  **props** so `PublicLanding` stays an RSC (client can render RSC children given as props, not import
  them) → `/` still SSRs marketing HTML; swaps to workspace only when `mounted && session.isAuthed`.
  10b = `/profile`; 11a overlays the workspace when `firstSignIn`; 11b/11c = modals inside `/profile`.
- **Shared connections model = "same state, different entry point."** `lib/connections/connections-model.ts`
  (studio-reducer style: `beginConnect`→pending / `completeConnect`→connected / `disconnect`→not-linked,
  immutable) is the ONE state that 10a's strip, 10b's cards, AND 11b/11c modals + wizard steps all read
  and dispatch. Mock connect: `pending` set **synchronously** (assert first) then `setTimeout(
  MOCK_OAUTH_DELAY_MS≈350)` → connected (poll). Derivations `stripItems`/`cardModel` decide all
  connected/not-linked/pending presentation in one place (resolves the undesigned-state ambiguity).
- **Wizard state machine** `lib/onboarding/wizard-model.ts`: 5 steps welcome→github→openrouter→gloo→done
  (Done has NO ordinal); `progressFill`=20/45/70/92/100; **github is a hard gate** (`canAdvance("github")`
  false until connected, no skip); openrouter/gloo skippable; `doneRecap(connections)` templates the recap
  from ACTUAL state (not the hardcoded wireframe row).
- **New modal primitive** `app/_components/modal.tsx` (none existed): portal + dimmed backdrop +
  `role=dialog` + focus trap/restore + Escape/backdrop close (a11y lifted from `nav-auth.tsx`).
  `dismissible` prop — 11b/11c true, wizard false. Shared connect BODIES
  (`connect/{github,openrouter}-connect-body.tsx`, `gloo-credentials-form.tsx`) are reused verbatim
  between wizard steps and standalone modals; OpenRouter body's `showPkceCallout` is true only in 11c
  (deliberate wizard-leaner divergence — matches the raw).

## Tests
- Unit (Vitest node): 4 pure suites — session-model, connections-model, wizard-model, projects-model.
- E2E (Stagehand `env:"LOCAL"`, **NO llmClient** → Gloo-free/deterministic, like studio.e2e.ts):
  `tests/e2e/workspace-profile.e2e.ts` (10a/10b/11b/11c) + `onboarding-wizard.e2e.ts` (11a). Drive the
  `?mock=` URLs; testid + glyph-exact `textContent` anchors + computed-style; `waitForGone` for
  overlays/modals on close. Extract shared `evaluate` helpers to `tests/e2e/helpers.ts` (refactor
  landing.e2e.ts to import them; keep the landing suite as a regression control).

## Step 7 DONE (2026-07-16) — tests written + verified RED; landing still GREEN

All tests authored and confirmed RED for the right reason (Step 9 turns them GREEN, gated on user
permission). Files: `tests/e2e/helpers.ts` (NEW — `makeHelpers(page)` returns the 6 landing helpers
`bodyText/waitForText/isVisibleByTestId/widthByTestId/textIsVisible/waitForGone` + exported
`StagehandPage`/`E2EHelpers` types); refactored `tests/e2e/landing.e2e.ts` to import them (rebinds via
module-level `let` in `beforeAll` → zero call-site edits; `innerWidth` stays inline). NEW suites:
`lib/{session/session-model,connections/connections-model,onboarding/wizard-model,workspace/projects-model}.test.ts`
(unit), `tests/e2e/{workspace-profile,onboarding-wizard}.e2e.ts` (Gloo-free Stagehand, no `llmClient`).

- **Verified RED:** 4 unit suites fail `Cannot find module './<model>'` (the intended TDD red; the
  accompanying `TS7006` implicit-any on `.find/.map` callbacks is a downstream symptom of the missing
  module's types and auto-resolves once Step 9 ships them). 2 E2E suites: 14 fail (clean AssertionErrors —
  missing seams / `?mock=` renders the current public landing) + **1 pass = E-W1**, the deliberate
  regression control (signed-out `/` still renders the landing, present today AND after D-ROUTE). Stagehand
  init/goto/evaluate/locator all connected — no harness errors. **Landing e2e still 13/13 GREEN** after the
  helpers extraction (Gloo was up).

### The unit contracts the tests LOCK IN (Step 9 must match these exact shapes)
- **session-model:** `parseMockSession(search, demoFlag) → MockSession | null` where `MockSession =
  {scenario, isAuthed:true, hasOnboarded, connectionsSeed:"wireframe"|"none-linked"|"all-linked"}`.
  Decided (plan's US-1 "none-or-wireframe" was ambiguous): **authed-fresh → seed "none-linked"** (fresh
  user has nothing linked; the wizard links them), hasOnboarded false; authed-returning → "wireframe",
  onboarded; authed-unlinked → "none-linked", onboarded. `demoFlag:false` ⇒ always null (prod no-op).
  `resolveSession({yvAuth, demoFlag, search, onboardedRaw}) → Session{isAuthed, user:{name,email}|null,
  hasOnboarded}`; demo override wins only when flag set; demo user = "Ash Srinivas"/"ash@supagloo.com".
  `firstSignIn(session) = isAuthed && !hasOnboarded`. `hasOnboardedFromRaw(raw)` true only for "1".
  `onboardingStorageKey(userId)` stable + contains the userId.
- **connections-model:** `seedWireframe/seedNoneLinked/seedAllLinked`; `beginConnect/completeConnect/
  disconnect` (immutable, `MOCK_OAUTH_DELAY_MS` exported >0 <2000). Details: github `{username:"@ashsrinivas",
  repos:12}`, openrouter `{maskedKey:"sk-or-••••••4f2a", credit:"$18.40 credit remaining"}`, gloo
  `{method:"CLIENT CREDENTIALS"}`. `stripItems(s)[i] = {provider,label,sub,dotColor|null,linkLabel|null}`
  (connected→dotColor "#2f8f4e"; gloo not-linked→sub "Not linked — add credentials", linkLabel "Link ▸").
  `cardModel(s,provider) = {provider,title,status,pillText,badge|null,body:"detail"|"connect"|"gloo-form",
  actionLabel,opensModal:"github"|"openrouter"|null}` (github/or not-linked→"Connect"+opensModal; gloo
  not-linked→"gloo-form"+"Save & verify"+null; connected→"detail"+"Disconnect"; or badge "PKCE OAUTH",
  gloo badge "CLIENT CREDENTIALS"; title "OpenRouter.ai").
- **wizard-model:** `WIZARD_STEPS=[welcome,github,openrouter,gloo,done]`; `progressFill`=20/45/70/92/100;
  `stepLabel` "STEP n OF 4 · …" (done→null); `canAdvance("github",c)` iff github connected (else steps
  true); `isSkippable` true only openrouter/gloo; `nextStep` chain (done→null); `stepAfterSkip`
  openrouter→gloo, gloo→done; `doneRecap(c) → RecapRow[3] {provider,connected,text}` templated:
  "✓ GitHub connected · @ashsrinivas" / "✓ OpenRouter connected" / "— OpenRouter skipped · add later in
  Profile" etc.
- **projects-model:** `DEMO_PROJECTS` (3) with `{id,title,repo,status,opened,branch,posterLabel,
  posterGradient, + a sortable recency key}`; `sortByLastOpened` pure, most-recent first
  (genesis-light→psalm-23→beatitudes). ids: genesis-light/psalm-23/beatitudes.

### data-testid contract the E2E LOCK IN (Step 9 must emit these exact seams)
`workspace-home` (10a mount-gate), `workspace-profile-pill`→`profile-menu`→`menu-account-settings`(→/profile);
`profile-page` (10b mount-gate); `connection-card-{github,openrouter,gloo}` each carrying
**`data-status`="connected"|"not-linked"|"pending"** (the two-phase mock-OAuth seam: click →
`pending` SYNCHRONOUSLY → poll to `connected`); `card-connect-{github,openrouter}` (not-linked Connect →
11b/11c); `disconnect-{github,openrouter,gloo}`; gloo inline form `gloo-secret` (input, type
password↔text), `gloo-reveal` (👁), `gloo-save`; modals `connect-{github,openrouter}-modal`,
`modal-backdrop` (click-to-close for dismissible), `modal-close` (✕); shared connect-body actions
`connect-authorize` (Authorize with GitHub — wizard github + 11b), `connect-openrouter-submit` (wizard
openrouter + 11c); `pkce-callout` (present in 11c, **absent** in wizard openrouter step). Wizard:
`setup-wizard` (overlay, not dismissible), `modal-backdrop`, `wizard-progress` + `wizard-progress-fill`
(width === progressFill%; E2E checks fill/track ratio ≈.20 welcome / >.9 done), `wizard-step-label`
(absent on Done), `wizard-get-started`, `wizard-skip` (openrouter "Skip for now →" / gloo "Skip"),
`wizard-finish`. Wizard auto-advances github→openrouter once github connects. Demo flag
`NEXT_PUBLIC_SUPAGLOO_DEMO=1` is NOT set yet (Step 9 adds it to `.env.local`) — without it `?mock=` is inert.
