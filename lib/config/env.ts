import { z } from "zod";

import { redactSecrets } from "../logging/redact";

/**
 * Task 43 — supagloo-nextjs's boot environment matrix. The SINGLE authored home of every
 * `process.env` read the app requires to start.
 *
 * ── Why this repo's matrix is shaped differently from api's and dbos's ──────────────
 *
 * plan row 43 says "all three services validate `SECRETS_ENCRYPTION_KEY` length/presence".
 * That sentence is stale for THIS repo (Step-5 finding S4). nextjs has no database and no
 * S3 access, holds no business logic (design-delta §5.1:719-727), and never calls
 * `encryptSecret`/`decryptSecret` — a grep across `app/` + `lib/` finds zero reads of the
 * variable. Implementing the sentence literally would hand the application secrets key to
 * the one process the design says must never hold it, i.e. it would be a security
 * REGRESSION dressed as hardening.
 *
 * So the nextjs check is the INVERSION: `SECRETS_ENCRYPTION_KEY` must be **absent**, and a
 * present one — even a perfectly valid 64-hex key — is a boot refusal. The api↔dbos
 * "same key within an environment, distinct across environments" half of the row is a
 * Compose-level property and lives in the root repo's PART V invariants.
 *
 * ── The tiers ───────────────────────────────────────────────────────────────────────
 *
 *  - REQUIRED, no default: `YV_APP_KEY` only.
 *  - OPTIONAL with a documented fallback: `SUPAGLOO_API_URL` (`lib/api/config.ts` defaults
 *    it), `SUPAGLOO_ENABLE_TEST_SEED` (value-domain checked, still optional), `NODE_ENV`.
 *  - FORBIDDEN: `SECRETS_ENCRYPTION_KEY`.
 *  - DELIBERATELY ABSENT: every `NEXT_PUBLIC_*` var, and every `GLOO_*` var.
 *
 * `NEXT_PUBLIC_*` is baked at BUILD time and `app/providers.tsx:20-23` deliberately uses
 * `||` so an empty build-time `NEXT_PUBLIC_YV_AUTH_REDIRECT_URL` falls back to the runtime
 * origin. A boot validator cannot meaningfully validate one, and asserting on it would
 * break that intentional fallback.
 *
 * `GLOO_CLIENT_ID` / `GLOO_CLIENT_SECRET` / `GLOO_STAGEHAND_MODEL` configure STAGEHAND's
 * own LLM, and `GLOO_CONNECT_*` are the app-under-test's e2e credentials (design-delta
 * §10.8:1897-1899, `lib/gloo/harness-creds.ts`'s header). Neither set is an app boot var.
 * Requiring them would also take the MOCK e2e lane down, which must stay runnable with no
 * Compose stack, no root `.env` and no secrets at all (design-delta §11.8:2439-2441).
 *
 * Per-user provider credentials are database rows, never env (current-design §3:373-374),
 * so this validator never couples to a user's connection state.
 */

type EnvSource = Record<string, string | undefined>;

/** Where a developer sets these. Named in every message, per design-delta §11.3:2034-2042
 *  ("names the var *and* the root `.env` path"). */
export const NEXTJS_ENV_FILE = ".env.local";

/** Required at boot, no default. */
export const REQUIRED_SERVER_ENV_VARS = ["YV_APP_KEY"] as const;

/** Optional; each has a documented fallback and must STAY optional (brief §2.2 #7). */
export const OPTIONAL_SERVER_ENV_VARS = [
  "SUPAGLOO_API_URL",
  "SUPAGLOO_ENABLE_TEST_SEED",
  "NODE_ENV",
] as const;

/**
 * Must NEVER be present in a supagloo-nextjs process.
 *
 * Exactly ONE entry, and the shortness is deliberate. `tests/e2e/global-setup.render.ts`
 * imports `./load-root-env` for its side effect, so the ROOT repo's untracked `.env` is
 * loaded into the globalSetup process — which then spawns `next dev` with
 * `env: process.env`. That file carries `GITHUB_APP_PRIVATE_KEY`,
 * `GITHUB_APP_CLIENT_SECRET`, `GITHUB_E2E_PAT_TOKEN`, `GLOO_CLIENT_SECRET` and
 * `OPENROUTER_E2E_TEST_API_KEY`; forbidding any of those would make the RENDER LANE refuse
 * to boot. It does not carry `SECRETS_ENCRYPTION_KEY` (verified by name census, no value
 * read), which is why this one entry is safe today and still fails closed the moment the
 * variable arrives from anywhere.
 */
export const FORBIDDEN_ENV_VARS = ["SECRETS_ENCRYPTION_KEY"] as const;

const HTTP_URL = /^https?:\/\/.+/;

/**
 * Hand-authored, one per variable. The thrown error is assembled from THESE, never from
 * Zod's own issue text: a Zod message can echo the received value, and the forbidden-key
 * check is precisely the place where this validator holds secret material at throw time.
 */
