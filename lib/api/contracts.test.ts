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
  ProjectJobDtoSchema,
  ProjectJobResponseSchema,
  ProjectDtoSchema,
  ProjectListResponseSchema,
  CreateProjectRequestSchema,
  CreateProjectResponseSchema,
  ImportProjectRequestSchema,
  CreateRepoRequestSchema,
  RepoAuthorizeUrlResponseSchema,
  ProjectResponseSchema,
  ManifestSceneSchema,
  ProjectManifestSchema,
  ManifestResponseSchema,
  CommitVersionRequestSchema,
  CommitVersionResponseSchema,
  ProjectVersionDtoSchema,
  ProjectVersionListResponseSchema,
  PublishVersionRequestSchema,
  PublishVersionResponseSchema,
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

// ── Task #26 project + wizard wire DTOs ──────────────────────────────────────

const validJob = {
  id: "job_1",
  projectId: "prj_1",
  kind: "scaffold",
  status: "running",
  stages: [
    { key: "mintInstallationToken", label: "Authenticating with GitHub", state: "done" },
    { key: "cloneToWorkspace", label: "Cloning repository", state: "running" },
    { key: "writeRemotionScaffold", label: "Scaffolding", state: "pending" },
  ],
  error: null,
  createdAt: "2026-07-21T00:00:00.000Z",
  completedAt: null,
};

const validProject = {
  id: "prj_1",
  slug: "psalm-121",
  name: "Psalm 121",
  repoOwner: "acme",
  repoName: "psalm-121",
  repoVisibility: "private",
  createdFrom: "blank",
  currentBranch: "v0.0.1",
  thumbnailAssetKey: null,
  lastRenderJobId: null,
  lastOpenedAt: "2026-07-21T00:00:00.000Z",
  createdAt: "2026-07-21T00:00:00.000Z",
};

describe("ProjectJobDtoSchema", () => {
  it("parses a running job with typed stages", () => {
    const job = ProjectJobDtoSchema.parse(validJob);
    expect(job.stages).toHaveLength(3);
    expect(job.stages[0].state).toBe("done");
  });

  it("accepts a failed terminal job with error + a failed stage", () => {
    const failed = ProjectJobResponseSchema.parse({
      job: {
        ...validJob,
        kind: "import_verify",
        status: "failed",
        error: "not a supagloo project",
        completedAt: "2026-07-21T00:01:00.000Z",
        stages: [{ key: "verifySupaglooProject", label: "Verifying", state: "failed" }],
      },
    });
    expect(failed.job.status).toBe("failed");
    expect(failed.job.stages[0].state).toBe("failed");
  });

  it("rejects an unknown status or stage state", () => {
    expect(ProjectJobDtoSchema.safeParse({ ...validJob, status: "weird" }).success).toBe(
      false,
    );
    expect(
      ProjectJobDtoSchema.safeParse({
        ...validJob,
        stages: [{ key: "k", label: "L", state: "bogus" }],
      }).success,
    ).toBe(false);
  });
});

describe("ProjectDtoSchema + ProjectListResponseSchema", () => {
  it("parses a project row and a list envelope", () => {
    expect(ProjectDtoSchema.parse(validProject).slug).toBe("psalm-121");
    const list = ProjectListResponseSchema.parse({ projects: [validProject] });
    expect(list.projects).toHaveLength(1);
  });

  it("allows a rendered project with a thumbnail + render job", () => {
    const rendered = ProjectDtoSchema.parse({
      ...validProject,
      thumbnailAssetKey: "projects/prj_1/renders/r1/thumb.jpg",
      lastRenderJobId: "r1",
    });
    expect(rendered.lastRenderJobId).toBe("r1");
  });
});

