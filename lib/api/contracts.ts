import { z } from "zod";

/**
 * Hand-rolled wire Zod shapes for the BFF ↔ supagloo-nodejs-api contract.
 *
 * These MIRROR the API's verified request/response DTOs (`AuthUser`,
 * `POST /v1/auth/youversion`, `GET /v1/me`, `POST /v1/test/seed`). They are
 * hand-rolled locally rather than imported from `@supagloo/database-lib` because
 * this repo's db-lib submodule is pinned to a SHA that predates those DTOs (see
 * `scratch/task-23-bff-foundation-nextjs.md`). Importing db-lib would also drag a
 * full Prisma client into a Next.js BFF, which needs only the wire shapes. A
 * contract test (`contracts.test.ts`) pins these against the API's actual shapes.
 *
 * Dates cross the wire as ISO strings.
 */

/** The wire user — matches the API's `AuthUser` (from `toAuthUser`). */
export const AuthUserSchema = z.object({
  id: z.string(),
  youversionUserId: z.string(),
  displayName: z.string(),
  email: z.string(),
  avatarInitials: z.string(),
  firstSignInAt: z.string(),
  onboardingCompletedAt: z.string().nullable(),
  lastSeenAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

/** `POST /v1/auth/youversion` request body. */
export const YouVersionSignInRequestSchema = z.object({
  accessToken: z.string().min(1),
});
export type YouVersionSignInRequest = z.infer<typeof YouVersionSignInRequestSchema>;

/** `POST /v1/auth/youversion` 200 response. `token` is the RAW opaque bearer
 *  token — the BFF puts it in the httpOnly cookie and NEVER returns it to the
 *  browser. */
export const YouVersionSignInResponseSchema = z.object({
  token: z.string(),
  user: AuthUserSchema,
  firstSignIn: z.boolean(),
});
export type YouVersionSignInResponse = z.infer<typeof YouVersionSignInResponseSchema>;

/** `GET /v1/me` / `PATCH /v1/me/onboarding` 200 response. */
export const MeResponseSchema = z.object({ user: AuthUserSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** `POST /v1/test/seed` request body (flag-gated on the API). */
export const TestSeedRequestSchema = z.object({
  users: z
    .array(
      z.object({
        youversionUserId: z.string().min(1),
        displayName: z.string().min(1),
        email: z.string().min(1),
        avatarInitials: z.string().min(1),
        sessionToken: z.string().min(1),
        onboardingCompleted: z.boolean().optional(),
      }),
    )
    .min(1),
});
export type TestSeedRequest = z.infer<typeof TestSeedRequestSchema>;

/** `POST /v1/test/seed` 200 response. `token` bearer-authenticates immediately. */
export const TestSeedResponseSchema = z.object({
  users: z.array(z.object({ user: AuthUserSchema, token: z.string() })).min(1),
});
export type TestSeedResponse = z.infer<typeof TestSeedResponseSchema>;

// ── BFF-facing (browser → route handler) request bodies ──────────────────────

/** Browser → `POST /api/auth/session`. The browser forwards the YV access token;
 *  the BFF exchanges it for a server session. */
export const SessionCreateRequestSchema = z.object({
  accessToken: z.string().min(1),
});
export type SessionCreateRequest = z.infer<typeof SessionCreateRequestSchema>;

/** Browser → `POST /api/test/seed`. The browser sends a scenario name and an
 *  optional per-run `nonce`; the BFF builds the deterministic identity + a fresh
 *  session token server-side. The nonce (test-only, flag-gated) makes the seeded
 *  user unique per e2e run so a real-stack run is repeatable, while both browser
 *  contexts in one run share the same nonce (and thus the same server user). */
export const SeedTriggerRequestSchema = z.object({
  scenario: z.enum(["authed-fresh", "authed-returning", "authed-unlinked"]),
  nonce: z.string().min(1).optional(),
});
export type SeedTriggerRequest = z.infer<typeof SeedTriggerRequestSchema>;

// ── GitHub App connect wire DTOs (Task #24 — design-delta §2.3/§6a/§8) ────────
//
// Hand-rolled mirrors of the API's GitHub connection contracts (db-lib
// `schemas.ts:372-446` + the merged `GET /v1/connections` at `:552-560`). Same
// rationale as above: this repo's db-lib submodule predates these DTOs and a BFF
// needs only the wire shapes. Only the installation POINTER is ever stored — no
// long-lived token crosses the wire (§2.3). Dates are ISO strings.

/** `GET /v1/connections/github/install-url` response — the hosted App
 *  install-picker URL the `start` BFF route 302-redirects the new tab to. */
export const GithubInstallUrlResponseSchema = z.object({
  url: z.string().min(1),
});
export type GithubInstallUrlResponse = z.infer<typeof GithubInstallUrlResponseSchema>;

/** A stored GitHub App connection on the wire. No token field — the installation
 *  id is the only stored credential-pointer. Named `*Status` to match the API's
 *  `GithubConnectionStatus` (which is suffixed to avoid colliding with Prisma's
 *  `GithubConnection` model type in the API's db-lib barrel). */
export const GithubConnectionStatusSchema = z.object({
  githubLogin: z.string(),
  installationId: z.string(),
  repositorySelection: z.string(),
  status: z.string(),
  connectedAt: z.string(),
});
export type GithubConnectionStatus = z.infer<typeof GithubConnectionStatusSchema>;

/** `POST /v1/connections/github/callback` response. */
export const GithubConnectionResponseSchema = z.object({
  connection: GithubConnectionStatusSchema,
});
export type GithubConnectionResponse = z.infer<typeof GithubConnectionResponseSchema>;

/** One repo in the live listing. `empty` is derived by the API from GitHub's
 *  `size === 0`. */
export const GithubRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  fullName: z.string(),
  owner: z.string(),
  private: z.boolean(),
  defaultBranch: z.string(),
  empty: z.boolean(),
});
export type GithubRepo = z.infer<typeof GithubRepoSchema>;

/** `GET /v1/github/repos` response (already filtered server-side). The BFF uses
 *  `repositories.length` as the live "N repos accessible" count. */
export const GithubRepoListResponseSchema = z.object({
  repositories: z.array(GithubRepoSchema),
});
export type GithubRepoListResponse = z.infer<typeof GithubRepoListResponseSchema>;

// ── OpenRouter + Gloo connect wire DTOs (Task #25 — design-delta §2.4/§2.5/§8) ──
//
// Hand-rolled mirrors of the API's OpenRouter/Gloo contracts (db-lib
// `schemas.ts:468-560`). Same rationale as the GitHub shapes above: this repo's
// db-lib submodule predates these DTOs and a BFF needs only the wire shapes.
// Secrets NEVER cross the wire — OpenRouter carries only the masked `keyLast4`
// (§9-Q5), Gloo only the plaintext `clientId`. Dates are ISO strings.

/** A stored OpenRouter connection on the wire — the masked `keyLast4` only. */
export const OpenRouterConnectionStatusSchema = z.object({
  keyLast4: z.string(),
  status: z.string(),
  connectedAt: z.string(),
});
export type OpenRouterConnectionStatus = z.infer<typeof OpenRouterConnectionStatusSchema>;

/** `POST /v1/connections/openrouter` response. */
export const OpenRouterConnectionResponseSchema = z.object({
  connection: OpenRouterConnectionStatusSchema,
});
export type OpenRouterConnectionResponse = z.infer<
  typeof OpenRouterConnectionResponseSchema
>;

/** `GET /v1/connections/openrouter/credits` — the LIVE balance (§2.4, never stored).
 *  `remaining = totalCredits − totalUsage`; the UI renders `$X.XX credit remaining`. */
export const OpenRouterCreditsResponseSchema = z.object({
  totalCredits: z.number(),
  totalUsage: z.number(),
  remaining: z.number(),
});
export type OpenRouterCreditsResponse = z.infer<typeof OpenRouterCreditsResponseSchema>;

/** A stored Gloo connection on the wire — plaintext `clientId` + timestamps, never
 *  the client secret / its ciphertext. */
export const GlooConnectionStatusSchema = z.object({
  clientId: z.string(),
  status: z.string(),
  connectedAt: z.string(),
  lastVerifiedAt: z.string(),
});
export type GlooConnectionStatus = z.infer<typeof GlooConnectionStatusSchema>;

/** `PUT /v1/connections/gloo` response. */
export const GlooConnectionResponseSchema = z.object({
  connection: GlooConnectionStatusSchema,
});
export type GlooConnectionResponse = z.infer<typeof GlooConnectionResponseSchema>;

/** `GET /v1/connections` merged status — all three provider tables, each the
 *  provider's status object or `null` when not connected (§8). */
export const ConnectionsResponseSchema = z.object({
  github: GithubConnectionStatusSchema.nullable(),
  openrouter: OpenRouterConnectionStatusSchema.nullable(),
  gloo: GlooConnectionStatusSchema.nullable(),
});
export type ConnectionsResponse = z.infer<typeof ConnectionsResponseSchema>;

// ── Project + wizard wire DTOs (Task #26 — design-delta §5.3/§6b/§2.9/§8) ──────
//
// Hand-rolled mirrors of the API's project-create + job-polling + list contracts
// (db-lib `schemas.ts` CreateProject/ImportProject/ProjectJob/ProjectDto, and the
// Task #26 create-new-repo JIT hop) + `job-stages.ts`. Same rationale as above: this
// repo's db-lib submodule predates these DTOs and a BFF needs only the wire shapes.
// The wizards render the provisioning log from the polled `stages` and land in
// `/studio/:slug`. Dates are ISO strings.

/** Repo visibility toggle (mirrors db-lib `RepoVisibilitySchema`). */
export const RepoVisibilitySchema = z.enum(["private", "public"]);
export type RepoVisibility = z.infer<typeof RepoVisibilitySchema>;

/** Project creation origin (mirrors db-lib `ProjectCreatedFromSchema`). v1 ships
 *  only `blank` + `import` as functional; the rest are reserved "coming soon". */
export const ProjectCreatedFromSchema = z.enum([
  "votd",
  "passage",
  "blank",
  "demo",
  "import",
]);
export type ProjectCreatedFrom = z.infer<typeof ProjectCreatedFromSchema>;

/** One `ProjectJob` stage row (mirrors db-lib `JobStageSchema`). The provisioning
 *  log renders `state` → ✓ / spinner / ○ / ✕ per row. */
export const ProjectJobStageSchema = z.object({
  key: z.string(),
  label: z.string(),
  state: z.enum(["pending", "running", "done", "failed"]),
});
export type ProjectJobStage = z.infer<typeof ProjectJobStageSchema>;

/** A `ProjectJob` on the wire (design-delta §2.9) — the scaffold/import progress
 *  poll shape. `stages` is the shared progress log the provisioning UI renders. */
export const ProjectJobDtoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: z.enum(["scaffold", "import_verify", "commit", "publish"]),
  status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
  stages: z.array(ProjectJobStageSchema),
  error: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type ProjectJobDto = z.infer<typeof ProjectJobDtoSchema>;

/** `GET /v1/projects/:id/jobs/:jobId` response (the `{ job }` envelope). */
export const ProjectJobResponseSchema = z.object({ job: ProjectJobDtoSchema });
export type ProjectJobResponse = z.infer<typeof ProjectJobResponseSchema>;

/** A `Project` on the wire (design-delta §2.6) — the workspace grid row. */
export const ProjectDtoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  repoOwner: z.string(),
  repoName: z.string(),
  repoVisibility: RepoVisibilitySchema,
  createdFrom: ProjectCreatedFromSchema,
  currentBranch: z.string(),
  thumbnailAssetKey: z.string().nullable(),
  lastRenderJobId: z.string().nullable(),
  lastOpenedAt: z.string(),
  createdAt: z.string(),
});
export type ProjectDto = z.infer<typeof ProjectDtoSchema>;

