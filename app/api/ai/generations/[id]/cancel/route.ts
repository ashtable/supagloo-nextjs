import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `POST /api/ai/generations/:id/cancel` — figure 20a's Cancel.
 *
 * The api has answered this since task #31 (200 / 409 `generation_not_cancelable` / 404),
 * and nothing in the browser could reach it: this directory held a `GET` and nothing else,
 * so the only control on 20a's blocking lock had no path to the server at all. A dead
 * Cancel on an overlay that blocks the whole editor is the worst of the three options
 * available — worse than no Cancel, because it promises an escape it cannot deliver.
 *
 * Status and body pass through verbatim. The 409 in particular MUST survive: it means the
 * generation is past the point of no return, and the studio's response to it is to keep
 * the lock up and say so, not to pretend the cancel worked.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: `ai/generations/${id}/cancel`,
    method: "POST",
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
