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

/**
 * UNVERIFIED display fields the browser read from its YouVersion session.
 *
 * The server has no way to obtain these: a YouVersion access token carries no profile
 * claims, the provider's OIDC discovery document has no `userinfo_endpoint`, and the SDK
 * never exposes the raw `id_token`. Nothing may key off them — the API identifies the
 * user by the token's signature-verified `sub` and uses these for display columns only.
 */
export const YouVersionSignInProfileSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  profilePicture: z.string().optional(),
});
export type YouVersionSignInProfile = z.infer<
  typeof YouVersionSignInProfileSchema
>;

/** `POST /v1/auth/youversion` request body. */
export const YouVersionSignInRequestSchema = z.object({
  accessToken: z.string().min(1),
  profile: YouVersionSignInProfileSchema.optional(),
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
  /** Optional so an older client still signs in; see {@link YouVersionSignInProfileSchema}. */
  profile: YouVersionSignInProfileSchema.optional(),
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
// the studio reducer; commit writes the edited manifest back. `translation` holds
// WHATEVER YouVersion-licensed abbreviation was selected for the scene (§2.11 /
// §9-Q10) — validated against the live YouVersion collection at GENERATION time, not
// a client-side enum gate here. KJV/BSB are only the pre-selected default, never a
// type-level restriction; the read/hydrate boundary must accept any abbreviation the
// API already committed (mirrors db-lib's broadened `TranslationSchema`).

/** A scene's Bible translation abbreviation (mirrors db-lib `TranslationSchema`).
 *  A free, non-empty string — e.g. "BSB" (the default), "KJV", "NIV", "NLT" — chosen
 *  from the YouVersion collection licensed for the user's language (§9-Q10). NOT a
 *  fixed KJV/BSB enum: broadening this is what lets the studio re-read a manifest
 *  whose translation is anything the generation step legitimately selected. */
export const TranslationSchema = z.string().min(1);
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

// ── Render wire DTOs (Task #38 — mirrors of the Task #37 API contract) ────────
//
// Hand-rolled mirrors of the API's render contracts (db-lib `schemas.ts` Render*).
// Same rationale as every block above: this repo does not depend on db-lib at all, and
// a BFF needs only the wire shapes. `contracts.test.ts` pins these against verbatim
// copies of the API's payloads.
//
// The API keeps the five output-spec COLUMNS flat in Postgres but re-nests them into one
// `outputSpec` on the wire, so the create request and the poll response carry the same
// object — which is why the 14c overlay can render the spec line straight from the
// SERVER's echo instead of re-deriving it from the local aspect toggle.

/** The 8 server-side render statuses (mirrors db-lib `RenderStatusSchema`). NOTE the
 *  declaration order is NOT the runtime order: a render goes
 *  queued → synthesizing → bundling → encoding → uploading → completed|failed|canceled
 *  (audio is synthesized BEFORE the bundle because Remotion snapshots assets at bundle
 *  time). */
export const RenderStatusSchema = z.enum([
  "queued",
  "bundling",
  "synthesizing",
  "encoding",
  "uploading",
  "completed",
  "failed",
  "canceled",
]);
export type RenderStatus = z.infer<typeof RenderStatusSchema>;

/** The render output spec (mirrors db-lib `RenderOutputSpecSchema` =
 *  `CompositionSpecSchema` + a free-string `codec`). `aspectRatio` is a `"W:H"` display
 *  hint — the pixel dimensions are authoritative. */
export const RenderOutputSpecSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  aspectRatio: z.string().regex(/^\d+:\d+$/),
  codec: z.string().min(1),
});
export type RenderOutputSpec = z.infer<typeof RenderOutputSpecSchema>;

/** A `RenderJob` on the wire (mirrors db-lib `RenderJobDtoSchema`) — the poll shape that
 *  drives the 14c overlay.
 *
 *  Two states the overlay must read carefully:
 *   - `status: "queued"` with a NON-null `startedAt` means the worker already picked the
 *     job up and is cloning / installing / downloading assets (task 36's
 *     `markRenderStarted` sets `startedAt` without changing status);
 *   - `framesTotal` is 0 from creation until the worker's `bundleComposition` resolves
 *     the composition — 0 means INDETERMINATE, never "done". */
