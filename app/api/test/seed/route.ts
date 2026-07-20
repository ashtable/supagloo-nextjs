import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { testSeedEnabled } from "@/lib/api/config";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/api/cookies";
import { SeedTriggerRequestSchema, TestSeedResponseSchema } from "@/lib/api/contracts";
import { buildTestSeedRequest } from "@/lib/api/seed";

/**
 * `POST /api/test/seed` — the extended Stagehand seam (design-delta §5.3; plan
 * task 23). Flag-gated: a HARD 404 unless `testSeedEnabled` (NODE_ENV!=='production'
 * AND SUPAGLOO_ENABLE_TEST_SEED==='1'), mirroring the API's own double-gate so the
 * seam behaves as if it does not exist without the flag. When enabled it maps a
 * scenario → a deterministic API `POST /v1/test/seed` request (fresh session token,
 * optional per-run nonce), mints the REAL httpOnly session cookie from the returned
 * token, and answers `{ ok: true }`. The UI then runs the real server-driven
 * session/onboarding path.
 */
export async function POST(request: NextRequest) {
  if (!testSeedEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = SeedTriggerRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const seedRequest = buildTestSeedRequest(parsed.data.scenario, { nonce: parsed.data.nonce });
  const result = await forwardToApi({ path: "test/seed", method: "POST", body: seedRequest });

  if (result.status !== 200) {
    return NextResponse.json(result.body ?? { error: "seed_failed" }, { status: result.status });
  }

  const seed = TestSeedResponseSchema.safeParse(result.body);
  if (!seed.success) {
    return NextResponse.json({ error: "bad_upstream_response" }, { status: 502 });
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, seed.data.users[0].token, sessionCookieOptions());
  return response;
}
