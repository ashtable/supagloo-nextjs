import { describe, expect, it } from "vitest";

// RED until `./contracts` ships. These are the hand-rolled wire Zod shapes that
// mirror supagloo-nodejs-api's verified contracts (the db-lib submodule here
// predates the auth DTOs — see the TDD plan). They guard against drift between the
// BFF's assumptions and the API's actual responses.
import {
  AuthUserSchema,
  YouVersionSignInResponseSchema,
  MeResponseSchema,
  TestSeedResponseSchema,
} from "./contracts";

const validAuthUser = {
  id: "u_1",
  youversionUserId: "yv_1",
  displayName: "Grace Hopper",
  email: "grace@example.com",
  avatarInitials: "GH",
  firstSignInAt: "2026-07-20T00:00:00.000Z",
  onboardingCompletedAt: null,
  lastSeenAt: "2026-07-20T00:00:00.000Z",
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};

describe("AuthUserSchema", () => {
  it("parses a full AuthUser and allows a null onboardingCompletedAt", () => {
    expect(AuthUserSchema.parse(validAuthUser).onboardingCompletedAt).toBeNull();
    expect(
      AuthUserSchema.parse({ ...validAuthUser, onboardingCompletedAt: "2026-07-20T01:00:00.000Z" })
        .onboardingCompletedAt,
    ).toBe("2026-07-20T01:00:00.000Z");
  });

  it("rejects a payload missing a required field", () => {
    const { email: _omit, ...missing } = validAuthUser;
    void _omit;
    expect(AuthUserSchema.safeParse(missing).success).toBe(false);
  });
});

describe("response schemas", () => {
  it("YouVersionSignInResponseSchema parses { token, user, firstSignIn }", () => {
    const parsed = YouVersionSignInResponseSchema.parse({
      token: "raw-opaque",
      user: validAuthUser,
      firstSignIn: true,
    });
    expect(parsed.token).toBe("raw-opaque");
    expect(parsed.firstSignIn).toBe(true);
  });

  it("MeResponseSchema parses { user }", () => {
    expect(MeResponseSchema.parse({ user: validAuthUser }).user.id).toBe("u_1");
  });

  it("TestSeedResponseSchema parses { users: [{ user, token }] }", () => {
    const parsed = TestSeedResponseSchema.parse({
      users: [{ user: validAuthUser, token: "seed-token" }],
    });
    expect(parsed.users[0].token).toBe("seed-token");
  });
});