export const RenderJobDtoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  versionId: z.string(),
  status: RenderStatusSchema,
  framesDone: z.number().int(),
  framesTotal: z.number().int(),
  outputSpec: RenderOutputSpecSchema,
  outputAssetKey: z.string().nullable(),
  thumbnailAssetKey: z.string().nullable(),
  runInBackground: z.boolean(),
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type RenderJobDto = z.infer<typeof RenderJobDtoSchema>;

/** `GET /v1/renders/:id` and `POST /v1/renders/:id/cancel` response. */
export const RenderJobResponseSchema = z.object({ render: RenderJobDtoSchema });
export type RenderJobResponse = z.infer<typeof RenderJobResponseSchema>;

/** `GET /v1/renders?mine=1` response ("Your videos" — the listing UI is task 41). */
export const RenderJobListResponseSchema = z.object({
  renders: z.array(RenderJobDtoSchema),
});
export type RenderJobListResponse = z.infer<typeof RenderJobListResponseSchema>;

/** `POST /v1/projects/:id/renders` request. `runInBackground` is a UI hint only — the
 *  job is always async server-side; it is persisted so "Your videos" can tell the two
 *  intents apart. */
export const CreateRenderRequestSchema = z.object({
  versionId: z.string().min(1),
  outputSpec: RenderOutputSpecSchema,
  runInBackground: z.boolean(),
});
export type CreateRenderRequest = z.infer<typeof CreateRenderRequestSchema>;

/** `POST /v1/projects/:id/renders` response — the render job id the studio polls. */
export const CreateRenderResponseSchema = z.object({ renderJobId: z.string() });
export type CreateRenderResponse = z.infer<typeof CreateRenderResponseSchema>;

// ── Gallery wire DTOs (Row 41 — mirrors of the rows-39/40 API contract) ──────
//
// Hand-rolled mirrors of `supagloo-nodejs-api`'s gallery contracts (db-lib
// `schemas.ts` Gallery*). Same rationale as every block above: this repo does not
// depend on db-lib at all, and a BFF needs only the wire shapes.
// `contracts.test.ts` pins these against verbatim copies of the API's payloads.
//
// THERE IS NO `book` PARAMETER anywhere in this block, by design (superseding scope
// decision, 2026-07-26): the gallery is sorted and free-text searched, never faceted
// by book. WHICH BOOKS EXIST IS A PROPERTY OF THE TRANSLATION and the YouVersion API
// is the authority on it, so a facet enumerated from a canon hardcoded in a client was
// the wrong design. `scriptureBook` still arrives on the DTO — it is an internal
// derived column that MAY be displayed as text on a card, and must never become a
// control.

/** Gallery listing order (mirrors db-lib `GallerySortSchema`). A CLOSED enum because
 *  the API selects its ORDER BY key expression from a fixed map keyed by this value —
 *  the request string never reaches the SQL. The `popular` DEFAULT lives on the API's
 *  query schema, not here. */
export const GallerySortSchema = z.enum(["popular", "newest", "trending"]);
export type GallerySort = z.infer<typeof GallerySortSchema>;

/** A published item's visibility (mirrors db-lib `GalleryVisibilitySchema`). An
 *  `unlisted` item is reachable by id but never appears in the public listing. */
export const GalleryVisibilitySchema = z.enum(["public", "unlisted"]);
export type GalleryVisibility = z.infer<typeof GalleryVisibilitySchema>;

/** A `GalleryItem` on the wire (mirrors db-lib `GalleryItemDtoSchema`) — the card
 *  contract for the Turn-15 grid.
 *
 *  Two fields the UI must read carefully:
 *   - `rank` is 1-based, CONTINUOUS ACROSS PAGES, and non-null ONLY under `sort=popular`
 *     WITH NO `q`. It comes from the SERVER because it is a property of the UNFILTERED
 *     popular ordering: a client computing `index + 1` would badge the 25th item "#1",
 *     and a "#7" badge under a different ordering would assert something untrue. It is
 *     null under any other sort AND under any search, because "#3" among the items
 *     matching a search term is not a standing about which anything is true. The
 *     `rank <= 3` threshold and the trophy-at-1 rule are PRESENTATION and live in
 *     `lib/gallery/gallery-model.ts`.
 *   - `thumbnailUrl` is a short-lived presigned GET URL (the anonymous grid cannot use
 *     the auth-scoped `presign-download`) and is null when it could not be signed.
 *
 *  `videoAssetKey`, `ownerId` and `viewCount` are deliberately NOT on this DTO — see
 *  the API's `toGalleryItemDto`. Playback goes through `stream-url`. */
