---
name: translation-schema-free-string
description: nextjs TranslationSchema is a FREE string (not a KJV/BSB enum) — widening it fixed studio re-hydration; reversed task-57's deferral
metadata:
  type: decision
---

`lib/api/contracts.ts` `TranslationSchema` is **`z.string().min(1)`**, NOT
`z.enum(["KJV","BSB"])`. Task #58 (2026-07-24) widened it per design-delta §2.11 /
§9-Q10: a scene's `translation` holds WHATEVER YouVersion-licensed abbreviation was
selected, validated against the live collection at GENERATION time — KJV/BSB are only
the pre-selected default, never a type-level restriction (see auto-memory
[[kjv-bsb-generation-only]]).

**Why:** the stale enum did NOT break `commitVersion` (no client-side schema gate on
the outgoing body; the API validates against the already-broadened db-lib schema). It
broke the NEXT READ: `fetchManifest` (`lib/studio/studio-data.ts`) re-validates the
just-committed manifest with `ManifestResponseSchema.safeParse` (built from
`ManifestSceneSchema` → `TranslationSchema`); a non-KJV/BSB translation → `{ok:false,
reason:"manifest_invalid"}` → `StudioLoader` renders `studio-load-error`, permanently
blocking re-hydration of any project whose manifest carried a licensed non-KJV/BSB
translation.

**Reverses** the deliberate task-57 scoping call ("NOT broadening the nextjs
`TranslationSchema` … ripples to publish specs" — see [[studio-ai-wiring-followups]]).
That feared ripple was a non-issue: KJV/BSB fixtures in `storyboard.test.ts` /
`reducer.test.ts` / publish specs stay valid under the widened superset (no edits
needed). `Translation` is now just `string`, so the old `as Translation` cast in
`serializeManifest` was dropped (and its `Translation` import removed).

**Trade-offs:** the read boundary no longer type-narrows translation — correct, since
the authoritative validation is the live YouVersion collection at generation time, not
a hardcoded client enum (Bible ids/abbreviations are never hardcoded, §9-Q10).

Already-correct free-string comparables in the same file that this now matches:
`GeneratedScriptSchema.translation`, `StoryboardSceneSchema.translation`.
