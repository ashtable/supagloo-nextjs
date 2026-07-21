import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `POST /api/projects/import` — the Import wizard (12b), proxied from
 * `POST /v1/projects/import` (an existing Supagloo repo; the API fixes `createdFrom`
 * to `import` and reads the manifest from the repo) → `{ projectId, jobId }`. The
 * wizard then polls the import job; a `verifySupaglooProject` failure surfaces as the
 * "NOT A SUPAGLOO PROJECT" error card. Status + body pass through verbatim.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const body = await request.json().catch(() => ({}));
  const result = await forwardToApi({
    path: "projects/import",
    method: "POST",
    token,
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
