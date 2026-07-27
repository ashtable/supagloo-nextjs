import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_ENV_VARS,
  NEXTJS_ENV_FILE,
  REQUIRED_SERVER_ENV_VARS,
  envSchemaKeys,
  loadNextjsServerEnv,
} from "./env";

/**
 * Task 43 — nextjs's per-service boot env MATRIX (plan row 43's Unit column:
 * "Validator matrices per service"; honour the plural).
 *
 * The row's headline sentence — "all three services validate `SECRETS_ENCRYPTION_KEY`
 * length/presence" — is STALE for this repo (Step-5 finding S4). nextjs has no DB and
 * no S3 access, never calls `encryptSecret`/`decryptSecret` (design-delta §5.1:719-727),
 * and a grep across `app/` + `lib/` finds zero reads of the variable. Implementing the
 * sentence literally would put the application secrets key into the one process the
 * design says must never hold it. **The nextjs check is therefore ABSENCE**, and that
 * inversion is what this file pins.
 *
 * The other three matrices deliberately do NOT appear here: the api's and dbos's live in
 * their own repos, and the api↔dbos "same key within an env, distinct across envs"
 * invariant is a Compose-level property owned by the root repo's PART V invariants.
 */

/** A REAL-shaped 64-hex AES-256-GCM key. Not the all-zeros one — the point of case 5 is
 *  that even a perfectly valid key is a boot refusal here. */
const VALID_LOOKING_KEY =
  "3f9a1c07be42d85af16c0b93e7d25481aa6f30c9d1b74e2568af0139c7b6e4d2";