/** `GET /v1/projects` response — the workspace grid list. */
export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectDtoSchema),
});
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

/** `POST /v1/projects` request (use-existing-empty path — the repo already exists). */
export const CreateProjectRequestSchema = z.object({
  name: z.string().min(1).optional(),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  visibility: RepoVisibilitySchema,
  createdFrom: ProjectCreatedFromSchema,
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

/** `POST /v1/projects` / `.../import` / `.../create-repo` response — the new
 *  project id + the job id the wizard polls. */
export const CreateProjectResponseSchema = z.object({
  projectId: z.string(),
  jobId: z.string(),
});
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;

/** `POST /v1/projects/import` request (12b — an existing Supagloo repo). */
export const ImportProjectRequestSchema = z.object({
  name: z.string().min(1).optional(),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  visibility: RepoVisibilitySchema,
});
export type ImportProjectRequest = z.infer<typeof ImportProjectRequestSchema>;

/** `POST /v1/projects/create-repo` request (the create-new-repo JIT hop, §2.3/§6b).
 *  The user-authorization `code` + the new repo's name/visibility + the origin. */
export const CreateRepoRequestSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1).optional(),
  repoName: z.string().min(1),
  visibility: RepoVisibilitySchema,
  createdFrom: ProjectCreatedFromSchema,
});
export type CreateRepoRequest = z.infer<typeof CreateRepoRequestSchema>;

