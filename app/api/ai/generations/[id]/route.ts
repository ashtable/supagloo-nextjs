import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `GET /api/ai/generations/:id` — poll one AI generation, proxied from
 * `GET /v1/ai/generations/:id` → `{ generation: AiGenerationDto }`. The studio
 * polls this to a terminal status, then presigns the raw `resultAssetKey` via
 * `GET /api/files/presign-download`. Status + body pass through verbatim (404 for a
 * foreign/unknown id reaches the client unchanged).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: `ai/generations/${id}`,
    method: "GET",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
