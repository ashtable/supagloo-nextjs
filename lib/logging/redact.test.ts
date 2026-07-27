import { describe, expect, it } from "vitest";

import {
  MIN_REDACTABLE_VALUE_LENGTH,
  isSecretEnvName,
  redactSecrets,
  serializeErrorForLog,
} from "./redact";

/**
 * Task 43 — "redaction so secrets are never logged", nextjs half.
 *
 * The technique is the one design-delta §11.8:2460-2472 pins for the git wrapper: feed a
 * token-shaped SENTINEL through every serialization path and assert the sentinel is
 * absent from the output. It is deliberately a substring assertion, not a shape
 * assertion — a partial mask that leaves the tail readable still fails.
 *
 * nextjs has no logger framework to hang a `redact` config off (the api uses pino's
 * `redact` paths), so redaction here is a pure function the two serialization paths call.
 */

/** Token-shaped, well over MIN_REDACTABLE_VALUE_LENGTH, and unmistakable in output. */
const SENTINEL = "SUPAGLOO-SENTINEL-0123456789abcdef";
const SENTINEL_B = "SUPAGLOO-SENTINEL-fedcba9876543210";

describe("isSecretEnvName", () => {
  it("classifies the secret-carrying names this repo and the root .env actually use", () => {
    for (const name of [
      "SECRETS_ENCRYPTION_KEY",
      "GLOO_CLIENT_SECRET",
      "GLOO_CONNECT_CLIENT_SECRET",
      "GITHUB_APP_PRIVATE_KEY",
      "GITHUB_APP_CLIENT_SECRET",
      "GITHUB_E2E_PAT_TOKEN",
      "GITHUB_E2E_EXCHANGE_TOKEN",
      "OPENROUTER_E2E_TEST_API_KEY",
      "YV_APP_KEY",
      "YOUVERSION_APP_KEY",
      "POSTGRES_PASSWORD",
      "S3_SECRET_ACCESS_KEY",
    ]) {
      expect(isSecretEnvName(name), `${name} should be treated as secret`).toBe(true);
    }
  });

  it("does not classify plain configuration as secret", () => {
    for (const name of [
      "NODE_ENV",
      "SUPAGLOO_API_URL",
      "SUPAGLOO_ENABLE_TEST_SEED",
      "GLOO_STAGEHAND_MODEL",
      "SUPAGLOO_AI_MODEL_SCRIPT",
      "GITHUB_APP_SLUG",
      "GITHUB_APP_ID",
    ]) {
      expect(isSecretEnvName(name), `${name} should NOT be treated as secret`).toBe(
        false,
      );
    }
  });

  it("never classifies a NEXT_PUBLIC_* name as secret", () => {
    // They are in the client bundle by construction, and redacting them would mangle
    // every URL in a message.
    expect(isSecretEnvName("NEXT_PUBLIC_YV_AUTH_REDIRECT_URL")).toBe(false);
    expect(isSecretEnvName("NEXT_PUBLIC_SUPAGLOO_DEMO")).toBe(false);
    expect(isSecretEnvName("NEXT_PUBLIC_OPENROUTER_API_KEY")).toBe(false);
  });
});

describe("redactSecrets — env-value needles", () => {
  it("removes the value of every secret-named var in the env", () => {
    const out = redactSecrets(`boot failed while using ${SENTINEL} and ${SENTINEL_B}`, {
      GLOO_CLIENT_SECRET: SENTINEL,
      GITHUB_E2E_PAT_TOKEN: SENTINEL_B,
    });
    expect(out).not.toContain(SENTINEL);
    expect(out).not.toContain(SENTINEL_B);
  });

  it("leaves a non-secret var's value intact (a model id is not key material)", () => {
    const out = redactSecrets("model resolved -> gloo-openai-gpt-5-mini", {
      GLOO_STAGEHAND_MODEL: "gloo-openai-gpt-5-mini",
    });
    expect(out).toContain("gloo-openai-gpt-5-mini");
  });

  it("never uses a NEXT_PUBLIC_* value as a needle", () => {
    const out = redactSecrets("redirect http://localhost:3000/x", {
      NEXT_PUBLIC_YV_AUTH_REDIRECT_URL: "http://localhost:3000",
    });
    expect(out).toContain("http://localhost:3000");
  });

  it("ignores values shorter than the minimum needle length", () => {
    // Otherwise SUPAGLOO_ENABLE_TEST_SEED=1 would blank every "1" in a message.
    expect(MIN_REDACTABLE_VALUE_LENGTH).toBeGreaterThanOrEqual(8);
    const short = "1";
    const out = redactSecrets("attempt 1 of 3", { SOME_TOKEN: short });
    expect(out).toBe("attempt 1 of 3");
  });

  it("redacts every occurrence, not just the first", () => {
    const out = redactSecrets(`${SENTINEL} then ${SENTINEL}`, {
      A_SECRET: SENTINEL,
    });
    expect(out).not.toContain(SENTINEL);
  });
});

describe("redactSecrets — shape needles that need no env at all", () => {
  it("strips credentials from a postgres DSN but keeps the host", () => {
    const out = redactSecrets(`connect postgres://supagloo:${SENTINEL}@db:5432/app`, {});
    expect(out).not.toContain(SENTINEL);
    expect(out).toContain("db:5432");
  });

  it("strips the token from an x-access-token clone URL", () => {
    const out = redactSecrets(
      `git clone https://x-access-token:${SENTINEL}@github.com/o/r.git`,
      {},
    );
    expect(out).not.toContain(SENTINEL);
    expect(out).toContain("github.com/o/r.git");
  });

  it("strips a Bearer token in either case", () => {
    expect(redactSecrets(`Authorization: Bearer ${SENTINEL}`, {})).not.toContain(
      SENTINEL,
    );
    expect(redactSecrets(`authorization: bearer ${SENTINEL}`, {})).not.toContain(
      SENTINEL,
    );
  });
});

describe("serializeErrorForLog", () => {
  it("redacts the message", () => {
    const line = serializeErrorForLog(new Error(`boom ${SENTINEL}`), {
      A_SECRET: SENTINEL,
    });
    expect(line).not.toContain(SENTINEL);
    expect(line).toContain("boom");
  });

  it("redacts the stack too", () => {
    const err = new Error("boom");
    err.stack = `Error: boom\n    at doThing (${SENTINEL})`;
    const line = serializeErrorForLog(err, { A_SECRET: SENTINEL });
    expect(line).not.toContain(SENTINEL);
  });

  it("redacts a nested cause", () => {
    const line = serializeErrorForLog(
      new Error("outer", { cause: new Error(`inner ${SENTINEL}`) }),
      { A_SECRET: SENTINEL },
    );
    expect(line).not.toContain(SENTINEL);
    expect(line).toContain("inner");
  });

  it("emits ONE line — a boot failure is grep-scraped from a container log tail", () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n    at a\n    at b";
    const line = serializeErrorForLog(err, {});
    expect(line).not.toContain("\n");
  });

  it("serializes a non-Error throw without itself throwing, and redacts it", () => {
    expect(() => serializeErrorForLog(undefined, {})).not.toThrow();
    expect(serializeErrorForLog({ token: SENTINEL }, { A_SECRET: SENTINEL })).not.toContain(
      SENTINEL,
    );
    expect(serializeErrorForLog(`raw ${SENTINEL}`, { A_SECRET: SENTINEL })).not.toContain(
      SENTINEL,
    );
  });
});
