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
