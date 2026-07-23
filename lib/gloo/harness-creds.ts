/**
 * Gloo credential resolution for the e2e harness (task 34-E2, design-delta §10.8).
 *
 * supagloo-nextjs hosts TWO distinct sets of Gloo credentials that must never
 * collide:
 *
 *  1. **Stagehand's own LLM** — the test-harness AI that drives the browser. It
 *     reads `GLOO_CLIENT_ID` / `GLOO_CLIENT_SECRET` / `GLOO_STAGEHAND_MODEL` (see
 *     `lib/gloo/llm-client.ts`). This is the harness's brain; it has nothing to do
 *     with the app's per-user Gloo connections.
 *
 *  2. **The app-under-test's Gloo CONNECT flow** — the "Connect Gloo" form
 *     (`app/_components/connect/gloo-credentials-form.tsx`) → `PUT /api/connect/gloo`
 *     → the API's live verify-then-store. A future real-provider e2e spec (task 35 /
 *     34-E8) types REAL Gloo credentials into that form; they come from the
 *     DISTINCT `GLOO_CONNECT_CLIENT_ID` / `GLOO_CONNECT_CLIENT_SECRET` so they never
 *     clobber Stagehand's own LLM creds.
 *
 * In supagloo-nodejs-api / -dbos there is no Stagehand, so the app-under-test's Gloo
 * creds are simply `GLOO_CLIENT_ID` / `GLOO_CLIENT_SECRET`; the `GLOO_CONNECT_`
 * prefix is a nextjs-only disambiguation for the same concept.
 *
 * Pure + injectable (`env` defaults to `process.env`) → zero-mock unit tests, matching
 * the `lib/api/config.ts` precedent. Each resolver fails fast on a missing var with an
 * actionable message that NAMES it — the reusable building block §10.8's fail-fast
 * setup messages reference.
 */

type EnvSource = Record<string, string | undefined>;

/** Env var names Stagehand's own LLM client (`lib/gloo/llm-client.ts`) reads. */
export const STAGEHAND_LLM_ENV_VARS = [
  "GLOO_CLIENT_ID",
  "GLOO_CLIENT_SECRET",
  "GLOO_STAGEHAND_MODEL",
] as const;

/** Env var names the app-under-test's Gloo-connect e2e credentials come from —
 *  deliberately distinct from {@link STAGEHAND_LLM_ENV_VARS} (design-delta §10.8). */
export const APP_UNDER_TEST_GLOO_ENV_VARS = [
  "GLOO_CONNECT_CLIENT_ID",
  "GLOO_CONNECT_CLIENT_SECRET",
] as const;

export interface StagehandLlmCreds {
  clientId: string;
  clientSecret: string;
  model: string;
}

export interface AppUnderTestGlooCreds {
  clientId: string;
  clientSecret: string;
}

function requireVar(env: EnvSource, name: string): string {
  const value = env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `Missing ${name}. The e2e harness requires it — set it in .env.local ` +
        `(documented in .env.example; see design-delta §10.8).`,
    );
  }
  return value;
}

/**
 * Stagehand's own LLM credentials (the test-harness AI). Reads
 * `GLOO_CLIENT_ID` / `GLOO_CLIENT_SECRET` / `GLOO_STAGEHAND_MODEL` — NOT the
 * app-under-test's `GLOO_CONNECT_*` vars.
 */
export function resolveStagehandLlmCreds(
  env: EnvSource = process.env,
): StagehandLlmCreds {
  return {
    clientId: requireVar(env, "GLOO_CLIENT_ID"),
    clientSecret: requireVar(env, "GLOO_CLIENT_SECRET"),
    model: requireVar(env, "GLOO_STAGEHAND_MODEL"),
  };
}

/**
 * The app-under-test's Gloo connect credentials (typed into the "Connect Gloo" form
 * by a real-provider e2e spec). Reads the DISTINCT `GLOO_CONNECT_CLIENT_ID` /
 * `GLOO_CONNECT_CLIENT_SECRET` — NOT Stagehand's `GLOO_CLIENT_*` vars.
 */
export function resolveAppUnderTestGlooCreds(
  env: EnvSource = process.env,
): AppUnderTestGlooCreds {
  return {
    clientId: requireVar(env, "GLOO_CONNECT_CLIENT_ID"),
    clientSecret: requireVar(env, "GLOO_CONNECT_CLIENT_SECRET"),
  };
}
