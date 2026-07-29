import { NextResponse } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";

/**
 * `GET /api/demo/stream-url` — a short-lived (120s) presigned GET for the landing page's
 * demo video, proxied from `GET /v1/demo/stream-url` → `{ url, expiresAt }`.
 *
 * NO session cookie is read, and the request is not inspected AT ALL — not even for a
 * query string. The landing page is served to anonymous visitors, so its demo has to be
 * reachable by one; forwarding a bearer here would imply an ownership check that does not
 * exist upstream.
 *
 * Nothing from the caller reaches the api, which is the point rather than an omission. The
 * upstream signs a compile-time constant key: an unauthenticated presigner that accepted a
 * key would sign ANY object in the bucket for ANYONE — every user's renders, scene assets
 * and narration audio. Passing a caller's parameters through would be the first step back
 * toward that, so this handler takes no `request` argument at all.
 *
 * The returned URL points at the PUBLIC S3 endpoint, so the browser fetches the mp4
 * directly and gets HTTP range requests (seeking) for free; this proxy never streams bytes.
 */
export async function GET() {
  const result = await forwardToApi({ path: "demo/stream-url", method: "GET" });
  return NextResponse.json(result.body, { status: result.status });
}
