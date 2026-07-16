---
name: remotion-integration
description: Remotion 4.0.490 + @remotion/player verified working under Next 16.2.10 + Turbopack + React 19; Player DOM shape (no canvas)
metadata:
  type: reference
---

Verified first-hand via a throwaway spike (2026-07-16, then reverted) for the Turn 5 / Fig 5a
studio editor (`scratch/turn5-5a-studio.md`).

**Versions:** `remotion@4.0.490` + `@remotion/player@4.0.490` (both `latest`). Peer dep
`react >=16.8.0` / `react-dom >=16.8.0` → satisfied by this repo's React 19.2.4.

**Integration verdict — WORKS, no caveats for in-browser preview:**
- `next build` (Next 16.2.10, **Turbopack** — default builder) compiled + typechecked the Player
  route and **prerendered it `○ Static`**. So a Server-Component `page.tsx` importing a
  `"use client"` Player wrapper does NOT crash SSR and needs **NO webpack/bundler config, no
  `transpilePackages`, no `serverExternalPackages`, no `next/dynamic ssr:false`**. (Bundler/webpack
  is only for server-side *render* — out of scope here.) This confirms the D2 bet.
- Core `remotion` exports used + typecheck clean: `AbsoluteFill`, `Sequence`, `useCurrentFrame`,
  `useVideoConfig`, `interpolate`. `@remotion/player` exports `Player` + `PlayerRef` (type).
- `PlayerRef` API (from docs): `play/pause/toggle/seekTo(frame)/getCurrentFrame()/isPlaying()`,
  `mute/unmute`, `requestFullscreen`. Events via `addEventListener(name, e => …)` /
  `removeEventListener`; `frameupdate` → `e.detail.frame` (every frame); `timeupdate` (~250ms
  throttle) → `e.detail.frame`; `play`/`pause`/`seeked`/`ended`/`error`.
- Player required props: `component` (or `lazyComponent`), `durationInFrames`, `fps`,
  `compositionWidth`, `compositionHeight`. Useful: `inputProps` (memoize!), `controls`, `loop`,
  `autoPlay`, `initialFrame`, `style`, `acknowledgeRemotionLicense`, `spaceKeyToPlayOrPause`.

**Player DOM shape (measured, matters for tests):** the Player renders a
**`<div class="__remotion-player">`** containing the composition as **plain DOM `<div>`s** plus
**5 `<audio>` shared-audio tags** (default `numberOfSharedAudioTags`). There is **NO `<canvas>` and
NO `<video>`** for a DOM composition. So E2E must assert **`.__remotion-player` present**, not a
canvas. Composition text (e.g. the scripture caption) IS real, queryable DOM — but only for the
scene at the current frame, so seek/select that scene before asserting its caption.

**Perf note:** `frameupdate` fires 30×/s → keep the current-frame in LOCAL state in the player
panel (drives transport + scene chip only), NOT in the global editor reducer, to avoid re-render
storms. Keep the frame OUT of the Player's `inputProps` (composition only needs storyboard+aspect).

**Licensing:** Remotion is source-available; **free for individuals & teams ≤3, paid company
license above that** — applies to `@remotion/player` too. Flag before shipping.
