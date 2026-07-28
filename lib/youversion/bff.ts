import { loadNextjsServerEnv } from "../config/env";
import { YouVersionHttpError, type YouVersionDeps } from "./client";

/**
 * The shared body of the six `app/api/bible/**` route handlers: the app-key read, the
 * session gate, and the upstream→our-status mapping. Pure (no `next/server`), so the
 * route files stay the thin Next.js adapters this repo's BFF convention asks for.
 *
 * ── On the session gate ────────────────────────────────────────────────────────────
 * These routes read PUBLIC Bible metadata using OUR app key. Requiring the session
 * cookie to be PRESENT is not an authorization decision — the BFF cannot validate the
 * cookie without a round trip to the api, and it deliberately does not make one for a
 * metadata read. It is a quota gate: it keeps our app key's budget behind the app's own
 * session surface instead of leaving an open proxy on the public internet.
 *
 * The key itself is already publishable in this app's threat model:
 * `app/layout.tsx:60-64` documents that `YV_APP_KEY` is serialized into the RSC payload
 * on every page because it crosses into a `"use client"` component. So this gate is
 * defence in depth, and is described as exactly that rather than as protection it
 * cannot provide.
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
