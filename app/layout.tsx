import type { Metadata } from "next";
import {
  Anton,
  Barlow,
  Barlow_Semi_Condensed,
  Zilla_Slab,
} from "next/font/google";
import { connection } from "next/server";
import "./globals.css";
import "@youversion/platform-react-ui/styles.css";
import { loadNextjsServerEnv } from "@/lib/config/env";
import Providers from "./providers";

// Non-variable Google fonts require explicit weights (Next 16). Each exposes a
// CSS variable consumed by globals.css / component inline styles.
const anton = Anton({
  weight: ["400"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-anton",
});

const barlow = Barlow({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-barlow",
});

const barlowSemiCondensed = Barlow_Semi_Condensed({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-barlow-semi",
});

const zillaSlab = Zilla_Slab({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-zilla",
});

export const metadata: Metadata = {
  title: "Supagloo",
  description: "Tools for Creators, Built on Gloo AI & YouVersion Platform",
};

/**
 * Task 43 (D43.2) — a RE-READ of the already-validated config, not a second authored env
 * check. `instrumentation.ts` runs the same validator before the server can serve anything
 * (and now exits the process if it fails, see R4344-1), so by the time this runs the
 * environment has already been proven good; this call is what turns `string | undefined`
 * into `string`, which is what retired the non-null assertion this line used to need.
 *
 * ── WHY THE READ IS INSIDE THE COMPONENT, BEHIND `await connection()` (RX-1) ─────────
 *
 * It used to be at MODULE scope, and that made the app key a BUILD-time value. No route in
 * `app/` opts out of static generation, so `next build` prerendered `/`, `/gallery`,
 * `/profile`, `/studio` and `/your-videos` by evaluating this module with the builder
 * stage's env — and because `appKey` crosses into `./providers` (a `"use client"`
 * component) the value was serialized into the RSC payload and the HTML. Measured on the
 * shipped image: 33 files under `/app/.next` contained the compose build arg
 * `build-time-placeholder-not-a-real-key`, and a container started with a REAL
 * `YV_APP_KEY` served `/` as 200 carrying the placeholder and not the real key. YouVersion
 * sign-in was therefore broken on five routes with no signal anywhere in the container's
 * env, logs or `docker inspect`, and no nextjs e2e lane could see it: they all drive
 * `next dev`, where every route is dynamic.
 *
 * `await connection()` (from `next/server`) marks this render as depending on an actual
 * request, so the read cannot happen during `next build` and the RUNTIME env — the compose
 * `environment:` bridge, per D43.3 — is always the source of truth. It is placed
 * IMMEDIATELY before the read on purpose: after it, this component is request-scoped, so
 * there is no window in which a prerender could observe the build-time value.
 *
 * Chosen over `export const dynamic = "force-dynamic"` (user decision D1): both are
 * legitimate fixes, and this one is the narrower statement — "this render needs a request"
 * rather than "nothing in the tree may ever be static".
 *
 * MEASURED, so nobody plans around a wrong premise: with PPR off (this repo's setting) the
 * static-generation cost is the SAME either way. Local `next build`, before → after:
 * `prerender-manifest.json` went from `/ /gallery /profile /studio /your-videos` plus both
 * `connect/<provider>/callback` pages down to `/_global-error` and the icon/metadata routes,
 * and the count of `.next` files containing the placeholder went 33 → 0 (the one remaining
 * grep hit is this comment, inside a sourcemap's `sourcesContent`). The root layout is part
 * of every route's render, so ANY request-scoped read in it de-statics the tree. What this
 * variant keeps is scope: it does not restate route-segment/fetch-caching semantics for the
 * whole tree, and it is the form a future `cacheComponents`/PPR build can still prerender a
 * static shell up to.
 *
 * Also verified: `next build` with `YV_APP_KEY` entirely UNSET now exits 0, because nothing
 * reads the env at build time any more. The compose build arg therefore is not load-bearing;
 * it stays only as a declared, NON-SECRET placeholder (see `Dockerfile`), and no value in a
 * build artifact may be trusted as the app key. The runtime `environment:` bridge is the
 * source of truth (D43.3).
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  const { YV_APP_KEY: appKey } = loadNextjsServerEnv();

  return (
    <html
      lang="en"
      className={`${anton.variable} ${barlow.variable} ${barlowSemiCondensed.variable} ${zillaSlab.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers appKey={appKey}>{children}</Providers>
      </body>
    </html>
  );
}