/** `GET /v1/projects/repo-authorize-url` response — the hosted GitHub
 *  user-authorization URL the wizard opens in the JIT hop. */
export const RepoAuthorizeUrlResponseSchema = z.object({ url: z.string().min(1) });
export type RepoAuthorizeUrlResponse = z.infer<typeof RepoAuthorizeUrlResponseSchema>;

/** `GET /v1/projects/:id` response — the single-project envelope the studio
 *  resolver reads after matching the URL slug in the `GET /v1/projects` list. */
export const ProjectResponseSchema = z.object({ project: ProjectDtoSchema });
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

// ── Studio hydration + commit wire DTOs (Task #27 — design-delta §5.3/§2.11/§8) ──
//
// Hand-rolled mirrors of the API's manifest read + commit contracts (db-lib
// `schemas.ts` — `ProjectManifestSchema` + subschemas, `ManifestResponseSchema`,
// `CommitVersionRequest/ResponseSchema`). Same rationale as above: this repo's
// db-lib submodule predates these DTOs and a BFF needs only the wire shapes. The
// `supagloo.project.json` manifest is the SOLE source of truth for a project's
// composition (§2.11) — read from the repo at a ref, Zod-parsed, and hydrated into
// the studio reducer; commit writes the edited manifest back. `translation` is the
// KJV/BSB public-domain generation enum (a non-KJV/BSB manifest is rejected at the
// wire boundary, exactly as the API validates it).

