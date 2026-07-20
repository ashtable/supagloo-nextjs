import { describe, expect, it } from "vitest";

// RED until `./seed` ships. The BFF seed passthrough maps a scenario name to a
// deterministic `TestSeedRequest` for the API. The scenario→identity mapping is
// pure and unit-tested; the fresh random session token is injected so the shape is
// deterministic under test.
import { seedUserForScenario, buildTestSeedRequest } from "./seed";
import { TestSeedRequestSchema } from "./contracts";

describe("seedUserForScenario", () => {
  it("authed-fresh is NOT onboarded (the wizard territory the e2e drives)", () => {
    const u = seedUserForScenario("authed-fresh");
    expect(u.onboardingCompleted).toBe(false);
    expect(u.youversionUserId.length).toBeGreaterThan(0);
    expect(u.displayName.length).toBeGreaterThan(0);
    expect(u.email).toContain("@");
    expect(u.avatarInitials.length).toBeGreaterThan(0);
  });

  it("authed-returning and authed-unlinked are already onboarded", () => {
    expect(seedUserForScenario("authed-returning").onboardingCompleted).toBe(true);
    expect(seedUserForScenario("authed-unlinked").onboardingCompleted).toBe(true);
  });

  it("gives each scenario a distinct, stable youversionUserId", () => {
    const ids = (["authed-fresh", "authed-returning", "authed-unlinked"] as const).map(
      (s) => seedUserForScenario(s).youversionUserId,
    );
    expect(new Set(ids).size).toBe(3);
    // stable across calls
    expect(seedUserForScenario("authed-fresh").youversionUserId).toBe(ids[0]);
  });

  it("throws on an unknown scenario", () => {
    // @ts-expect-error — exercising the runtime guard on a bad scenario
    expect(() => seedUserForScenario("nope")).toThrow();
  });
});

describe("buildTestSeedRequest", () => {
  it("wraps one user with the injected session token and matches TestSeedRequestSchema", () => {
    const req = buildTestSeedRequest("authed-fresh", { tokenFactory: () => "fixed-token-xyz" });
    expect(req.users).toHaveLength(1);
    expect(req.users[0].sessionToken).toBe("fixed-token-xyz");
    expect(req.users[0].onboardingCompleted).toBe(false);
    // With no nonce the youversionUserId is the scenario's base identity.
    expect(req.users[0].youversionUserId).toBe(seedUserForScenario("authed-fresh").youversionUserId);
    // The shape must satisfy the API's own request contract.
    expect(TestSeedRequestSchema.safeParse(req).success).toBe(true);
  });

  it("suffixes the youversionUserId with the nonce so an e2e run is repeatable", () => {
    const base = seedUserForScenario("authed-fresh").youversionUserId;
    const req = buildTestSeedRequest("authed-fresh", { nonce: "run42" });
    expect(req.users[0].youversionUserId).toBe(`${base}-run42`);
    expect(TestSeedRequestSchema.safeParse(req).success).toBe(true);
  });
});
