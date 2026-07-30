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
  RenderStatusSchema,
  RenderJobDtoSchema,
  RenderJobResponseSchema,
  RenderJobListResponseSchema,
  CreateRenderRequestSchema,
  CreateRenderResponseSchema,
  ManifestSceneSchema,
  ManifestScriptureSchema,
  ProjectManifestSchema,
  ManifestResponseSchema,
  CommitVersionRequestSchema,
  CommitVersionResponseSchema,
  ProjectVersionDtoSchema,
  ProjectVersionListResponseSchema,
  PublishVersionRequestSchema,
  PublishVersionResponseSchema,
  VoiceDescriptorSchema,
  AiGenerationKindSchema,
  AiProviderSchema,
  JobStatusSchema,
  CreateAiGenerationRequestSchema,
  CreateAiGenerationResponseSchema,
  AiGenerationDtoSchema,
  AiGenerationResponseSchema,
  FilePresignDownloadResponseSchema,
  GallerySortSchema,
  GalleryVisibilitySchema,
  GalleryItemDtoSchema,
  GalleryItemResponseSchema,
  GalleryItemDetailDtoSchema,
  GalleryItemDetailResponseSchema,
  GalleryMakingOfSchema,
  GalleryListResponseSchema,
  GalleryDeleteResponseSchema,
  GalleryStreamUrlResponseSchema,
  PublishGalleryItemRequestSchema,
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

  it("CreateProjectRequestSchema carries the wizard's passage (mirror 5)", () => {
    // The BFF forwards the create body verbatim today, so this schema has no runtime
    // consumer — which is exactly why the omission was easy to leave in and dangerous to
    // leave in. nextjs does not import `@supagloo/database-lib` (the submodule is excluded
    // from tsconfig AND eslint), so this file NEVER self-heals when the db-lib gitlink
    // moves: the day anything validates a create body with this schema, `scripture` would
    // be stripped and the whole feature would silently no-op on both wizard tabs.
    const parsed = CreateProjectRequestSchema.safeParse({
      repoOwner: "acme",
      repoName: "psalm-121",
      visibility: "private",
      createdFrom: "passage",
      scripture: {
        reference: "Psalms 121:1-5",
        translation: "ASV",
        language: "en",
        passageId: "PSA.121.1-5",
      },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.scripture?.passageId).toBe("PSA.121.1-5");
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

  it("rejects a missing scriptText and manifestVersion != 1", () => {
    const { scriptText: _drop, ...noScript } = validManifestScene;
    void _drop;
    expect(ManifestSceneSchema.safeParse(noScript).success).toBe(false);
    expect(
      ProjectManifestSchema.safeParse({ ...validManifest, manifestVersion: 2 }).success,
    ).toBe(false);
  });

  // Task #58 (design-delta §2.11 / §9-Q10): `translation` holds WHATEVER
  // YouVersion-licensed abbreviation was selected — validated against the live
  // collection at generation time, NOT a fixed KJV/BSB enum. KJV/BSB are only the
  // default. The manifest schema must accept an arbitrary non-empty abbreviation.
  it("accepts an arbitrary licensed translation abbreviation (not just KJV/BSB), but not an empty string", () => {
    const scene = { ...validManifestScene, translation: "NIV" };
    expect(ManifestSceneSchema.safeParse(scene).success).toBe(true);
    expect(ManifestSceneSchema.parse(scene).translation).toBe("NIV");

    // the whole-manifest + response envelope accept it too (this is what the
    // studio read-side re-validates against on hydrate — see studio-data).
    const manifest = { ...validManifest, scenes: [scene] };
    expect(ProjectManifestSchema.safeParse(manifest).success).toBe(true);
    expect(ManifestResponseSchema.safeParse({ manifest }).success).toBe(true);

    // still a non-empty string, not `any` — an empty translation is rejected.
    expect(
      ManifestSceneSchema.safeParse({ ...validManifestScene, translation: "" }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Feature 2 — the project's origin passage, THIS repo's mirror of it
// ---------------------------------------------------------------------------
//
// `contracts.ts` is a HAND-MIRROR of db-lib's `src/schemas.ts` — nextjs never imports
// `@supagloo/database-lib` (one repo-wide reference: the comment at `contracts.ts:8`;
// the vendored submodule is excluded from `tsconfig.json` and `eslint.config.mjs`).
// So this mirror does NOT heal when the db-lib gitlink moves: without the schema below,
// `ManifestResponseSchema.safeParse` (`lib/studio/studio-data.ts`) STRIPS `scripture`
// off every manifest the studio reads, and the very next Commit writes it back absent.
// That is erasure of data the scaffold already seeded, in the user's own git repo.
const validScripture = {
  reference: "Psalm 121",
  translation: "BSB",
  language: "en",
  passageId: "PSA.121",
};

describe("ManifestScriptureSchema + ProjectManifest.scripture", () => {
  it("parses the full block and keeps every field (mirrors db-lib ManifestScriptureSchema)", () => {
    expect(ManifestScriptureSchema.parse(validScripture)).toEqual(validScripture);
  });

  it("accepts the minimal block — language and passageId are optional", () => {
    const minimal = { reference: "Psalm 121", translation: "BSB" };
    expect(ManifestScriptureSchema.parse(minimal)).toEqual(minimal);
  });

  it("rejects an empty reference, an empty translation and an empty passageId", () => {
    expect(
      ManifestScriptureSchema.safeParse({ ...validScripture, reference: "" }).success,
    ).toBe(false);
    expect(
      ManifestScriptureSchema.safeParse({ ...validScripture, translation: "" }).success,
    ).toBe(false);
    expect(
      ManifestScriptureSchema.safeParse({ ...validScripture, passageId: "" }).success,
    ).toBe(false);
    expect(ManifestScriptureSchema.safeParse({ translation: "BSB" }).success).toBe(false);
  });

  // THE erasure test. Parsing is the studio's read boundary; if the key is not declared
  // here Zod drops it silently and `parsed.scripture` is `undefined` with no error.
  it("ROUND-TRIPS scripture through the whole manifest — the studio's read boundary must not strip it", () => {
    const manifest = { ...validManifest, scripture: validScripture };
    const parsed = ProjectManifestSchema.parse(manifest);
    expect(parsed.scripture).toEqual(validScripture);
    // and through the response envelope the studio actually parses against
    expect(
      ManifestResponseSchema.parse({ manifest }).manifest.scripture,
    ).toEqual(validScripture);
  });

  it("is OPTIONAL and manifestVersion stays 1 — every already-committed manifest still parses", () => {
    const parsed = ProjectManifestSchema.parse(validManifest);
    expect("scripture" in parsed).toBe(false);
    expect(parsed.manifestVersion).toBe(1);
    expect(
      ProjectManifestSchema.safeParse({
        ...validManifest,
        scripture: validScripture,
        manifestVersion: 2,
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed scripture block rather than silently dropping it", () => {
    expect(
      ProjectManifestSchema.safeParse({
        ...validManifest,
        scripture: { reference: "Psalm 121" },
      }).success,
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

// ── Task #35: AI-generation + presign wire DTOs (mirror db-lib) ───────────────
describe("AI-generation contracts", () => {
  it("VoiceDescriptorSchema now accepts the whole-project narration assetKey", () => {
    expect(
      VoiceDescriptorSchema.parse({ description: "warm", assetKey: "projects/p/narration/t.mp3" })
        .assetKey,
    ).toBe("projects/p/narration/t.mp3");
    expect(VoiceDescriptorSchema.parse({ description: "warm" }).assetKey).toBeUndefined();
    expect(VoiceDescriptorSchema.safeParse({ description: "warm", assetKey: "" }).success).toBe(false);
  });

  it("enum mirrors match the API (kind, provider, status)", () => {
    expect(AiGenerationKindSchema.options).toEqual([
      "storyboard",
      "script",
      "image",
      "narration",
      "music",
      "video",
    ]);
    expect(AiProviderSchema.options).toEqual(["gloo", "openrouter"]);
    expect(JobStatusSchema.options).toEqual(["queued", "running", "succeeded", "failed", "canceled"]);
  });

  it("CreateAiGenerationRequestSchema validates kind-specific input at the boundary", () => {
    expect(
      CreateAiGenerationRequestSchema.safeParse({
        kind: "image",
        provider: "openrouter",
        model: "m",
        projectId: "p1",
        sceneId: "s1",
        input: { prompt: "a lone figure at dawn" },
      }).success,
    ).toBe(true);
    // image requires a prompt
    expect(
      CreateAiGenerationRequestSchema.safeParse({
        kind: "image",
        provider: "openrouter",
        model: "m",
        input: {},
      }).success,
    ).toBe(false);
    // narration requires voice + scenes
    expect(
      CreateAiGenerationRequestSchema.safeParse({
        kind: "narration",
        provider: "openrouter",
        model: "m",
        input: { voice: { description: "warm" }, scenes: [{ sceneId: "s1", scriptText: "hi" }] },
      }).success,
    ).toBe(true);
    // music requires style + duration
    expect(
      CreateAiGenerationRequestSchema.safeParse({
        kind: "music",
        provider: "openrouter",
        model: "m",
        input: { style: "Ambient", durationSeconds: 30 },
      }).success,
    ).toBe(true);
    // storyboard/script require a brief
    expect(
      CreateAiGenerationRequestSchema.safeParse({
        kind: "storyboard",
        provider: "openrouter",
        model: "m",
        input: { brief: "Genesis 1 opening" },
      }).success,
    ).toBe(true);
  });

  it("AiGenerationDtoSchema parses a succeeded image generation (raw resultAssetKey)", () => {
    const dto = {
      id: "gen-1",
      projectId: "p1",
      sceneId: "s1",
      kind: "image",
      provider: "openrouter",
      model: "m",
      status: "succeeded",
      resultJson: null,
      resultAssetKey: "projects/p1/assets/gen-1",
      error: null,
      tokenUsage: null,
      createdAt: "2026-07-24T00:00:00.000Z",
      completedAt: "2026-07-24T00:01:00.000Z",
    };
    expect(AiGenerationResponseSchema.parse({ generation: dto }).generation.resultAssetKey).toBe(
      "projects/p1/assets/gen-1",
    );
    expect(AiGenerationDtoSchema.safeParse({ ...dto, status: "bogus" }).success).toBe(false);
  });

  it("CreateAiGenerationResponseSchema + FilePresignDownloadResponseSchema", () => {
    expect(CreateAiGenerationResponseSchema.parse({ generationId: "g1" }).generationId).toBe("g1");
    expect(
      FilePresignDownloadResponseSchema.parse({
        url: "http://minio/signed",
        expiresAt: "2026-07-24T01:00:00.000Z",
      }).url,
    ).toBe("http://minio/signed");
    expect(FilePresignDownloadResponseSchema.safeParse({ url: "x" }).success).toBe(false);
  });
});

// ── Render wire DTOs (Task #38 mirrors of the Task #37 API contract) ──────────

describe("render wire DTOs (mirror of the API's Task #37 shapes)", () => {
  /** Verbatim copy of a `GET /v1/renders/:id` payload's `render` object. */
  const validRender = {
    id: "rj_1",
    projectId: "prj_1",
    versionId: "pv_1",
    status: "encoding",
    framesDone: 612,
    framesTotal: 840,
    outputSpec: {
      width: 1080,
      height: 1920,
      fps: 30,
      aspectRatio: "9:16",
      codec: "h264",
    },
    outputAssetKey: null,
    thumbnailAssetKey: null,
    runInBackground: false,
    error: null,
    createdAt: "2026-07-24T10:00:00.000Z",
    startedAt: "2026-07-24T10:00:05.000Z",
    completedAt: null,
  };

  it("RenderJobDtoSchema parses the in-flight poll shape (spec re-nested, no userId)", () => {
    const dto = RenderJobDtoSchema.parse(validRender);
    expect(dto.status).toBe("encoding");
    expect(dto.outputSpec.aspectRatio).toBe("9:16");
    expect(dto.startedAt).toBe("2026-07-24T10:00:05.000Z");
  });

  it("accepts the queued-but-started 'preparing' shape (task 36 sets startedAt without changing status)", () => {
    const preparing = RenderJobDtoSchema.parse({
      ...validRender,
      status: "queued",
      framesDone: 0,
      framesTotal: 0,
      startedAt: "2026-07-24T10:00:05.000Z",
    });
    expect(preparing.status).toBe("queued");
    expect(preparing.framesTotal).toBe(0);
  });

  it("accepts the completed shape with both asset keys, and the failed shape with an error", () => {
    const done = RenderJobDtoSchema.parse({
      ...validRender,
      status: "completed",
      framesDone: 840,
      outputAssetKey: "renders/rj_1/output.mp4",
      thumbnailAssetKey: "renders/rj_1/thumb.jpg",
      completedAt: "2026-07-24T10:04:00.000Z",
    });
    expect(done.outputAssetKey).toBe("renders/rj_1/output.mp4");

    const failed = RenderJobDtoSchema.parse({
      ...validRender,
      status: "failed",
      error: "renderMedia exited 1",
      completedAt: "2026-07-24T10:02:00.000Z",
    });
    expect(failed.error).toBe("renderMedia exited 1");
  });

  it("rejects an unknown status and a malformed aspect ratio", () => {
    expect(
      RenderJobDtoSchema.safeParse({ ...validRender, status: "rendering" }).success,
    ).toBe(false);
    expect(
      RenderJobDtoSchema.safeParse({
        ...validRender,
        outputSpec: { ...validRender.outputSpec, aspectRatio: "9-16" },
      }).success,
    ).toBe(false);
  });

  it("RenderJobResponseSchema / RenderJobListResponseSchema are keyed envelopes", () => {
    expect(RenderJobResponseSchema.parse({ render: validRender }).render.id).toBe("rj_1");
    expect(RenderJobResponseSchema.safeParse(validRender).success).toBe(false);
    expect(
      RenderJobListResponseSchema.parse({ renders: [validRender] }).renders,
    ).toHaveLength(1);
    expect(RenderJobListResponseSchema.safeParse([validRender]).success).toBe(false);
  });

  it("CreateRenderRequestSchema / CreateRenderResponseSchema mirror the API", () => {
    const req = CreateRenderRequestSchema.parse({
      versionId: "pv_1",
      outputSpec: validRender.outputSpec,
      runInBackground: true,
    });
    expect(req.runInBackground).toBe(true);
    expect(
      CreateRenderRequestSchema.safeParse({
        versionId: "",
        outputSpec: validRender.outputSpec,
        runInBackground: false,
      }).success,
    ).toBe(false);
    expect(CreateRenderResponseSchema.parse({ renderJobId: "rj_1" }).renderJobId).toBe(
      "rj_1",
    );
  });

  it("RenderStatusSchema covers all 8 server statuses", () => {
    for (const s of [
      "queued",
      "bundling",
      "synthesizing",
      "encoding",
      "uploading",
      "completed",
      "failed",
      "canceled",
    ]) {
      expect(RenderStatusSchema.safeParse(s).success, s).toBe(true);
    }
    expect(RenderStatusSchema.safeParse("cancelled").success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gallery wire DTOs (Row 41 — mirrors of the rows-39/40 API contract)
//
// Same pinning discipline as every block above: the fixtures are VERBATIM copies
// of what `supagloo-nodejs-api` actually sends (`src/gallery/dto.ts`'s
// `toGalleryItemDto` + `routes/gallery.ts`'s envelopes), so a drift in the API
// breaks this suite rather than the browser.
// ─────────────────────────────────────────────────────────────────────────────

describe("gallery wire DTOs (mirror of the API's rows-39/40 shapes)", () => {
  /** Verbatim copy of one item from a `GET /v1/gallery?sort=popular` payload. */
  const validGalleryItem = {
    id: "gal_1",
    renderJobId: "rj_1",
    projectId: "prj_1",
    title: "Forty days in the wilderness",
    description: "Matthew's temptation narrative, scored.",
    scriptureReference: "Matthew 4:1-11",
    scriptureBook: "MAT",
    translation: "BSB",
    durationSeconds: 83,
    visibility: "public",
    publishedAt: "2026-07-26T09:14:00.000Z",
    upvoteCount: 41,
    thumbnailUrl:
      "http://localhost:9000/supagloo-dev/renders/rj_1/thumb.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef",
    rank: 1,
    viewerHasUpvoted: false,
    owner: { displayName: "Grace Hopper", avatarInitials: "GH" },
  };

  it("GalleryItemDtoSchema parses the popular-sort card payload", () => {
    const dto = GalleryItemDtoSchema.parse(validGalleryItem);
    expect(dto.rank).toBe(1);
    expect(dto.owner.avatarInitials).toBe("GH");
    expect(dto.scriptureBook).toBe("MAT");
  });

  it("accepts rank: null — the API sends it off sort=popular", () => {
    // rank is a property of the GLOBAL popular ordering. Under `newest`/`trending`
    // the API sends null rather than a number that would assert something untrue.
    expect(GalleryItemDtoSchema.parse({ ...validGalleryItem, rank: null }).rank).toBeNull();
  });

  it("accepts thumbnailUrl: null (the poster could not be signed)", () => {
    expect(
      GalleryItemDtoSchema.parse({ ...validGalleryItem, thumbnailUrl: null }).thumbnailUrl,
    ).toBeNull();
  });

  it("accepts the unlisted visibility and rejects anything else", () => {
    expect(
      GalleryItemDtoSchema.parse({ ...validGalleryItem, visibility: "unlisted" }).visibility,
    ).toBe("unlisted");
    expect(
      GalleryItemDtoSchema.safeParse({ ...validGalleryItem, visibility: "private" }).success,
    ).toBe(false);
  });

  it("carries NO videoAssetKey, ownerId or viewCount — three deliberate API omissions", () => {
    // Documented in the API's `toGalleryItemDto`: the raw key would invite clients to
    // guess sibling keys, an internal user id on a public endpoint is gratuitous, and
    // `viewCount` has no endpoint that increments it (shipping an always-0 field lies).
    const dto = GalleryItemDtoSchema.parse(validGalleryItem) as Record<string, unknown>;
    expect(dto).not.toHaveProperty("videoAssetKey");
    expect(dto).not.toHaveProperty("ownerId");
    expect(dto).not.toHaveProperty("viewCount");
  });

  it("rejects a payload missing a required field", () => {
    const { scriptureBook: _omit, ...missing } = validGalleryItem;
    void _omit;
    expect(GalleryItemDtoSchema.safeParse(missing).success).toBe(false);
  });

  it("U-C2 GalleryListResponseSchema is a keyed envelope, never a bare array", () => {
    const page = GalleryListResponseSchema.parse({
      items: [validGalleryItem],
      nextCursor: "eyJ2IjoxfQ",
    });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe("eyJ2IjoxfQ");
    expect(GalleryListResponseSchema.safeParse([validGalleryItem]).success).toBe(false);
  });

  it("U-C2 nextCursor: null is legal and means GENUINELY EXHAUSTED", () => {
    // The API fetches pageSize+1 and mints a cursor only if the extra row existed, so
    // null is what lets the UI hide "Load more" honestly. There is deliberately no
    // `hasMore` and no `total`.
    const page = GalleryListResponseSchema.parse({ items: [], nextCursor: null });
    expect(page.nextCursor).toBeNull();
    expect(
      GalleryListResponseSchema.safeParse({ items: [validGalleryItem] }).success,
    ).toBe(false);
  });

  it("GalleryItemResponseSchema wraps the publish/read/vote item", () => {
    expect(
      GalleryItemResponseSchema.parse({ item: validGalleryItem }).item.id,
    ).toBe("gal_1");
    expect(GalleryItemResponseSchema.safeParse(validGalleryItem).success).toBe(false);
  });

  it("GalleryDeleteResponseSchema pins the literal `{ ok: true }`", () => {
    expect(GalleryDeleteResponseSchema.parse({ ok: true }).ok).toBe(true);
    expect(GalleryDeleteResponseSchema.safeParse({ ok: false }).success).toBe(false);
  });

  it("GalleryStreamUrlResponseSchema mirrors the presign envelope", () => {
    const signed = GalleryStreamUrlResponseSchema.parse({
      url: "http://localhost:9000/supagloo-dev/renders/rj_1/output.mp4?X-Amz-Signature=deadbeef",
      expiresAt: "2026-07-26T09:16:00.000Z",
    });
    expect(signed.url).toContain("X-Amz-Signature");
    expect(GalleryStreamUrlResponseSchema.safeParse({ url: 42 }).success).toBe(false);
  });

  it("GallerySortSchema is the API's closed three-value enum", () => {
    for (const s of ["popular", "newest", "trending"]) {
      expect(GallerySortSchema.safeParse(s).success, s).toBe(true);
    }
    expect(GallerySortSchema.safeParse("top").success).toBe(false);
    // Faithful to db-lib: the `popular` DEFAULT lives on the API's query schema, not on
    // the enum. This repo's own default lives in `initialQueryState()`.
    expect(GallerySortSchema.safeParse(undefined).success).toBe(false);
  });

  it("GalleryVisibilitySchema is public|unlisted", () => {
    expect(GalleryVisibilitySchema.safeParse("public").success).toBe(true);
    expect(GalleryVisibilitySchema.safeParse("unlisted").success).toBe(true);
    expect(GalleryVisibilitySchema.safeParse("private").success).toBe(false);
  });

  it("PublishGalleryItemRequestSchema trims, defaults, and bounds", () => {
    const req = PublishGalleryItemRequestSchema.parse({
      title: "  Forty days  ",
      scriptureReference: "  Matthew 4:1-11 ",
      translation: "BSB",
    });
    expect(req.title).toBe("Forty days");
    expect(req.scriptureReference).toBe("Matthew 4:1-11");
    expect(req.description).toBe("");
    expect(req.visibility).toBe("public");
  });

  it("PublishGalleryItemRequestSchema rejects a whitespace-only title", () => {
    // Trimmed BEFORE the length check server-side, so a padded-blank title is a 400
    // rather than an invisible title on a public card.
    expect(
      PublishGalleryItemRequestSchema.safeParse({
        title: "   ",
        scriptureReference: "Matthew 4:1-11",
        translation: "BSB",
      }).success,
    ).toBe(false);
  });

  it("PublishGalleryItemRequestSchema carries NO server-derived field", () => {
    // scriptureBook / durationSeconds / both asset keys are server-derived; a client
    // that could send them could make the mm:ss badge lie about its own video.
    const shape = Object.keys(
      (PublishGalleryItemRequestSchema as unknown as { shape: Record<string, unknown> }).shape,
    ).sort();
    expect(shape).toEqual([
      "description",
      "scriptureReference",
      "title",
      "translation",
      "visibility",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Turn 16a — the WATCH PAGE's detail DTO (slice C4)
//
// `GET /v1/gallery/:id` widened from the card DTO to a strict superset of it. These
// mirrors are pinned against verbatim copies of db-lib's `GalleryItemDetailDtoSchema`
// / `GalleryMakingOfSchema` payloads, so an API-side change breaks this suite rather
// than the watch page.
// ─────────────────────────────────────────────────────────────────────────────

describe("gallery detail DTO (mirror of db-lib's GalleryItemDetail* shapes)", () => {
  const validMakingOf = {
    version: 1,
    capturedAt: "2026-07-26T09:59:00.000Z",
    scriptureText:
      "In the beginning God created the heaven and the earth. And God said, Let there be light: and there was light.",
    narratorVoiceLabel: "Dramatic baritone",
    musicStyle: "Orchestral",
    captionsOn: true,
    scenes: [
      { index: 1, name: "Void", durationSeconds: 7 },
      { index: 2, name: "Deep", durationSeconds: 8 },
      { index: 3, name: "Spirit", durationSeconds: 8 },
      { index: 4, name: "Light", durationSeconds: 9 },
    ],
  };

  const validDetailItem = {
    id: "gal_1",
    renderJobId: "rj_1",
    projectId: "prj_1",
    title: "Let there be light",
    description: "",
    scriptureReference: "Genesis 1:1-4",
    scriptureBook: "GEN",
    translation: "KJV",
    durationSeconds: 32,
    visibility: "public",
    publishedAt: "2026-07-20T09:14:00.000Z",
    upvoteCount: 2412,
    thumbnailUrl:
      "http://localhost:9000/supagloo-dev/renders/rj_1/thumb.jpg?X-Amz-Signature=deadbeef",
    rank: null,
    viewerHasUpvoted: true,
    owner: { displayName: "Mary Kanu", avatarInitials: "MK", publicVideoCount: 14 },
    makingOf: validMakingOf,
  };

  it("GalleryItemDetailDtoSchema parses the watch-page payload", () => {
    const dto = GalleryItemDetailDtoSchema.parse(validDetailItem);
    expect(dto.owner.publicVideoCount).toBe(14);
    expect(dto.makingOf?.scenes).toHaveLength(4);
    expect(dto.makingOf?.scenes[3].name).toBe("Light");
  });

  it("REQUIRES makingOf — nullable, but never an absent key", () => {
    // Required-but-nullable is what stops a mapper silently forgetting the field:
    // "we have no snapshot" and "the mapper dropped it" must not look the same.
    expect(
      GalleryItemDetailDtoSchema.parse({ ...validDetailItem, makingOf: null }).makingOf,
    ).toBeNull();
    const { makingOf: _omit, ...noKey } = validDetailItem;
    void _omit;
    expect(GalleryItemDetailDtoSchema.safeParse(noKey).success).toBe(false);
  });

  it("REQUIRES owner.publicVideoCount — a plain CARD payload FAILS the detail DTO", () => {
    // The widening is additive but not optional: the two DTOs are genuinely different
    // types, and a card served where a detail item was promised must be a parse
    // failure, not a page rendering `undefined public videos`.
    const cardOwner = { displayName: "Mary Kanu", avatarInitials: "MK" };
    expect(
      GalleryItemDetailDtoSchema.safeParse({ ...validDetailItem, owner: cardOwner })
        .success,
    ).toBe(false);
  });

  it("accepts every field the CARD DTO accepts (the widening is additive)", () => {
    // Nothing a card can send becomes invalid here — otherwise the same row could not
    // serve both surfaces.
    const card = GalleryItemDtoSchema.parse(validDetailItem);
    const detail = GalleryItemDetailDtoSchema.parse(validDetailItem);
    for (const key of Object.keys(card) as (keyof typeof card)[]) {
      if (key === "owner") continue;
      expect(detail[key]).toEqual(card[key]);
    }
    expect(detail.owner.displayName).toBe(card.owner.displayName);
    expect(detail.owner.avatarInitials).toBe(card.owner.avatarInitials);
  });

  it("GalleryMakingOfSchema pins `version` to the literal 1", () => {
    // Without the literal, a v2 snapshot written by a newer API is HALF-read by this
    // reader — known fields parse, unknown ones are stripped — and the page renders a
    // confident lie. Rejecting is what lets the client degrade to null.
    expect(GalleryMakingOfSchema.parse(validMakingOf).version).toBe(1);
    expect(
      GalleryMakingOfSchema.safeParse({ ...validMakingOf, version: 2 }).success,
    ).toBe(false);
  });

  it("GalleryMakingOfSchema allows the honest EMPTY snapshot", () => {
    // No scripture text, no voice, no music, captions off, no scenes: a manifest that
    // simply had none of it. That is not an error and must not read as one.
    const empty = {
      version: 1,
      capturedAt: "2026-07-26T09:59:00.000Z",
      scriptureText: null,
      narratorVoiceLabel: null,
      musicStyle: null,
      captionsOn: false,
      scenes: [],
    };
    expect(GalleryMakingOfSchema.parse(empty).scenes).toEqual([]);
  });

  it("GalleryMakingOfSchema rejects a scene with a zero index or a non-positive duration", () => {
    // `index` is the number PRINTED on the tile (1-based), and a 0.0s tile would be a
    // lie about the video's own timeline.
    expect(
      GalleryMakingOfSchema.safeParse({
        ...validMakingOf,
        scenes: [{ index: 0, name: "Void", durationSeconds: 7 }],
      }).success,
    ).toBe(false);
    expect(
      GalleryMakingOfSchema.safeParse({
        ...validMakingOf,
        scenes: [{ index: 1, name: "Void", durationSeconds: 0 }],
      }).success,
    ).toBe(false);
  });

  it("GalleryItemDetailResponseSchema is a keyed envelope, never a bare item", () => {
    expect(
      GalleryItemDetailResponseSchema.parse({ item: validDetailItem }).item.id,
    ).toBe("gal_1");
    expect(GalleryItemDetailResponseSchema.safeParse(validDetailItem).success).toBe(
      false,
    );
  });
});
