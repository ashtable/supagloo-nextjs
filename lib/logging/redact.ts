/**
 * Task 43 — "redaction so secrets are never logged", the nextjs half.
 *
 * The api hangs its redaction off pino's `redact` paths + an `err` serializer. nextjs has
 * NO logger framework (design-delta §5.1:719-727 keeps this process free of business
 * logic, and `lib/api/ai-config.ts:65-67` deliberately describes its `console.info` as
 * "the first (and only) `console.*` in the codebase — kept a plain string, no logger
 * abstraction"). So redaction here is a pure function that the serialization paths call,
 * and `tests/unit/boot-hardening.test.ts` fences the set of log sites so a future one is a
 * deliberate decision rather than an accident.
 *
 * Two independent needle families, because either alone leaks:
 *
 *  1. **Env-value needles** — every value held by a SECRET-named variable in the process
 *     env. This is what catches a message that interpolated a credential it never named.
 *  2. **Shape needles** — `scheme://user:pass@host`, `x-access-token:<tok>@github.com`,
 *     `Bearer <tok>`. This is what catches a credential that is NOT in this process's env
 *     at all: the BFF forwards the session cookie's raw token as
 *     `Authorization: Bearer …` (`lib/api/proxy.ts:57`), and an upstream error message can
 *     carry a DSN or a clone URL back across the wire.
 *
 * Deliberately NOT redacted: `NEXT_PUBLIC_*`. Those values are compiled into the client
 * bundle by construction, so masking them protects nothing and would mangle every URL in
 * a message (`NEXT_PUBLIC_YV_AUTH_REDIRECT_URL` is literally `http://localhost:3000`).
 */

type EnvSource = Record<string, string | undefined>;

/** What a masked value becomes. Fixed-width and greppable. */
export const REDACTED = "[redacted]";

/**
 * A value shorter than this is never used as a search needle. Without the floor,
 * `SUPAGLOO_ENABLE_TEST_SEED=1` would blank every `1` in every message, and
 * `NODE_ENV=production` would blank the word "production" — turning redaction into
 * corruption and hiding the diagnostic the log line existed to carry.
 */
export const MIN_REDACTABLE_VALUE_LENGTH = 8;

/** Substrings that mark a variable name as carrying secret MATERIAL. */
const SECRET_NAME_SUBSTRINGS = [
  "SECRET",
  "TOKEN",
  "PASSWORD",
  "PASSWD",
  "CREDENTIAL",
  "PRIVATE_KEY",
  "API_KEY",
  "APIKEY",
];

/** `…_KEY` / `…_PAT` as a whole trailing segment — `YV_APP_KEY`, `GITHUB_E2E_PAT_TOKEN`,
 *  `S3_SECRET_ACCESS_KEY` — without catching `GITHUB_APP_SLUG` or `..._MODEL_SCRIPT`. */
const SECRET_NAME_SEGMENTS = /_(?:KEY|PAT)(?:_|$)/;

/**
 * Does this env var name carry secret material? Name-based, because the value is exactly
 * what we must not inspect or log while deciding.
 */
export function isSecretEnvName(name: string): boolean {
  const upper = name.toUpperCase();
  // Public by construction — see the module header.
  if (upper.startsWith("NEXT_PUBLIC_")) return false;
  if (SECRET_NAME_SUBSTRINGS.some((token) => upper.includes(token))) return true;
  return SECRET_NAME_SEGMENTS.test(upper);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `scheme://user:pass@host` — covers the Postgres DSN and git's
 * `https://x-access-token:<installation token>@github.com/o/r.git` clone URL in one rule.
 * The host is deliberately preserved: which host we failed to reach is the diagnostic.
 */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi;

/** `Bearer <token>` in either case, as the BFF sends it. */
const BEARER = /\b(bearer)\s+([A-Za-z0-9._~+/=-]{8,})/gi;

/**
 * Mask every secret in `text`: the values of all secret-named vars in `env`, then the
 * shape-recognisable credentials. Longest needles first, so a value that contains another
 * value cannot leave a readable tail.
 */
export function redactSecrets(text: string, env: EnvSource = process.env): string {
  let out = text;

  const needles = Object.entries(env)
    .filter(([name, value]) => {
      if (value === undefined) return false;
      if (value.length < MIN_REDACTABLE_VALUE_LENGTH) return false;
      return isSecretEnvName(name);
    })
    .sort((a, b) => (b[1] as string).length - (a[1] as string).length);

  for (const [name, value] of needles) {
    out = out.replace(
      new RegExp(escapeRegExp(value as string), "g"),
      `[redacted:${name}]`,
    );
  }

  out = out.replace(URL_CREDENTIALS, (_m, scheme) => `${scheme}${REDACTED}:${REDACTED}@`);
  out = out.replace(BEARER, (_m, keyword) => `${keyword} ${REDACTED}`);

  return out;
}

/** How deep a `cause` chain we follow. Bounded so a cyclic cause cannot hang a boot log. */
const MAX_CAUSE_DEPTH = 4;

function describe(err: unknown, depth = 0): string {
  if (err instanceof Error) {
    const head = err.stack && err.stack.length > 0 ? err.stack : `${err.name}: ${err.message}`;
    const cause = (err as { cause?: unknown }).cause;
    if (cause !== undefined && cause !== null && depth < MAX_CAUSE_DEPTH) {
      return `${head} <- caused by: ${describe(cause, depth + 1)}`;
    }
    return head;
  }
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

/**
 * Render any thrown value as ONE redacted log line.
 *
 * Single-line on purpose: a boot failure is read out of a container log tail (root's
 * Compose e2e greps `docker compose run --rm nextjs`'s stderr), and a multi-line stack
 * interleaves with every other service's output.
 */
export function serializeErrorForLog(
  err: unknown,
  env: EnvSource = process.env,
): string {
  return redactSecrets(describe(err), env).replace(/\s*\r?\n\s*/g, " | ");
}
