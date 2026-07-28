import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import { serveBible } from "@/lib/youversion/bff";
import { cached } from "@/lib/youversion/cache";
import { fetchLanguageCatalogue } from "@/lib/youversion/client";

/**
 * `GET /api/bible/languages` — every language that actually has a Bible licensed to our
 * app key, with its English name, endonym and text direction.
 *
 * Two upstream one-shot requests (~860 KB combined) are collapsed into a ~55 KB slice and
 * cached for the process TTL. The set is derived from the Bible CATALOGUE rather than
 * from `/v1/languages`, which lists 8583 languages of which only ~1252 have a Bible.
 */
export async function GET(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const result = await serveBible(hasSession, async (deps) => ({
    languages: await cached("languages", () => fetchLanguageCatalogue(deps)),
  }));
  return NextResponse.json(result.body, { status: result.status });
}