/** The generation translation enum (mirrors db-lib `TranslationSchema`). */
export const TranslationSchema = z.enum(["KJV", "BSB"]);
export type Translation = z.infer<typeof TranslationSchema>;

/** Composition metadata: pixel size, frame rate, aspect-ratio hint (mirrors db-lib
 *  `CompositionSpecSchema`). `aspectRatio` is a `"W:H"` display hint. */
export const CompositionSpecSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  aspectRatio: z.string().regex(/^\d+:\d+$/, 'expected a "W:H" ratio like "9:16"'),
});
export type CompositionSpec = z.infer<typeof CompositionSpecSchema>;

/** Narrator voice descriptor (mirrors db-lib `VoiceDescriptorSchema`). Task #35:
 *  `assetKey` caches the WHOLE-PROJECT synthesized narration track (one asset for
 *  all scenes' narration concatenated) — absent/null until generated, mirrors
 *  `MusicBed.assetKey`. */
export const VoiceDescriptorSchema = z.object({
  description: z.string().min(1),
  label: z.string().min(1).optional(),
  assetKey: z.string().min(1).nullable().optional(),
});
export type VoiceDescriptor = z.infer<typeof VoiceDescriptorSchema>;

/** The manifest's music bed (mirrors db-lib `MusicBedSchema`). */
export const MusicBedSchema = z.object({
  style: z.string().min(1),
  assetKey: z.string().min(1).nullable().optional(),
});
export type MusicBed = z.infer<typeof MusicBedSchema>;

