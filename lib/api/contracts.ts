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
