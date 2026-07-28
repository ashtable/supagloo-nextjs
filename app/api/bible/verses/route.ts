import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import { requiredParam, serveBible } from "@/lib/youversion/bff";
import { cached } from "@/lib/youversion/cache";
import { fetchVerses } from "@/lib/youversion/client";

/**
 * `GET /api/bible/verses?bibleId=<id>&book=<USFM>&chapter=<id>` — the verses of one
 * chapter. The thinnest read in the picker (~1.5 KB upstream), and the one that hands
 * out the `passage_id` the passage route is called with.
 */
export async function GET(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const params = request.nextUrl.searchParams;
  const bibleId = requiredParam(params, "bibleId");
  if ("error" in bibleId) {
    return NextResponse.json(bibleId.error.body, { status: bibleId.error.status });
  }
  const book = requiredParam(params, "book");
  if ("error" in book) {
    return NextResponse.json(book.error.body, { status: book.error.status });
  }
  const chapter = requiredParam(params, "chapter");
  if ("error" in chapter) {
    return NextResponse.json(chapter.error.body, { status: chapter.error.status });
  }

  const result = await serveBible(hasSession, async (deps) => ({
    verses: await cached(
      `verses:${bibleId.value}:${book.value}:${chapter.value}`,
      () => fetchVerses(bibleId.value, book.value, chapter.value, deps),
    ),
  }));
  return NextResponse.json(result.body, { status: result.status });
}
