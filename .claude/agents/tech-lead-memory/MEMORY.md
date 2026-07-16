# Tech Lead — Shared Memory Index (this repo)

This is the shared, cross-session memory for the **tech-lead** (Opus) and
**fabulous-tech-lead** (Fable) persona, **scoped to this repository**. Both
engines read and write here; this memory does not cross into other repos.

Each entry below points to one memory file in this directory. Keep this index to
one line per memory (`- [Title](file.md) — hook`); put the actual content in the
individual files, never here.

## Memories

- [Test harness](test-harness.md) — no runner shipped; Vitest (unit) + Stagehand/Gloo (E2E), transitive-dep gotchas, DOM-text assertion tactic
- [Auth integration](auth-integration.md) — useYVAuth surface (userId not id, avatarUrl getter), mount-gate, global-header-removed decision
- [Landing responsive + dropdown a11y](landing-responsive.md) — R2 breakpoints (1320 pixel-lock, lg-for-demo b/c E2E@1288), R1 nav-auth dismiss/menu roles
- [Landing auth×viewport (Turn 8/9)](landing-auth-viewport.md) — 8a/9a/9b matrix, hero-model pure seam, mount-gated hero-lede, md breakpoint, favicon Next-16 wiring
- [Remotion integration](remotion-integration.md) — remotion+@remotion/player 4.0.490 verified on Next 16/Turbopack/React 19; Player renders `.__remotion-player` DOM (no canvas), no bundler config
- [Studio editor E2E](studio-editor-e2e.md) — /studio (5a) deterministic-test tactics: understudy center-click, Remotion rAF play-stall→seek guard, per-frame caption restore, detached-popover waitForGone
