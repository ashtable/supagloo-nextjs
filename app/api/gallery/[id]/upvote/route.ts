import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";

/**
 * `POST /api/gallery/:id/upvote` · `DELETE /api/gallery/:id/upvote` — cast/withdraw a
 * vote, proxied from the two authed upstream routes. Both answer with the item RE-READ
 * after the transaction, so the client reconciles its optimistic pill against server
 * truth in one round trip.
 *
 * Authed, and the 401 is load-bearing: it is what the client turns into the sign-in
 * prompt rather than a silently-lost vote. Status + body pass through verbatim.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return vote(request, params, "POST");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return vote(request, params, "DELETE");
}

async function vote(
  request: NextRequest,
  params: Promise<{ id: string }>,
  method: "POST" | "DELETE",
) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const result = await forwardToApi({
    path: `gallery/${encodeURIComponent(id)}/upvote`,
    method,
    token,
  });
  return NextResponse.json(result.body, { status: result.status });
}
