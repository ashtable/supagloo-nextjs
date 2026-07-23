import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// RED until `lib/gloo/harness-creds.ts` ships. This is task 34-E2's only test
// surface (the task has no e2e of its own). It pins the Gloo naming-collision fix
// (design-delta §10.8): supagloo-nextjs hosts TWO disjoint sets of Gloo creds —
//   * Stagehand's OWN LLM (the harness AI) reads GLOO_CLIENT_ID/GLOO_CLIENT_SECRET/
//     GLOO_STAGEHAND_MODEL (see lib/gloo/llm-client.ts), and
//   * the app-under-test's Gloo CONNECT flow reads the DISTINCT GLOO_CONNECT_* vars.
// The two must never cross-contaminate, and .env.example must document both.
import {
  APP_UNDER_TEST_GLOO_ENV_VARS,
  STAGEHAND_LLM_ENV_VARS,
  resolveAppUnderTestGlooCreds,
  resolveStagehandLlmCreds,
} from "../../lib/gloo/harness-creds";

describe("resolveStagehandLlmCreds (Stagehand's own LLM — GLOO_CLIENT_* / GLOO_STAGEHAND_MODEL)", () => {
  it("A1: reads clientId/clientSecret/model from GLOO_CLIENT_ID/GLOO_CLIENT_SECRET/GLOO_STAGEHAND_MODEL", () => {
    const creds = resolveStagehandLlmCreds({
      GLOO_CLIENT_ID: "stagehand-id",
      GLOO_CLIENT_SECRET: "stagehand-secret",
      GLOO_STAGEHAND_MODEL: "gloo-openai-gpt-5-mini",
    });
    expect(creds).toEqual({
      clientId: "stagehand-id",
      clientSecret: "stagehand-secret",
      model: "gloo-openai-gpt-5-mini",
    });
  });

  it("A2: throws an actionable error naming GLOO_CLIENT_ID when it is missing", () => {
    expect(() =>
      resolveStagehandLlmCreds({
        GLOO_CLIENT_SECRET: "x",
        GLOO_STAGEHAND_MODEL: "m",
      }),
    ).toThrow(/GLOO_CLIENT_ID/);
  });

  it("A3: does NOT pick up the app-under-test GLOO_CONNECT_* vars", () => {
    // Only the app-under-test side is set → the Stagehand resolver must still fail,
    // proving it reads a disjoint set of names.
    expect(() =>
      resolveStagehandLlmCreds({
        GLOO_CONNECT_CLIENT_ID: "app-id",
        GLOO_CONNECT_CLIENT_SECRET: "app-secret",
      }),
    ).toThrow(/GLOO_CLIENT_ID/);
  });
});

describe("resolveAppUnderTestGlooCreds (app-under-test connect flow — GLOO_CONNECT_*)", () => {
  it("B1: reads clientId/clientSecret from GLOO_CONNECT_CLIENT_ID/GLOO_CONNECT_CLIENT_SECRET", () => {
    const creds = resolveAppUnderTestGlooCreds({
      GLOO_CONNECT_CLIENT_ID: "app-id",
      GLOO_CONNECT_CLIENT_SECRET: "app-secret",
    });
    expect(creds).toEqual({ clientId: "app-id", clientSecret: "app-secret" });
  });

  it("B2: throws an actionable error naming GLOO_CONNECT_CLIENT_ID when it is missing", () => {
    expect(() =>
      resolveAppUnderTestGlooCreds({ GLOO_CONNECT_CLIENT_SECRET: "x" }),
    ).toThrow(/GLOO_CONNECT_CLIENT_ID/);
  });

  it("B3: does NOT pick up Stagehand's GLOO_CLIENT_* vars", () => {
    // Only Stagehand's own vars are set → the app-under-test resolver must still fail.
    expect(() =>
      resolveAppUnderTestGlooCreds({
        GLOO_CLIENT_ID: "stagehand-id",
        GLOO_CLIENT_SECRET: "stagehand-secret",
        GLOO_STAGEHAND_MODEL: "m",
      }),
    ).toThrow(/GLOO_CONNECT_CLIENT_ID/);
  });
});

describe("collision regression (design-delta §10.8): the two credential sets never cross-contaminate", () => {
  it("C1: with all five vars set to different values, each resolver reads only its own", () => {
    const env = {
      GLOO_CLIENT_ID: "stagehand-id",
      GLOO_CLIENT_SECRET: "stagehand-secret",
      GLOO_STAGEHAND_MODEL: "gloo-openai-gpt-5-mini",
      GLOO_CONNECT_CLIENT_ID: "app-under-test-id",
      GLOO_CONNECT_CLIENT_SECRET: "app-under-test-secret",
    };
    const stagehand = resolveStagehandLlmCreds(env);
    const appUnderTest = resolveAppUnderTestGlooCreds(env);

    expect(stagehand.clientId).toBe("stagehand-id");
    expect(stagehand.clientSecret).toBe("stagehand-secret");
    expect(appUnderTest.clientId).toBe("app-under-test-id");
    expect(appUnderTest.clientSecret).toBe("app-under-test-secret");

    // The whole point of the fix: the app-under-test creds are NOT Stagehand's creds.
    expect(appUnderTest.clientId).not.toBe(stagehand.clientId);
    expect(appUnderTest.clientSecret).not.toBe(stagehand.clientSecret);
  });

  it("C2: the two env-var-name constant sets are disjoint", () => {
    const overlap = STAGEHAND_LLM_ENV_VARS.filter((name) =>
      (APP_UNDER_TEST_GLOO_ENV_VARS as readonly string[]).includes(name),
    );
    expect(overlap).toEqual([]);
  });
});

describe(".env.example consistency: documents every var the nextjs e2e harness requires", () => {
  const requiredVars = [
    ...STAGEHAND_LLM_ENV_VARS,
    ...APP_UNDER_TEST_GLOO_ENV_VARS,
  ];
  // cwd is the repo root under vitest — same anchor tests/e2e/load-env.ts uses for
  // .env.local. This closes the loop: the resolvers' var names ARE the documented set.
  const envExample = readFileSync(
    resolve(process.cwd(), ".env.example"),
    "utf8",
  );

  for (const name of requiredVars) {
    it(`documents ${name}`, () => {
      expect(envExample).toMatch(new RegExp(`^${name}=`, "m"));
    });
  }
});
