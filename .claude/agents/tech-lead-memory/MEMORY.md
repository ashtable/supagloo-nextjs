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