/** The closing end card (mirrors db-lib `EndCardSchema`). */
export const EndCardSchema = z.object({
  headline: z.string().min(1),
  subtext: z.string().min(1).optional(),
});
export type EndCard = z.infer<typeof EndCardSchema>;

/** One ordered scene in the persisted composition (mirrors db-lib
 *  `ManifestSceneSchema`). Carries the fields the studio does NOT edit directly
 *  (`reference`, `translation`, `visualAssetKey`) — the adapter preserves these
 *  across the hydrate→edit→serialize round trip. */
export const ManifestSceneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scriptText: z.string().min(1),
  reference: z.string().min(1),
  translation: TranslationSchema,
  visualPrompt: z.string().min(1),
  durationSeconds: z.number().positive(),
  captions: z.boolean(),
  visualAssetKey: z.string().min(1).nullable().optional(),
});
export type ManifestScene = z.infer<typeof ManifestSceneSchema>;

/** The `supagloo.project.json` manifest (mirrors db-lib `ProjectManifestSchema`) —
 *  the sole source of truth for a project's composition. `scenes` MAY be empty (a
 *  freshly-scaffolded project); `narratorVoice` is required; `music`/`endCard` are
 *  optional. */
export const ProjectManifestSchema = z.object({
  manifestVersion: z.literal(1),
  composition: CompositionSpecSchema,
  scenes: z.array(ManifestSceneSchema),
  narratorVoice: VoiceDescriptorSchema,
  music: MusicBedSchema.optional(),
  endCard: EndCardSchema.optional(),
});
export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;

/** `GET /v1/projects/:id/manifest` query (mirrors db-lib `ManifestRefQuerySchema`).
 *  The git ref to read at; omitted → the API defaults to `currentBranch`. */
export const ManifestRefQuerySchema = z.object({
  ref: z.string().min(1).optional(),
});
export type ManifestRefQuery = z.infer<typeof ManifestRefQuerySchema>;

/** `GET /v1/projects/:id/manifest` response — the Zod-parsed manifest that hydrates
 *  the studio reducer (mirrors db-lib `ManifestResponseSchema`). */
export const ManifestResponseSchema = z.object({ manifest: ProjectManifestSchema });
export type ManifestResponse = z.infer<typeof ManifestResponseSchema>;

/** `POST /v1/projects/:id/commit` request (mirrors db-lib `CommitVersionRequestSchema`):
 *  the edited manifest to persist + the (non-empty) commit message. */
export const CommitVersionRequestSchema = z.object({
  manifest: ProjectManifestSchema,
  message: z.string().min(1),
});
export type CommitVersionRequest = z.infer<typeof CommitVersionRequestSchema>;

/** `POST /v1/projects/:id/commit` response (mirrors db-lib `CommitVersionResponseSchema`):
 *  the commit job id the studio polls via the shared `GET .../jobs/:jobId`. */
export const CommitVersionResponseSchema = z.object({ jobId: z.string() });
export type CommitVersionResponse = z.infer<typeof CommitVersionResponseSchema>;

// ── Version list + publish wire DTOs (Task #28 — design-delta §5.3 row 7/§8) ──
//
// Hand-rolled mirrors of the API's version-list + publish contracts (db-lib
// `schemas.ts` — `ProjectVersionStateSchema`, `ProjectVersionDtoSchema`,
// `ProjectVersionListResponseSchema`, `PublishVersion{Request,Response}Schema`). Same
// rationale as above: this repo's db-lib submodule predates these DTOs and a BFF needs
// only the wire shapes. The 14b dropdown is DERIVED from the versions list (real states
// → LIVE ON MAIN / restore); publish carries only `{ message }` (no manifest — unlike
// commit; the working manifest was already committed) and returns the publish job id the
// studio polls via the shared `GET .../jobs/:jobId` (kind: "publish"). Dates are ISO
// strings; the version-bump is Model A (the CURRENT working version is the one published).

