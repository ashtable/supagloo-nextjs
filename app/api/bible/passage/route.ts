import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import { requiredParam, serveBible } from "@/lib/youversion/bff";
import { cached } from "@/lib/youversion/cache";
import { fetchPassage } from "@/lib/youversion/client";

/**
 * `GET /api/bible/passage?bibleId=<id>&usfm=<passage_id>` — the verse text.
 *
 * `usfm` must be a `passage_id` the chapters/verses routes previously handed out. A
 * human reference ("John 3:16") 404s upstream, which is precisely why the picker echoes
 * ids instead of formatting them.
 */
export async function GET(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const params = request.nextUrl.searchParams;
  const bibleId = requiredParam(params, "bibleId");
  if ("error" in bibleId) {
    return NextResponse.json(bibleId.error.body, { status: bibleId.error.status });
  }
  const usfm = requiredParam(params, "usfm");
  if ("error" in usfm) {
    return NextResponse.json(usfm.error.body, { status: usfm.error.status });
  }

  const result = await serveBible(hasSession, async (deps) => ({
    passage: await cached(`passage:${bibleId.value}:${usfm.value}`, () =>
      fetchPassage(bibleId.value, usfm.value, deps),
    ),
  }));
  return NextResponse.json(result.body, { status: result.status });
}