describe("create/import/create-repo request+response DTOs", () => {
  it("CreateProjectRequestSchema allows an omitted name; rejects bad visibility", () => {
    expect(
      CreateProjectRequestSchema.safeParse({
        repoOwner: "acme",
        repoName: "psalm-121",
        visibility: "private",
        createdFrom: "blank",
      }).success,
    ).toBe(true);
    expect(
      CreateProjectRequestSchema.safeParse({
        repoOwner: "acme",
        repoName: "psalm-121",
        visibility: "secret",
        createdFrom: "blank",
      }).success,
    ).toBe(false);
  });

  it("CreateProjectResponseSchema requires { projectId, jobId }", () => {
    expect(
      CreateProjectResponseSchema.parse({ projectId: "p", jobId: "j" }).jobId,
    ).toBe("j");
    expect(CreateProjectResponseSchema.safeParse({ projectId: "p" }).success).toBe(false);
  });

  it("ImportProjectRequestSchema carries no createdFrom (always import)", () => {
    expect(
      ImportProjectRequestSchema.safeParse({
        repoOwner: "acme",
        repoName: "exodus",
        visibility: "public",
      }).success,
    ).toBe(true);
  });

  it("CreateRepoRequestSchema requires a code + repoName + createdFrom", () => {
    expect(
      CreateRepoRequestSchema.safeParse({
        code: "gh-code",
        repoName: "psalm-121",
        visibility: "private",
        createdFrom: "blank",
      }).success,
    ).toBe(true);
    expect(
      CreateRepoRequestSchema.safeParse({
        repoName: "psalm-121",
        visibility: "private",
        createdFrom: "blank",
      }).success,
    ).toBe(false);
  });

  it("RepoAuthorizeUrlResponseSchema requires a non-empty url", () => {
    expect(RepoAuthorizeUrlResponseSchema.parse({ url: "https://x" }).url).toBe("https://x");
    expect(RepoAuthorizeUrlResponseSchema.safeParse({ url: "" }).success).toBe(false);
  });
});

// ── Task 27: studio hydration + commit wire DTOs ─────────────────────────────

const validManifestScene = {
  id: "s1",
  name: "wilderness · dawn",
  scriptText: "I am the voice of one",
  reference: "JOHN 1:23",
  translation: "KJV",
  visualPrompt: "sweeping empty wilderness at first light",
  durationSeconds: 5,
  captions: true,
  visualAssetKey: null,
};

const validManifest = {
  manifestVersion: 1,
  composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
  scenes: [validManifestScene],
  narratorVoice: { description: "warm baritone", label: "JAMES EARL JONES-STYLE" },
  music: { style: "Swelling strings", assetKey: null },
  endCard: { headline: "JOHN 1:23 · KJV", subtext: "Verse of the day" },
};

describe("ProjectResponseSchema", () => {
  it("parses the single-project { project } envelope (GET /v1/projects/:id)", () => {
    expect(ProjectResponseSchema.parse({ project: validProject }).project.slug).toBe(
      "psalm-121",
    );
  });
});

describe("ManifestSceneSchema + ProjectManifestSchema", () => {
  it("parses a full manifest, its optional music/endCard, and a null visualAssetKey", () => {
    const m = ProjectManifestSchema.parse(validManifest);
    expect(m.scenes[0].translation).toBe("KJV");
    expect(m.music?.style).toBe("Swelling strings");
    expect(m.scenes[0].visualAssetKey).toBeNull();
  });

  it("accepts the minimal manifest (empty scenes, no music/endCard, voice with no label)", () => {
    expect(
      ProjectManifestSchema.safeParse({
        manifestVersion: 1,
        composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
        scenes: [],
        narratorVoice: { description: "a plain voice" },
      }).success,
    ).toBe(true);
  });

  it("rejects a non-KJV/BSB translation, a missing scriptText, and manifestVersion != 1", () => {
    expect(
      ManifestSceneSchema.safeParse({ ...validManifestScene, translation: "NIV" }).success,
    ).toBe(false);
    const { scriptText: _drop, ...noScript } = validManifestScene;
    void _drop;
    expect(ManifestSceneSchema.safeParse(noScript).success).toBe(false);
    expect(
      ProjectManifestSchema.safeParse({ ...validManifest, manifestVersion: 2 }).success,
    ).toBe(false);
  });
});