/** A `ProjectVersion`'s lifecycle state on the wire (mirrors db-lib
 *  `ProjectVersionStateSchema`). The 14b dropdown maps these UI-side: the highest-semver
 *  `published` row is LIVE ON MAIN, later `published`/`archived` rows are restorable
 *  history, `base` is the empty template floor. */
export const ProjectVersionStateSchema = z.enum([
  "base",
  "working",
  "published",
  "archived",
]);
export type ProjectVersionState = z.infer<typeof ProjectVersionStateSchema>;

/** A `ProjectVersion` on the wire (mirrors db-lib `ProjectVersionDtoSchema`) — one row
 *  of the 14b version dropdown. `commitMessage`/`autoSummary`/`headCommitSha`/`prNumber`/
 *  `prUrl`/`publishedAt` are null until a commit/publish populates them; `changedFiles`
 *  is the persisted change-descriptor array. */
export const ProjectVersionDtoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  semver: z.string(),
  branchName: z.string(),
  state: ProjectVersionStateSchema,
  commitMessage: z.string().nullable(),
  autoSummary: z.string().nullable(),
  changedFiles: z.array(z.string()),
  headCommitSha: z.string().nullable(),
  prNumber: z.number().int().nullable(),
  prUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
});
export type ProjectVersionDto = z.infer<typeof ProjectVersionDtoSchema>;

/** `GET /v1/projects/:id/versions` response (mirrors db-lib
 *  `ProjectVersionListResponseSchema`) — the project's versions ordered by real semver
 *  DESCENDING (newest first; already the 14b dropdown order, no client reordering). */
export const ProjectVersionListResponseSchema = z.object({
  versions: z.array(ProjectVersionDtoSchema),
});
export type ProjectVersionListResponse = z.infer<
  typeof ProjectVersionListResponseSchema
>;

/** `POST /v1/projects/:id/publish` request (mirrors db-lib `PublishVersionRequestSchema`):
 *  the (non-empty) release message ONLY — no manifest (unlike commit). */
export const PublishVersionRequestSchema = z.object({
  message: z.string().min(1),
});
export type PublishVersionRequest = z.infer<typeof PublishVersionRequestSchema>;

/** `POST /v1/projects/:id/publish` response (mirrors db-lib `PublishVersionResponseSchema`):
 *  the publish job id the studio polls via the shared `GET .../jobs/:jobId`. */
export const PublishVersionResponseSchema = z.object({ jobId: z.string() });
export type PublishVersionResponse = z.infer<typeof PublishVersionResponseSchema>;

// ── AI generation + presign wire DTOs (Task #35 — design-delta §2.8/§6b/§8) ────
//
// Hand-rolled mirrors of the API's AI-generation + files-presign contracts (db-lib
// `schemas.ts` AiGeneration* + `workflows.ts` matrix, `FilePresignDownload*`). Same
// rationale as every block above: this repo's db-lib submodule predates these DTOs
// and a BFF needs only the wire shapes. The studio posts a generation, polls
// `GET /api/ai/generations/:id`, and presigns the raw `resultAssetKey` via
// `GET /api/files/presign-download?key=` for the scene preview. Dates are ISO strings.

/** The AI-generation kinds (mirrors db-lib `AiGenerationKindSchema`). */
export const AiGenerationKindSchema = z.enum([
  "storyboard",
  "script",
  "image",
  "narration",
  "music",
  "video",
]);
export type AiGenerationKind = z.infer<typeof AiGenerationKindSchema>;

