import { loadNextjsServerEnv } from "../config/env";
import { YouVersionHttpError, type YouVersionDeps } from "./client";

/**
 * The shared body of the six `app/api/bible/**` route handlers: the app-key read, the
 * session gate, and the upstream→our-status mapping. Pure (no `next/server`), so the
 * route files stay the thin Next.js adapters this repo's BFF convention asks for.
 *
 * ── On the session gate — what it is NOT ───────────────────────────────────────────
 * These routes read PUBLIC Bible metadata using OUR app key. `serveBible` below checks
 * ONE thing: that a `supagloo_session` cookie was PRESENT and NON-EMPTY. That is not an
 * authentication check and it does not bound abuse. Any non-empty value satisfies it, so
 * `curl -H 'Cookie: supagloo_session=x'` reaches these routes from anywhere on the public
 * internet — they ARE an open proxy, and describing the check as a "quota gate" or as
 * "defence in depth" would be an overstatement of something that defends nothing. (Unlike
 * the ~35 other BFF routes, which forward the cookie and let the api decide — see
 * `app/api/me/route.ts`, whose contract is "…or 401 when there is no valid session".)
 *
 * ── The residual, measured (live probe, 2026-07-28) ────────────────────────────────
 * An unauthenticated walk of the live catalogue's **1472** translations calling `/books`
 * for each (**1,590,704 bytes** upstream apiece ⇒ **≈2.34 GB**) spends our app key's
 * quota, and — because the cache key is `books:${bibleId}` and there are 1472 distinct
 * ones against a **256**-entry insertion-order cache (`cache.ts:29`, eviction at
 * `:62-66`) — also EVICTS every entry real users depend on. Both costs are real.
 *
 * ── Why that is accepted here rather than fixed here ───────────────────────────────
 * `YV_APP_KEY` is already in the browser: `app/layout.tsx:103` reads it at RUNTIME and
 * `app/layout.tsx:111` passes it into `<Providers appKey={appKey}>`, a `"use client"`
 * component, so the real key is serialized into the RSC payload of every page. Anyone
 * who wants to spend the quota does not need this proxy. (Do NOT cite the prose at
 * `app/layout.tsx:60-64` for this — it describes the RETIRED build-time bake, in the
 * past tense.)
 *
 * Making the gate real means a per-read round trip to the api to resolve the session —
 * an api-boundary decision about where session resolution lives, not a bolt-on at the
 * end of a UI task. Until that decision is taken, the check stays as it is and is named
 * for exactly what it is: a cheap filter on drive-by traffic, not a control.
 */

export interface BibleResult {
  status: number;
  body: unknown;
}

/**
 * The server-side app key. Same value as the api/dbos `YOUVERSION_APP_KEY`, spelled
 * `YV_APP_KEY` here — see the "ONE VALUE, TWO SPELLINGS" note in the root `.env.example`.
 *
 * It goes through `loadNextjsServerEnv()` rather than reading `process.env` directly,
 * because `lib/config/env.ts` is this repo's SINGLE authored home for the boot env read
 * and `tests/unit/boot-hardening.test.ts` (D43.2) enforces exactly that. The loader
 * throws a message naming the variable and the env file when the key is missing or
 * blank, which is the right failure for a route that cannot work without it — so the
 * catch below converts it into a 503 rather than letting a stack trace out.
 */
export function bibleAppKey(): string {
  try {
    return loadNextjsServerEnv().YV_APP_KEY;
  } catch {
    return "";
  }
}

/**
 * Run one Bible read and shape the answer.
 *
 * Upstream statuses are mapped rather than forwarded, because their meaning is not the
 * caller's meaning: a 401 from YouVersion means OUR key is wrong, which is a 502 from
 * this app's point of view — forwarding it verbatim would tell the browser to re-auth
 * the USER, which would be a lie.
 */
export async function serveBible(
  hasSession: boolean,
  load: (deps: YouVersionDeps) => Promise<unknown>,
): Promise<BibleResult> {
  if (!hasSession) {
    return { status: 401, body: { error: "unauthenticated" } };
  }

  const appKey = bibleAppKey();
  if (!appKey) {
    return { status: 503, body: { error: "bible_unconfigured" } };
  }

  try {
    return { status: 200, body: await load({ appKey }) };
  } catch (err) {
    if (err instanceof YouVersionHttpError) {
      // 404 (no such book/chapter/verse/ref) and 422 (unsupported bible id) are ABOUT
      // the caller's arguments, so they pass through with their own meaning intact.
      if (err.status === 404) return { status: 404, body: { error: "not_found" } };
      if (err.status === 422) return { status: 422, body: { error: "unsupported" } };
      return { status: 502, body: { error: "bible_upstream_failed" } };
    }
    return { status: 502, body: { error: "bible_upstream_failed" } };
  }
}

/** Reject a missing/blank required query param with the same shape the api uses. */
export function requiredParam(
  params: URLSearchParams,
  name: string,
): { value: string } | { error: BibleResult } {
  const value = params.get(name);
  if (!value) {
    return {
      error: { status: 400, body: { error: "missing_param", param: name } },
    };
  }
  return { value };
}