/** The public shape of an item's creator (mirrors db-lib `GalleryOwnerSchema`).
 *
 *  Extracted rather than inlined so the CARD DTO and the WATCH-PAGE DTO provably share
 *  a base: the detail shape is the card's owner plus a count, and a reader can see that
 *  from the types instead of comparing two literals.
 *
 *  There is NO `@handle` here, and the API records the same gap in its own
 *  `toGalleryItemDto`: the design draws `@maryk`, `User` has no handle column, and
 *  inventing one at the wire is how a UI starts asserting an identity the database
 *  cannot back. */
export const GalleryOwnerSchema = z.object({
  displayName: z.string(),
  avatarInitials: z.string(),
});
export type GalleryOwner = z.infer<typeof GalleryOwnerSchema>;

export const GalleryItemDtoSchema = z.object({
  id: z.string(),
  renderJobId: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  scriptureReference: z.string(),
  scriptureBook: z.string(),
  translation: TranslationSchema,
  durationSeconds: z.number().int(),
  visibility: GalleryVisibilitySchema,
  publishedAt: z.string(),
  upvoteCount: z.number().int(),
  thumbnailUrl: z.string().nullable(),
  rank: z.number().int().nullable(),
  viewerHasUpvoted: z.boolean(),
  owner: GalleryOwnerSchema,
});
export type GalleryItemDto = z.infer<typeof GalleryItemDtoSchema>;

// ── Turn 16a: the watch page's detail contract ───────────────────────────────
//
// Mirrors db-lib `GalleryMakingOf*` / `GalleryItemDetail*`. This BFF validates rather
// than trusts, for the ordinary reason every mirror in this file exists — but note
// what it deliberately does NOT do: it does not re-enforce db-lib's jsonb-safety
// bounds (the control-character class, the 20 000-character cap). Those are WRITE-side
// gates protecting a Postgres column; by the time a value reaches this reader it is
// already stored, and refusing to render a row the database accepted would turn a
// server-side bound into a blank page. The bounds this side keeps are the ones that
// change MEANING: the version literal and the required-but-nullable key.

/** One tile on the HOW IT WAS MADE grid (mirrors db-lib `GalleryMakingOfSceneSchema`).
 *
 *  `index` is 1-based and is the number PRINTED on the tile, not an array offset. There
 *  is no image reference and never will be one: the tiles are deterministic gradients
 *  derived from the index (`lib/gallery/scene-poster.ts`), which is what keeps a public
 *  page from presigning N objects to render N decorations. */
export const GalleryMakingOfSceneSchema = z.object({
  index: z.number().int().min(1),
  name: z.string().min(1),
  durationSeconds: z.number().positive(),
});
export type GalleryMakingOfScene = z.infer<typeof GalleryMakingOfSceneSchema>;

/** `GalleryItem.makingOf` — the publish-time manifest snapshot the watch page renders.
 *
 *  `version` is the literal `1` and REJECTS anything else, which is the entire reason to
 *  carry a version at all: without it, a v2 snapshot written by a newer API is half-read
 *  by this reader — known fields parse, unknown ones are stripped — and the page renders
 *  a confident lie about how the video was made. Rejecting is what lets
 *  `fetchGalleryItem` degrade to `null` and the sections simply not appear.
 *
 *  Every optional value is `T | null`, never `""` or an absent key: "there is no music
 *  style" and "the music style is empty" must not be the same wire value, because one
 *  renders no chip and the other renders a blank one. */
export const GalleryMakingOfSchema = z.object({
  version: z.literal(1),
  capturedAt: z.string(),
  scriptureText: z.string().nullable(),
  narratorVoiceLabel: z.string().nullable(),
  musicStyle: z.string().nullable(),
  captionsOn: z.boolean(),
  scenes: z.array(GalleryMakingOfSceneSchema),
});
export type GalleryMakingOf = z.infer<typeof GalleryMakingOfSchema>;