const MESSAGES: Record<string, string> = {
  YV_APP_KEY:
    `YV_APP_KEY is missing or empty. It is the YouVersion Platform app key, read ` +
    `SERVER-side (it is deliberately not a NEXT_PUBLIC_* var) and handed to ` +
    `<YouVersionProvider>. Set it in ${NEXTJS_ENV_FILE} (see .env.example), or supply it ` +
    `to the container as a RUNTIME env — docker-compose's nextjs service takes ` +
    `YV_APP_KEY: \${YOUVERSION_APP_KEY}.`,
  SECRETS_ENCRYPTION_KEY:
    `SECRETS_ENCRYPTION_KEY is set, and supagloo-nextjs must NEVER hold it. This process ` +
    `has no database and no S3 access and never encrypts or decrypts a per-user provider ` +
    `secret; the key belongs to supagloo-nodejs-api and supagloo-nodejs-dbos only. ` +
    `Remove it from ${NEXTJS_ENV_FILE} and from the nextjs service's compose environment.`,
  SUPAGLOO_API_URL:
    `SUPAGLOO_API_URL must be an http:// or https:// base URL for supagloo-nodejs-api ` +
    `(e.g. http://localhost:4000 on the host, http://api:4000 inside the compose ` +
    `network). Unset it in ${NEXTJS_ENV_FILE} to take the built-in default instead.`,
  SUPAGLOO_ENABLE_TEST_SEED:
    `SUPAGLOO_ENABLE_TEST_SEED must be exactly "1" or "0" (or be unset). The BFF's seed ` +
    `gate compares it against the literal "1", so any other truthy-looking spelling ` +
    `silently disables POST /api/test/seed while appearing to enable it. Fix it in ` +
    `${NEXTJS_ENV_FILE}.`,
};

const nextjsEnvSchema = z.object({
  YV_APP_KEY: z.string().refine((value) => value.trim().length > 0, {
    message: MESSAGES.YV_APP_KEY,
  }),

  SUPAGLOO_API_URL: z
    .string()
    .refine((value) => HTTP_URL.test(value), { message: MESSAGES.SUPAGLOO_API_URL })
    .optional(),

  SUPAGLOO_ENABLE_TEST_SEED: z
    .string()
    .refine((value) => value === "0" || value === "1", {
      message: MESSAGES.SUPAGLOO_ENABLE_TEST_SEED,
    })
    .optional(),

  NODE_ENV: z.string().optional(),

  // The S4 inversion. `z.unknown()` accepts `undefined`, so the refinement is the whole
  // check: present ⇒ refuse to boot.
  SECRETS_ENCRYPTION_KEY: z.unknown().refine((value) => value === undefined, {
    message: MESSAGES.SECRETS_ENCRYPTION_KEY,
  }),
});

/** Every variable name this matrix knows about. Used by the unit matrix to assert what is
 *  deliberately NOT here (no `NEXT_PUBLIC_*`, no `GLOO_*`, no per-user provider vars). */
export function envSchemaKeys(): readonly string[] {
  return Object.keys(nextjsEnvSchema.shape);
}

export interface NextjsServerEnv {
  YV_APP_KEY: string;
  SUPAGLOO_API_URL?: string;
  SUPAGLOO_ENABLE_TEST_SEED?: string;
  NODE_ENV?: string;
}

/**
 * Parse and validate the server environment, throwing ONE actionable error that lists
 * every problem and names every variable. Accepts an injected source for testing;
 * defaults to `process.env`.
 *
 * An EMPTY string counts as UNSET for every tier. That is not a nicety: `docker compose`'s
 * `${VAR:-}` substitution and the Dockerfile's `ENV YV_APP_KEY=$YV_APP_KEY` with no
 * `--build-arg` both yield `""`, and today's `app/layout.tsx` guard (`if (!appKey)`)
 * already has exactly this semantics — which is the observable behaviour
 * `tests/e2e/global-setup.ts` documents.
 */
export function loadNextjsServerEnv(
  source: EnvSource = process.env,
): NextjsServerEnv {
  const normalized: Record<string, string | undefined> = {};
  for (const key of envSchemaKeys()) {
    const raw = source[key];
    normalized[key] = raw === undefined || raw.length === 0 ? undefined : raw;
  }

  const result = nextjsEnvSchema.safeParse(normalized);
  if (!result.success) {
    const seen = new Set<string>();
    const details: string[] = [];
    for (const issue of result.error.issues) {
      const name = String(issue.path[0] ?? "(root)");
      if (seen.has(name)) continue;
      seen.add(name);
      details.push(MESSAGES[name] ?? `${name}: invalid value`);
    }
    // Belt and braces: the assembled string is built only from the hand-authored
    // messages above, but it still goes through redaction before it can reach a log.
    throw new Error(
      redactSecrets(
        `Invalid supagloo-nextjs environment configuration — ${details.join(" ")}`,
        source,
      ),
    );
  }

  return {
    YV_APP_KEY: result.data.YV_APP_KEY.trim(),
    SUPAGLOO_API_URL: result.data.SUPAGLOO_API_URL,
    SUPAGLOO_ENABLE_TEST_SEED: result.data.SUPAGLOO_ENABLE_TEST_SEED,
    NODE_ENV: result.data.NODE_ENV,
  };
}