/** The AI providers (mirrors db-lib `AiProviderSchema`). */
export const AiProviderSchema = z.enum(["gloo", "openrouter"]);
export type AiProvider = z.infer<typeof AiProviderSchema>;

/** Shared job/generation lifecycle status (mirrors db-lib `JobStatusSchema`). */
export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** The scripture a generation is based on (mirrors db-lib `ScripturePassageRequestSchema`). */
export const ScripturePassageRequestSchema = z.object({
  reference: z.string().min(1),
  translation: z.string().min(1),
  language: z.string().min(1).default("eng"),
});
export type ScripturePassageRequest = z.infer<typeof ScripturePassageRequestSchema>;

/** `AiGeneration.input` for the storyboard/script kinds (mirrors db-lib
 *  `GenerateScriptInputSchema`): a `brief` + optional scripture. */
export const GenerateScriptInputSchema = z.object({
  brief: z.string().min(1),
  scripture: ScripturePassageRequestSchema.optional(),
});
export type GenerateScriptInput = z.infer<typeof GenerateScriptInputSchema>;

/** `AiGeneration.input` for the `image` kind (mirrors db-lib `GenerateImageInputSchema`). */
export const GenerateImageInputSchema = z.object({
  prompt: z.string().min(1),
});
export type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;

/** One per-scene narration script (mirrors db-lib `NarrationSceneSchema`). */
export const NarrationSceneSchema = z.object({
  sceneId: z.string().min(1),
  scriptText: z.string().min(1),
});
export type NarrationScene = z.infer<typeof NarrationSceneSchema>;

/** `AiGeneration.input` for the `narration` kind — the WHOLE-PROJECT spec (mirrors
 *  db-lib `NarrationSpecSchema`/`GenerateNarrationInputSchema`): one voice + every
 *  scene's script (synthesized into one concatenated track, §7 workflow 7 D5). */
export const NarrationSpecSchema = z.object({
  voice: VoiceDescriptorSchema,
  scenes: z.array(NarrationSceneSchema).min(1),
});
export type NarrationSpec = z.infer<typeof NarrationSpecSchema>;

/** `AiGeneration.input` for the `music` kind (mirrors db-lib `MusicSpecSchema`/
 *  `GenerateMusicInputSchema`): a style label + target duration. */
export const MusicSpecSchema = z.object({
  style: z.string().min(1),
  durationSeconds: z.number().positive(),
});
export type MusicSpec = z.infer<typeof MusicSpecSchema>;

/** `AiGeneration.input` for the `video` kind (mirrors db-lib `GenerateVideoInputSchema`). */
export const GenerateVideoInputSchema = z.object({
  prompt: z.string().min(1),
  durationSeconds: z.number().positive().optional(),
  resolution: z.string().min(1).optional(),
  aspectRatio: z.string().regex(/^\d+:\d+$/).optional(),
  frameImages: z.array(z.string().min(1)).min(1).optional(),
  generateAudio: z.boolean().optional(),
  seed: z.number().int().optional(),
});
export type GenerateVideoInput = z.infer<typeof GenerateVideoInputSchema>;

/** `LLM structured output for the `script` kind (mirrors db-lib `GeneratedScriptSchema`) —
 *  what `AiGenerationDto.resultJson` carries for a script generation. */
export const GeneratedScriptSchema = z.object({
  scriptText: z.string().min(1),
  reference: z.string().min(1),
  translation: z.string().min(1),
});
export type GeneratedScript = z.infer<typeof GeneratedScriptSchema>;

/** One LLM-suggested scene (mirrors db-lib `StoryboardSceneSchema`). */
export const StoryboardSceneSchema = z.object({
  name: z.string().min(1),
  scriptText: z.string().min(1),
  reference: z.string().min(1),
  translation: z.string().min(1),
  visualPrompt: z.string().min(1),
  suggestedDurationSeconds: z.number().positive(),
});
export type StoryboardSceneSuggestion = z.infer<typeof StoryboardSceneSchema>;