/** `GET /v1/gallery/:id` — the WATCH PAGE's item. A strict widening of the card DTO.
 *
 *  Exactly two fields more than a card, and both are per-item costs the GRID must not
 *  pay: `makingOf` is a jsonb blob nobody needs 24 of, and `publicVideoCount` is a
 *  `COUNT(*)` — 24 of those per listing page, for a number no card renders.
 *
 *  `makingOf` is REQUIRED-BUT-NULLABLE, never optional. `null` is a permanent,
 *  first-class case (every item published before the column existed, plus any publish
 *  whose best-effort manifest read failed) and it means "we do not have this". An
 *  ABSENT key means the payload is not a detail item at all — most likely a card DTO
 *  served where a detail one was promised — and that must be a parse failure, not a
 *  silently missing section. */
export const GalleryItemDetailDtoSchema = GalleryItemDtoSchema.extend({
  makingOf: GalleryMakingOfSchema.nullable(),
  owner: GalleryOwnerSchema.extend({
    /** How many PUBLIC items this owner has. `unlisted` items are excluded: the number
     *  sits on a public page beside a creator's name, so counting items a visitor
     *  cannot reach would overstate them to everyone, the owner included. */
    publicVideoCount: z.number().int().min(0),
  }),
});
export type GalleryItemDetailDto = z.infer<typeof GalleryItemDetailDtoSchema>;

/** `GET /v1/gallery/:id` response — a `{ item }` envelope like every sibling. */
export const GalleryItemDetailResponseSchema = z.object({
  item: GalleryItemDetailDtoSchema,
});
export type GalleryItemDetailResponse = z.infer<
  typeof GalleryItemDetailResponseSchema
>;

/** `POST /v1/renders/:id/gallery` (201), `GET /v1/gallery/:id`, and BOTH upvote routes.
 *  The vote routes return the CURRENT item — count and `viewerHasUpvoted` re-read after
 *  the transaction — so the UI reconciles its optimistic update against server truth in
 *  one round trip. */
export const GalleryItemResponseSchema = z.object({ item: GalleryItemDtoSchema });
export type GalleryItemResponse = z.infer<typeof GalleryItemResponseSchema>;

/** `GET /v1/gallery` response. A keyed envelope, never a bare array.
 *
 *  `nextCursor` is the WHOLE pagination contract: the API fetches `pageSize + 1` rows
 *  and mints a cursor only if the extra row existed, so `null` means GENUINELY
 *  EXHAUSTED — not "this page was short". That is what lets `<LoadMore/>` hide itself
 *  honestly. There is deliberately no `hasMore` and no `total`. */
export const GalleryListResponseSchema = z.object({
  items: z.array(GalleryItemDtoSchema),
  nextCursor: z.string().nullable(),
});
export type GalleryListResponse = z.infer<typeof GalleryListResponseSchema>;

/** `DELETE /v1/gallery/:id` response — `200 { ok: true }` (the `DELETE /v1/projects/:id`
 *  precedent, not a 204). */
export const GalleryDeleteResponseSchema = z.object({ ok: z.literal(true) });
export type GalleryDeleteResponse = z.infer<typeof GalleryDeleteResponseSchema>;

/** `GET /v1/gallery/:id/stream-url` response. Structurally the presign envelope
 *  (`FilePresignDownloadResponseSchema`), aliased so the gallery player reads against a
 *  name that says which endpoint it came from: this one takes NO auth and NO key, the
 *  item itself is the authorization, and the TTL is 120s. */
export const GalleryStreamUrlResponseSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
});
export type GalleryStreamUrlResponse = z.infer<typeof GalleryStreamUrlResponseSchema>;

/** `POST /v1/renders/:id/gallery` request body (mirrors db-lib
 *  `PublishGalleryItemRequestSchema`).
 *
 *  Only five fields, and the omissions are the point: `scriptureBook`,
 *  `durationSeconds` and both asset keys are SERVER-derived. Letting a client claim a
 *  duration would let the `mm:ss` badge lie about its own video.
 *
 *  `title` and `scriptureReference` are trimmed BEFORE the length check, so a
 *  whitespace-only value is a 400 rather than an invisible title on a public card. */
export const PublishGalleryItemRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(""),
  scriptureReference: z.string().trim().min(1).max(120),
  translation: TranslationSchema,
  visibility: GalleryVisibilitySchema.default("public"),
});
export type PublishGalleryItemRequest = z.infer<typeof PublishGalleryItemRequestSchema>;
