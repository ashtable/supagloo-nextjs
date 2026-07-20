import { randomUUID } from "node:crypto";
import type { TestSeedRequest } from "./contracts";

/**
 * Server-side scenario → deterministic seed identity mapping for the extended
 * Stagehand seam. The BFF's `POST /api/test/seed` route maps a scenario name to a
 * `TestSeedRequest` for the API's `POST /v1/test/seed`, mints the real httpOnly
 * cookie from the returned token, and the UI then runs the REAL server-driven
 * session/onboarding path. Connections stay MOCK inside the wizard (tasks 24/25
 * wire the real connect endpoints).
 *
 * Identities are DISTINCT from the pure-`?mock=` path's hardcoded "Ash Srinivas"
 * so an e2e can prove the workspace/wizard render from server data, not the mock.
 */

export type SeedScenario = "authed-fresh" | "authed-returning" | "authed-unlinked";

export interface SeedUser {
  youversionUserId: string;
  displayName: string;
  email: string;
  avatarInitials: string;
  onboardingCompleted: boolean;
}

const SEED_USERS: Record<SeedScenario, SeedUser> = {
  // First sign-in, onboarding NOT done → the wizard overlays the workspace from
  // real server state.
  "authed-fresh": {
    youversionUserId: "yv-e2e-fresh",
    displayName: "Grace Hopper",
    email: "grace.e2e@supagloo.test",
    avatarInitials: "GH",
    onboardingCompleted: false,
  },
  // Returning, already onboarded.
  "authed-returning": {
    youversionUserId: "yv-e2e-returning",
    displayName: "Ada Lovelace",
    email: "ada.e2e@supagloo.test",
    avatarInitials: "AL",
    onboardingCompleted: true,
  },
  // Onboarded but nothing linked.
  "authed-unlinked": {
    youversionUserId: "yv-e2e-unlinked",
    displayName: "Alan Turing",
    email: "alan.e2e@supagloo.test",
    avatarInitials: "AT",
    onboardingCompleted: true,
  },
};

export function seedUserForScenario(scenario: SeedScenario): SeedUser {
  const user = SEED_USERS[scenario];
  if (!user) throw new Error(`unknown seed scenario: ${scenario}`);
  return user;
}

export interface BuildSeedOptions {
  /** Injectable token minter (defaults to a fresh random UUID). */
  tokenFactory?: () => string;
  /** Per-run uniqueness suffix for the youversionUserId (test-only, flag-gated),
   *  so a real-stack e2e is repeatable — both browser contexts in one run pass the
   *  same nonce and thus resolve to the SAME server user. */
  nonce?: string;
}

/**
 * Build the `TestSeedRequest` for a scenario. A fresh random `sessionToken` is
 * minted per call (injectable) so each seed establishes its own session row for
 * the upserted-by-youversionUserId user — which is exactly what lets onboarding
 * persist across a fresh browser context. An optional `nonce` suffixes the
 * youversionUserId so each e2e run gets its own user.
 */
export function buildTestSeedRequest(
  scenario: SeedScenario,
  options: BuildSeedOptions = {},
): TestSeedRequest {
  const { tokenFactory = randomUUID, nonce } = options;
  const user = seedUserForScenario(scenario);
  const youversionUserId = nonce
    ? `${user.youversionUserId}-${nonce}`
    : user.youversionUserId;
  return {
    users: [
      {
        youversionUserId,
        displayName: user.displayName,
        email: user.email,
        avatarInitials: user.avatarInitials,
        sessionToken: tokenFactory(),
        onboardingCompleted: user.onboardingCompleted,
      },
    ],
  };
}