describe("nextjs boot env matrix — the required tier", () => {
  it("validates clean with nothing but YV_APP_KEY (the mock lane's zero-secret env)", () => {
    // The mock e2e lane runs with no root .env, no Compose stack and no credentials at
    // all (design-delta §11.8:2439-2441). A boot validator that needed anything more
    // would take that lane down, which §11.7:2360 says must stay green.
    const env = loadNextjsServerEnv({ YV_APP_KEY: "yv-app-key-value" });
    expect(env.YV_APP_KEY).toBe("yv-app-key-value");
  });

  it("throws naming YV_APP_KEY and the env file when it is missing", () => {
    let message = "";
    try {
      loadNextjsServerEnv({});
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("YV_APP_KEY");
    expect(message).toContain(NEXTJS_ENV_FILE);
  });

  it("treats an EMPTY YV_APP_KEY as missing", () => {
    // `docker compose` ${VAR:-} substitution and the Dockerfile's `ENV YV_APP_KEY=$ARG`
    // with no --build-arg both yield "". Today's `if (!appKey) throw` already has this
    // semantics; it is the observable behaviour tests/e2e/global-setup.ts documents.
    expect(() => loadNextjsServerEnv({ YV_APP_KEY: "" })).toThrow(/YV_APP_KEY/);
  });

  it("treats a whitespace-only YV_APP_KEY as missing", () => {
    expect(() => loadNextjsServerEnv({ YV_APP_KEY: "   " })).toThrow(/YV_APP_KEY/);
  });

  it("REQUIRED_SERVER_ENV_VARS is exactly YV_APP_KEY", () => {
    expect([...REQUIRED_SERVER_ENV_VARS]).toEqual(["YV_APP_KEY"]);
  });
});

describe("nextjs boot env matrix — the FORBIDDEN tier (S4 inversion)", () => {
  it("refuses a present SECRETS_ENCRYPTION_KEY even when it is a perfectly valid key", () => {
    let message = "";
    try {
      loadNextjsServerEnv({
        YV_APP_KEY: "yv-app-key-value",
        SECRETS_ENCRYPTION_KEY: VALID_LOOKING_KEY,
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("SECRETS_ENCRYPTION_KEY");
    expect(message).toMatch(/never/i);
  });

  it("does not leak the key's value into the error", () => {
    let message = "";
    try {
      loadNextjsServerEnv({
        YV_APP_KEY: "yv-app-key-value",
        SECRETS_ENCRYPTION_KEY: VALID_LOOKING_KEY,
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toContain(VALID_LOOKING_KEY);
  });

  it("accepts an EMPTY SECRETS_ENCRYPTION_KEY (Compose ${VAR:-} yields \"\")", () => {
    expect(() =>
      loadNextjsServerEnv({ YV_APP_KEY: "k", SECRETS_ENCRYPTION_KEY: "" }),
    ).not.toThrow();
  });

  it("FORBIDDEN_ENV_VARS is exactly SECRETS_ENCRYPTION_KEY", () => {
    // Deliberately ONE entry. `tests/e2e/global-setup.render.ts` imports
    // `./load-root-env` for side effect, so the ROOT repo's .env is loaded into the
    // globalSetup process, which then spawns `next dev` with `env: process.env`. That
    // file carries GITHUB_APP_PRIVATE_KEY / GITHUB_APP_CLIENT_SECRET /
    // GITHUB_E2E_PAT_TOKEN / GLOO_CLIENT_SECRET / OPENROUTER_E2E_TEST_API_KEY —
    // forbidding any of those would make the RENDER LANE refuse to boot. It does not
    // carry SECRETS_ENCRYPTION_KEY, which is why this one entry is safe and still fails
    // closed if the variable ever arrives.
    expect([...FORBIDDEN_ENV_VARS]).toEqual(["SECRETS_ENCRYPTION_KEY"]);
  });
});

describe("nextjs boot env matrix — the optional tier stays optional", () => {
  it("accepts an absent SUPAGLOO_API_URL and reports it as undefined", () => {
    const env = loadNextjsServerEnv({ YV_APP_KEY: "k" });
    expect(env.SUPAGLOO_API_URL).toBeUndefined();
  });

  it("treats an EMPTY SUPAGLOO_API_URL as unset so apiBaseUrl()'s default still wins", () => {
    const env = loadNextjsServerEnv({ YV_APP_KEY: "k", SUPAGLOO_API_URL: "" });
    expect(env.SUPAGLOO_API_URL).toBeUndefined();
  });

  it("accepts an http(s) SUPAGLOO_API_URL", () => {
    const env = loadNextjsServerEnv({
      YV_APP_KEY: "k",
      SUPAGLOO_API_URL: "http://api:4000",
    });
    expect(env.SUPAGLOO_API_URL).toBe("http://api:4000");
  });

  it("rejects a non-http SUPAGLOO_API_URL, naming it", () => {
    expect(() =>
      loadNextjsServerEnv({ YV_APP_KEY: "k", SUPAGLOO_API_URL: "api:4000" }),
    ).toThrow(/SUPAGLOO_API_URL/);
  });

  it("accepts SUPAGLOO_ENABLE_TEST_SEED of '1' or '0' or absent", () => {
    expect(() =>
      loadNextjsServerEnv({ YV_APP_KEY: "k", SUPAGLOO_ENABLE_TEST_SEED: "1" }),
    ).not.toThrow();
    expect(() =>
      loadNextjsServerEnv({ YV_APP_KEY: "k", SUPAGLOO_ENABLE_TEST_SEED: "0" }),
    ).not.toThrow();
    expect(() => loadNextjsServerEnv({ YV_APP_KEY: "k" })).not.toThrow();
  });

  it("rejects SUPAGLOO_ENABLE_TEST_SEED='true', which silently disables the seed seam", () => {
    // lib/api/config.ts compares `=== "1"` (design-delta §9-Q9's literal '1'), so
    // `true` is a hard no-op that looks enabled. Fail fast instead.
    expect(() =>
      loadNextjsServerEnv({ YV_APP_KEY: "k", SUPAGLOO_ENABLE_TEST_SEED: "true" }),
    ).toThrow(/SUPAGLOO_ENABLE_TEST_SEED/);
  });
});

describe("nextjs boot env matrix — what it must NOT couple to", () => {
  it("requires no NEXT_PUBLIC_* variable, and none appears in the schema at all", () => {
    // NEXT_PUBLIC_* is baked at BUILD time, and app/providers.tsx:20-23 deliberately
    // uses `||` so an empty build-time NEXT_PUBLIC_YV_AUTH_REDIRECT_URL falls back to
    // the runtime origin. A boot validator cannot meaningfully validate one, and
    // asserting on it would break that intentional fallback (brief §2.2 #5).
    expect(envSchemaKeys().filter((k) => k.startsWith("NEXT_PUBLIC_"))).toEqual([]);
    expect(() => loadNextjsServerEnv({ YV_APP_KEY: "k" })).not.toThrow();
  });

  it("does not require the Stagehand / e2e-harness Gloo credentials", () => {
    // GLOO_CLIENT_ID/SECRET/GLOO_STAGEHAND_MODEL configure STAGEHAND'S OWN LLM, and
    // GLOO_CONNECT_* are the app-under-test's e2e credentials — neither is an app boot
    // var (design-delta §10.8:1897-1899, lib/gloo/harness-creds.ts's header). Treating
    // them as "required provider vars" would be wrong AND would take the mock lane down.
    expect(() => loadNextjsServerEnv({ YV_APP_KEY: "k" })).not.toThrow();
    for (const name of [
      "GLOO_CLIENT_ID",
      "GLOO_CLIENT_SECRET",
      "GLOO_STAGEHAND_MODEL",
      "GLOO_CONNECT_CLIENT_ID",
      "GLOO_CONNECT_CLIENT_SECRET",
    ]) {
      expect(envSchemaKeys()).not.toContain(name);
      expect([...REQUIRED_SERVER_ENV_VARS]).not.toContain(name);
    }
  });

  it("does not couple to a user's provider connection state", () => {
    // current-design §3:373-374 — per-user provider credentials are DATABASE rows, not
    // env. Wireframe 11a draws OpenRouter and Gloo as OPTIONAL with "Skip for now →".
    expect(envSchemaKeys().filter((k) => k.includes("OPENROUTER"))).toEqual([]);
  });
});

describe("nextjs boot env matrix — one error lists every problem", () => {
  it("reports the missing required var AND the forbidden var together", () => {
    let message = "";
    try {
      loadNextjsServerEnv({
        SECRETS_ENCRYPTION_KEY: VALID_LOOKING_KEY,
        SUPAGLOO_API_URL: "not-a-url",
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("YV_APP_KEY");
    expect(message).toContain("SECRETS_ENCRYPTION_KEY");
    expect(message).toContain("SUPAGLOO_API_URL");
  });
});
