---
name: studio-editor-e2e
description: Deterministic E2E tactics for the /studio (5a) editor — understudy center-click, Remotion rAF play-stall, seek-based frame guard, detached-popover waitForGone, per-frame caption
metadata:
  type: reference
---

Gotchas verified 2026-07-16 finishing the Turn 5 / Fig 5a "Wilderness Studio" editor
E2E (`tests/e2e/studio.e2e.ts`, Gloo-free deterministic Stagehand). All confirmed
first-hand (headed Chrome + Playwright headless-chrome + the Stagehand understudy).

**Stagehand v3 understudy `locator.click()` = CDP click at the element's CONTENT-box
CENTER.** It sends `Input.dispatchMouseEvent` at real viewport `x,y` (the box-model
content center), NOT a DOM `element.click()`. So the resulting `MouseEvent.clientX` is
real (the horizontal center). For a scrubber (`role="slider"`) whose `onClick` maps
`clientX → frame`, a plain `.click()` deterministically seeks to the TIMELINE MIDPOINT.
The exact landing is driver-dependent by a few px: the understudy lands on **frame 445**,
a raw `page.mouse.click(center)` on **450** (for the 900-frame 0:30@30fps demo). **Assert a
band, not an exact value** (E6 uses `after > 400 && after < 500`). No position-click API on
the understudy locator — center is all you get; use scene-segment clicks for precise seeks.

**Remotion Player real-time (rAF) play-advance STALLS under the Stagehand headless
understudy, but the PRODUCT IS FINE.** In a real browser (headed Chrome AND Playwright
headless-chrome) pressing play advances `data-current-frame` ~170→206 over ~1.2s (≈30fps).
Under the understudy it sticks. So an "advances during play" assertion is a false-negative
flake, not a bug. **Guard the frame wiring deterministically with a SEEK** (scrubber
center-click → mid-timeline frame) which exercises the same `frameupdate → data-current-frame`
path without real-time rAF. The play/pause TOGGLE (`data-playing` true→false via
`playerRef.toggle()`) IS deterministic — assert that. This is why E6 is play-toggle + seek,
not play-advance. See [[remotion-integration]] (30Hz frameupdate perf note).

**Composition caption is PER-FRAME.** Remotion `<Sequence>` only mounts the ACTIVE scene's
subtree, so `playerText()` (`.__remotion-player` textContent) shows ONLY the current scene's
caption. A seek into another scene changes it (frame 450 = scene 3, `voice-only` → no
caption, just the "JOHN 1:23 · KJV" reference that every scene shows). So after a seek-away,
RESTORE the frame before any scene-specific caption assertion: click `scene-seg-s2` →
`selectScene("s2")` seeks the Player back to scene 2's start (frame 150). E6 does this so
E7/E8 (which assert scene 2's caption) stay green. The `+20` initial-frame offset in
`player-panel.tsx` is to clear the caption fade-in edge (opacity `interpolate([0,8])`);
`textContent` is unaffected by opacity, so restoring to the exact scene start (150) is fine.

**Conditionally-rendered popovers DETACH on dismiss.** `reroll-menu` / `ship-menu` are
`{state.xOpen ? <Menu/> : null}` in `studio-app.tsx`, so Escape/outside-click UNMOUNTS them.
The understudy's `waitForSelector(state:"hidden")` never resolves for a detached node
(Playwright treats detached as hidden; the understudy does not). Poll `count()===0` via a
`waitForGone(testid)` helper — copied verbatim from `landing.e2e.ts` (its mobile-sheet fix).
Same failure class as landing test N.
