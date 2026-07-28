import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import { requiredParam, serveBible } from "@/lib/youversion/bff";
import { cached } from "@/lib/youversion/cache";
import { fetchBooks } from "@/lib/youversion/client";

/**
 * `GET /api/bible/books?bibleId=<id>` — the books of one translation.
 *
 * The upstream response is **1.59 MB** (every book carries its full chapter/verse tree,
 * and `fields[]` is ignored on that route), so the projection to `{usfm,title,canon}`
 * here — about 3 KB — is what keeps that payload off the wire to the browser. Cached per
 * translation, because it is by far the most expensive read in the picker.
 *
 * `canon` is whatever THIS translation reports: 27 books in TCENT, 80 in engWEBUS. It is
 * never filled from db-lib's 66-book `scripture-book.ts` table.
 */
export async function GET(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const bibleId = requiredParam(request.nextUrl.searchParams, "bibleId");
  if ("error" in bibleId) {
    return NextResponse.json(bibleId.error.body, { status: bibleId.error.status });
  }

  const result = await serveBible(hasSession, async (deps) => ({
    books: await cached(`books:${bibleId.value}`, () => fetchBooks(bibleId.value, deps)),
  }));
  return NextResponse.json(result.body, { status: result.status });
}