/** LLM structured output for the `storyboard` kind (mirrors db-lib
 *  `GeneratedStoryboardSchema`) — what `AiGenerationDto.resultJson` carries. */
export const GeneratedStoryboardSchema = z.object({
  scenes: z.array(StoryboardSceneSchema).min(1),
  narratorVoice: VoiceDescriptorSchema,
  musicStyle: z.string().min(1),
});
export type GeneratedStoryboard = z.infer<typeof GeneratedStoryboardSchema>;

const aiGenerationCreateBase = {
  provider: AiProviderSchema,
  model: z.string().min(1),
  projectId: z.string().min(1).optional(),
  sceneId: z.string().min(1).optional(),
} as const;

/** `POST /v1/ai/generations` request (mirrors db-lib `CreateAiGenerationRequestSchema`) —
 *  discriminated on `kind` so the kind-specific `input` is validated at the wire boundary.
 *  The studio client posts `{kind, projectId?, sceneId?, input}`; the BFF enriches with
 *  `{provider, model}` (see `lib/api/ai-config.ts`) before forwarding to this shape. */
export const CreateAiGenerationRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("storyboard"), ...aiGenerationCreateBase, input: GenerateScriptInputSchema }),
  z.object({ kind: z.literal("script"), ...aiGenerationCreateBase, input: GenerateScriptInputSchema }),
  z.object({ kind: z.literal("image"), ...aiGenerationCreateBase, input: GenerateImageInputSchema }),
  z.object({ kind: z.literal("narration"), ...aiGenerationCreateBase, input: NarrationSpecSchema }),
  z.object({ kind: z.literal("music"), ...aiGenerationCreateBase, input: MusicSpecSchema }),
  z.object({ kind: z.literal("video"), ...aiGenerationCreateBase, input: GenerateVideoInputSchema }),
]);
export type CreateAiGenerationRequest = z.infer<typeof CreateAiGenerationRequestSchema>;

/** `POST /v1/ai/generations` 201 response (mirrors db-lib
 *  `CreateAiGenerationResponseSchema`) — the new generation id (= workflow id). */
export const CreateAiGenerationResponseSchema = z.object({
  generationId: z.string(),
});
export type CreateAiGenerationResponse = z.infer<typeof CreateAiGenerationResponseSchema>;

/** An `AiGeneration` on the wire (mirrors db-lib `AiGenerationDtoSchema`) — the poll shape.
 *  `resultAssetKey` is the RAW S3 key; the client presigns it via `presign-download`.
 *  `resultJson`/`tokenUsage` are pass-through JSON (shape varies by kind). */
export const AiGenerationDtoSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  sceneId: z.string().nullable(),
  kind: AiGenerationKindSchema,
  provider: AiProviderSchema,
  model: z.string(),
  status: JobStatusSchema,
  resultJson: z.unknown().nullable(),
  resultAssetKey: z.string().nullable(),
  error: z.string().nullable(),
  tokenUsage: z.unknown().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type AiGenerationDto = z.infer<typeof AiGenerationDtoSchema>;

/** `GET /v1/ai/generations/:id` (and cancel) response (mirrors db-lib
 *  `AiGenerationResponseSchema`). */
export const AiGenerationResponseSchema = z.object({
  generation: AiGenerationDtoSchema,
});
export type AiGenerationResponse = z.infer<typeof AiGenerationResponseSchema>;

/** `GET /v1/projects/:id/generations` response (mirrors db-lib
 *  `AiGenerationListResponseSchema`). */
export const AiGenerationListResponseSchema = z.object({
  generations: z.array(AiGenerationDtoSchema),
});
export type AiGenerationListResponse = z.infer<typeof AiGenerationListResponseSchema>;

/** `GET /v1/files/presign-download?key=` response (mirrors db-lib
 *  `FilePresignDownloadResponseSchema`): a short-lived presigned GET url + expiry. */
export const FilePresignDownloadResponseSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
});
export type FilePresignDownloadResponse = z.infer<typeof FilePresignDownloadResponseSchema>;
