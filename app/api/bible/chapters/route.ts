import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import { requiredParam, serveBible } from "@/lib/youversion/bff";
import { cached } from "@/lib/youversion/cache";
import { fetchChapters } from "@/lib/youversion/client";

/**
 * `GET /api/bible/chapters?bibleId=<id>&book=<USFM>` — the chapters of one book.
 * Each row carries YouVersion's own `passage_id`, which is echoed back to the passage
 * route verbatim; nothing here assembles a USFM reference from parts.
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

  const result = await serveBible(hasSession, async (deps) => ({
    chapters: await cached(`chapters:${bibleId.value}:${book.value}`, () =>
      fetchChapters(bibleId.value, book.value, deps),
    ),
  }));
  return NextResponse.json(result.body, { status: result.status });
}