describe("ManifestResponseSchema", () => {
  it("parses the { manifest } envelope (GET /v1/projects/:id/manifest)", () => {
    expect(
      ManifestResponseSchema.parse({ manifest: validManifest }).manifest.scenes,
    ).toHaveLength(1);
  });
});

describe("CommitVersionRequestSchema + CommitVersionResponseSchema", () => {
  it("requires a manifest + a non-empty message", () => {
    expect(
      CommitVersionRequestSchema.safeParse({
        manifest: validManifest,
        message: "Update scene: wilderness · dawn",
      }).success,
    ).toBe(true);
    expect(
      CommitVersionRequestSchema.safeParse({ manifest: validManifest, message: "" }).success,
    ).toBe(false);
  });

  it("CommitVersionResponseSchema returns just the jobId", () => {
    expect(CommitVersionResponseSchema.parse({ jobId: "job_1" }).jobId).toBe("job_1");
    expect(CommitVersionResponseSchema.safeParse({}).success).toBe(false);
  });
});

// ── Task 28: version list + publish wire DTOs ────────────────────────────────

const validVersion = {
  id: "ver_1",
  projectId: "prj_1",
  semver: "0.0.1",
  branchName: "v0.0.1",
  state: "published",
  commitMessage: "Refine scene visuals & enable captions",
  autoSummary: null,
  changedFiles: ["M src/Composition.tsx", "M captions/psalm-121.json"],
  headCommitSha: "deadbeef",
  prNumber: 7,
  prUrl: "https://example.test/pull/7",
  publishedAt: "2026-07-21T00:00:00.000Z",
};

describe("ProjectVersionDtoSchema", () => {
  it("parses a full version row (all the 14b dropdown fields)", () => {
    const v = ProjectVersionDtoSchema.parse(validVersion);
    expect(v.state).toBe("published");
    expect(v.branchName).toBe("v0.0.1");
    expect(v.changedFiles).toHaveLength(2);
    expect(v.prNumber).toBe(7);
  });

  it("accepts the null-heavy working/base rows (no commit/pr/publishedAt yet)", () => {
    expect(
      ProjectVersionDtoSchema.safeParse({
        ...validVersion,
        state: "working",
        commitMessage: null,
        headCommitSha: null,
        prNumber: null,
        prUrl: null,
        publishedAt: null,
        changedFiles: [],
      }).success,
    ).toBe(true);
  });

  it("rejects an out-of-enum state", () => {
    expect(
      ProjectVersionDtoSchema.safeParse({ ...validVersion, state: "live" }).success,
    ).toBe(false);
  });
});

describe("ProjectVersionListResponseSchema", () => {
  it("parses the { versions } envelope (GET /v1/projects/:id/versions)", () => {
    const parsed = ProjectVersionListResponseSchema.parse({
      versions: [
        { ...validVersion, semver: "0.0.2", branchName: "v0.0.2", state: "working" },
        validVersion,
        { ...validVersion, semver: "0.0.0", branchName: "v0.0.0", state: "base" },
      ],
    });
    expect(parsed.versions).toHaveLength(3);
    expect(parsed.versions[0].state).toBe("working");
  });
});

describe("PublishVersionRequestSchema + PublishVersionResponseSchema", () => {
  it("requires a non-empty message (no manifest — unlike commit)", () => {
    expect(PublishVersionRequestSchema.safeParse({ message: "Release v0.0.1" }).success).toBe(
      true,
    );
    expect(PublishVersionRequestSchema.safeParse({ message: "" }).success).toBe(false);
    expect(PublishVersionRequestSchema.safeParse({}).success).toBe(false);
  });

  it("PublishVersionResponseSchema returns just the jobId", () => {
    expect(PublishVersionResponseSchema.parse({ jobId: "job_9" }).jobId).toBe("job_9");
    expect(PublishVersionResponseSchema.safeParse({}).success).toBe(false);
  });
});
