import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/api/cookies";
import { requiredParam, serveBible } from "@/lib/youversion/bff";
import { cached } from "@/lib/youversion/cache";
import { fetchTranslations } from "@/lib/youversion/client";

/**
 * `GET /api/bible/translations?language=<tag>` — the Bibles licensed to us for one
 * language. A language with none answers `{ translations: [] }` (upstream sends a 204
 * with an empty body, which the client turns into `[]` rather than a parse crash).
 *
 * This route also closes plan §5 data gap **D10** — 16b's publish dialog draws
 * `TRANSLATION ▾` as a select and until now had nothing to enumerate it with.
 */
export async function GET(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const language = requiredParam(request.nextUrl.searchParams, "language");
  if ("error" in language) {
    return NextResponse.json(language.error.body, { status: language.error.status });
  }

  const result = await serveBible(hasSession, async (deps) => ({
    translations: await cached(`translations:${language.value}`, () =>
      fetchTranslations(language.value, deps),
    ),
  }));
  return NextResponse.json(result.body, { status: result.status });
}
