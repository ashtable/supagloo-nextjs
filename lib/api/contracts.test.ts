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
  GithubConnectionStatusSchema,
  GithubInstallUrlResponseSchema,
  ConnectionsResponseSchema,
  GithubRepoListResponseSchema,
  OpenRouterConnectionStatusSchema,
  OpenRouterConnectionResponseSchema,
  OpenRouterCreditsResponseSchema,
  GlooConnectionStatusSchema,
  GlooConnectionResponseSchema,
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

// ── Task #24: GitHub App connect wire DTOs (mirror db-lib schemas.ts:372-446,552) ──

const validGithubStatus = {
  githubLogin: "acme",
  installationId: "42",
  repositorySelection: "selected",
  status: "active",
  connectedAt: "2026-07-20T00:00:00.000Z",
};

describe("GitHub connect contracts", () => {
  it("GithubConnectionStatusSchema parses a full status and rejects a missing field", () => {
    expect(GithubConnectionStatusSchema.parse(validGithubStatus).githubLogin).toBe("acme");
    const { githubLogin: _omit, ...missing } = validGithubStatus;
    void _omit;
    expect(GithubConnectionStatusSchema.safeParse(missing).success).toBe(false);
  });

  it("GithubInstallUrlResponseSchema parses { url }", () => {
    expect(
      GithubInstallUrlResponseSchema.parse({
        url: "https://github.com/apps/supagloo-app/installations/new",
      }).url,
    ).toContain("installations/new");
  });

  it("ConnectionsResponseSchema parses github present OR null (the merged status)", () => {
    const present = ConnectionsResponseSchema.parse({
      github: validGithubStatus,
      openrouter: null,
      gloo: null,
    });
    expect(present.github?.githubLogin).toBe("acme");

    const absent = ConnectionsResponseSchema.parse({
      github: null,
      openrouter: null,
      gloo: null,
    });
    expect(absent.github).toBeNull();
  });

  it("GithubRepoListResponseSchema parses { repositories: [...] }", () => {
    const parsed = GithubRepoListResponseSchema.parse({
      repositories: [
        {
          id: 101,
          name: "empty-one",
          fullName: "acme/empty-one",
          owner: "acme",
          private: true,
          defaultBranch: "main",
          empty: true,
        },
      ],
    });
    expect(parsed.repositories).toHaveLength(1);
    expect(parsed.repositories[0].fullName).toBe("acme/empty-one");
  });
});

// ── Task #25: OpenRouter + Gloo connect wire DTOs (mirror db-lib schemas.ts:468-560) ──

const validOpenRouterStatus = {
  keyLast4: "cafe",
  status: "active",
  connectedAt: "2026-07-20T00:00:00.000Z",
};

const validGlooStatus = {
  clientId: "gloo-cid",
  status: "active",
  connectedAt: "2026-07-20T00:00:00.000Z",
  lastVerifiedAt: "2026-07-20T00:00:00.000Z",
};

describe("OpenRouter + Gloo connect contracts", () => {
  it("OpenRouterConnectionStatusSchema parses { keyLast4, status, connectedAt } (never the key)", () => {
    expect(OpenRouterConnectionStatusSchema.parse(validOpenRouterStatus).keyLast4).toBe("cafe");
    const { keyLast4: _omit, ...missing } = validOpenRouterStatus;
    void _omit;
    expect(OpenRouterConnectionStatusSchema.safeParse(missing).success).toBe(false);
  });

  it("OpenRouterConnectionResponseSchema parses { connection }", () => {
    expect(
      OpenRouterConnectionResponseSchema.parse({ connection: validOpenRouterStatus }).connection.keyLast4,
    ).toBe("cafe");
  });

  it("OpenRouterCreditsResponseSchema parses { totalCredits, totalUsage, remaining }", () => {
    const parsed = OpenRouterCreditsResponseSchema.parse({
      totalCredits: 100,
      totalUsage: 12.5,
      remaining: 87.5,
    });
    expect(parsed.remaining).toBe(87.5);
  });

  it("GlooConnectionStatusSchema parses { clientId, status, connectedAt, lastVerifiedAt } (never the secret)", () => {
    expect(GlooConnectionStatusSchema.parse(validGlooStatus).clientId).toBe("gloo-cid");
    const { lastVerifiedAt: _omit, ...missing } = validGlooStatus;
    void _omit;
    expect(GlooConnectionStatusSchema.safeParse(missing).success).toBe(false);
  });

  it("GlooConnectionResponseSchema parses { connection }", () => {
    expect(GlooConnectionResponseSchema.parse({ connection: validGlooStatus }).connection.clientId).toBe(
      "gloo-cid",
    );
  });

  it("ConnectionsResponseSchema now fully types openrouter + gloo (present OR null)", () => {
    const present = ConnectionsResponseSchema.parse({
      github: null,
      openrouter: validOpenRouterStatus,
      gloo: validGlooStatus,
    });
    expect(present.openrouter?.keyLast4).toBe("cafe");
    expect(present.gloo?.clientId).toBe("gloo-cid");

    const absent = ConnectionsResponseSchema.parse({
      github: null,
      openrouter: null,
      gloo: null,
    });
    expect(absent.openrouter).toBeNull();
    expect(absent.gloo).toBeNull();
  });
});
