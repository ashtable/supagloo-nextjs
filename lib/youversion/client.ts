import type {
  BibleBookRef,
  BibleChapterRef,
  BibleLanguage,
  BiblePassage,
  BibleTranslation,
  BibleVerseRef,
} from "./contracts";

/**
 * The SERVER-side YouVersion Platform client behind `app/api/bible/**`.
 *
 * ── Why this exists rather than `@youversion/platform-core` ──────────────────────────
 * The SDK is already a dependency of this repo (for the auth widgets) and its route
 * templates do match the live API. It is still not usable here, for three reasons found
 * by reading its source, not its types:
 *
 *  1. **It cannot see a 204.** `platform-core/src/client.ts` treats `response.ok` as
 *     success and then branches on `content-type`: JSON → `.json()`, otherwise
 *     → `.text()`. A language with no Bibles answers **204 / `text/html` / zero bytes**,
 *     so `getVersions()` resolves to `""` and the caller's `.data` is `undefined`.
 *  2. **It cannot ask for the thin payloads.** `getBooks(versionId, canon?)` forwards
 *     only `canon` — no `page_size`, no `fields[]`.
 *  3. **It erases error classification.** Non-ok throws a plain `Error` whose message is
 *     redacted outside `NODE_ENV=development`. We need 401 / 404 / 422 distinguishable.
 *
 * ── Every route below was MEASURED on 2026-07-27, not read from docs ────────────────
 *  - `GET /v1/bibles?language_ranges[]=*&page_size=*&fields[]=…` → 1472 bibles, 80 KB,
 *    ONE request. (`page_size=*` requires 1..3 `fields[]`.)
 *  - `GET /v1/languages?page_size=*&fields[]=…` → 8583 records, 780 KB, ONE request.
 *  - `GET /v1/bibles?language_ranges[]=<tag>` → paginated, `page_size` max 50.
 *    Repeated `language_ranges[]` do NOT union — only the first is honoured — so we send
 *    exactly one. A language with no Bibles ⇒ **204, empty body**.
 *  - `GET /v1/bibles/{id}/books` → the whole tree, **1.59 MB**; `fields[]` is IGNORED.
 *  - `GET /v1/bibles/{id}/books/{USFM}/chapters` → 78 KB (verses nested).
 *  - `GET /v1/bibles/{id}/books/{USFM}/chapters/{n}/verses` → **1.5 KB** — the thin one.
 *  - `GET /v1/bibles/{id}/passages/{USFM}` → `{id, content, reference}`.
 *
 * Pure and `fetch`-injectable, so the whole surface is unit-tested with zero network and
 * so lifting it into the api later would be a move rather than a rewrite.
 */

export const YOUVERSION_BASE_URL = "https://api.youversion.com";

/**
 * An explicit `Accept-Encoding`, pinned onto the `language_ranges[]=*` catalogue request
 * ONLY.
 *
 * ⚠️ THIS IS A WORKAROUND FOR SOMEONE ELSE'S CACHE, not a protocol requirement. Read this
 * before deleting it, and read it again before widening it.
 *
 * **What was measured** (2026-07-31, deterministic across 4 consecutive probes per
 * variant, same URL, same app key, same process):
 *
 * | request | rows | `total_size` | distinct `language_tag` | upstream `Age` |
 * |---|---|---|---|---|
 * | undici's default (NO `accept-encoding`) | **1472** | 1472 | 1252 | ~35 800 s |
 * | the same URL + `accept-encoding: gzip, deflate` | **1479** | 1479 | 1258 | ~1 200 s |
 *
 * It is not about compression — `gzip`, `identity` and `br` all return 1479. The mere
 * PRESENCE of the header selects a different upstream cache variant, and the variant
 * undici's default lands on is **stale**. The header-carrying view is a strict SUPERSET:
 * on the day of measurement it added `ceb ycn aab egm jub sax` and dropped nothing.
 *
 * **Why the client cannot detect it.** `total_size` matches the TRUNCATED count and
 * `next_page_token` is `null`, so the truncated response is internally consistent. There
 * is no error, no partial-page signal, nothing to test — the only symptom is ~6 languages
 * silently missing from the studio's scripture picker for real users.
 *
 * **When this can go.** The moment the two variants agree. That is not a guess: the live
 * lane's `E-YV1b` fetches BOTH variants and asserts this client's catalogue covers the
 * union of their tags, so a convergence shows up as the two counts becoming equal and a
 * REMOVAL of this header shows up as a red test rather than as a silent regression.
 *
 * **Why it is not applied to every request.** Only this one index was measured stale.
 * `language_ranges[]=<tag>` (the per-language listing) was probed directly on the same day
 * and is NOT stale. Sending the header everywhere would change the cache key of five other
 * routes on a hunch; `U-YV1b` pins the narrow scope so widening it stays a deliberate act
 * with a measurement behind it.
 */
export const CATALOGUE_ACCEPT_ENCODING = "gzip, deflate";

/** A non-ok response from YouVersion. Carries the status so 401 (bad app key), 404
 *  (unknown ref) and 422 (unsupported id) stay distinguishable at the call site — the
 *  same classification `supagloo-nodejs-dbos/src/providers/youversion.ts` keeps. */
export class YouVersionHttpError extends Error {
  readonly status: number;
  readonly bodyText: string;

  constructor(status: number, bodyText: string) {
    super(`YouVersion request failed: ${status}`);
    this.name = "YouVersionHttpError";
    this.status = status;
    this.bodyText = bodyText;
  }
}

export interface YouVersionDeps {
  appKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** `null` means "204, deliberately empty" — a shape a JSON parse would throw on.
 *
 *  `extraHeaders` exists for exactly one caller: see {@link CATALOGUE_ACCEPT_ENCODING}. */
async function getJson(
  path: string,
  params: Array<[string, string]>,
  deps: YouVersionDeps,
  extraHeaders?: Record<string, string>,
): Promise<unknown | null> {
  const doFetch = deps.fetchImpl ?? fetch;
  const base = deps.baseUrl ?? YOUVERSION_BASE_URL;
  const query = params.length
    ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`
    : "";

  const res = await doFetch(`${base}${path}${query}`, {
    headers: {
      accept: "application/json",
      "x-yvp-app-key": deps.appKey,
      ...extraHeaders,
    },
  });

  // MUST be checked before any parse: 204 carries `content-type: text/html` and a
  // zero-byte body, and `JSON.parse("")` throws.
  if (res.status === 204) return null;
  if (!res.ok) {
    throw new YouVersionHttpError(res.status, await res.text().catch(() => ""));
  }
  return res.json();
}

interface Collection<T> {
  data?: T[];
  next_page_token?: string | null;
}

function rows<T>(body: unknown | null): T[] {
  if (body === null || body === undefined) return [];
  const data = (body as Collection<T>).data;
  return Array.isArray(data) ? data : [];
}

// ── direction + display name ────────────────────────────────────────────────────────

/** `Intl`'s own bidi answer for a tag, used ONLY where the provider has no record.
 *  `getTextInfo()` is the current spelling; older engines exposed a `textInfo` getter. */
function intlDirection(tag: string): "ltr" | "rtl" {
  try {
    const locale = new Intl.Locale(tag) as Intl.Locale & {
      getTextInfo?: () => { direction?: string };
      textInfo?: { direction?: string };
    };
    const direction =
      locale.getTextInfo?.().direction ?? locale.textInfo?.direction ?? "ltr";
    return direction === "rtl" ? "rtl" : "ltr";
  } catch {
    return "ltr";
  }
}

function intlName(tag: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

// ── the six reads ───────────────────────────────────────────────────────────────────

interface RawBible {
  id?: number | string;
  abbreviation?: string;
  title?: string;
  localized_title?: string;
  language_tag?: string;
}

interface RawLanguage {
  id?: string;
  text_direction?: string;
  display_names?: Record<string, string>;
}

/**
 * Every language that has at least one Bible licensed to our app key, with its display
 * name and text direction.
 *
 * The set is derived from the CATALOGUE, not from `/v1/languages`: `/v1/languages` lists
 * 8583 languages, and `default_bible_id` is disproven as a filter (measured: `aab` has one
 * and its Bible query still 204s). Grouping the 1472 catalogue entries by `language_tag`
 * gives exactly the ~1252 languages a user could actually pick.
 *
 * DIRECTION RESOLUTION ORDER — the provider first, `Intl` only as a fallback. They
 * disagree on 5 of the languages that have Bibles (`kby mfi rhg swb vgr`: the API says
 * `ltr`, `Intl` says `rtl`), and the provider is authoritative for its own content. 12
 * catalogue tags (`zh-Hant-TW`, `es-ES`, `pt-PT`, …) have no `/v1/languages` record at
 * all; those, and only those, fall through to `Intl`.
 */
export async function fetchLanguageCatalogue(
  deps: YouVersionDeps,
): Promise<BibleLanguage[]> {
  const [catalogue, languages] = await Promise.all([
    getJson(
      "/v1/bibles",
      [
        ["language_ranges[]", "*"],
        ["page_size", "*"],
        ["fields[]", "id"],
        ["fields[]", "abbreviation"],
        ["fields[]", "language_tag"],
      ],
      deps,
      // The stale-cache-variant workaround. Scoped to THIS request and nothing else —
      // see {@link CATALOGUE_ACCEPT_ENCODING} for the two measured row counts, the date,
      // and the condition under which it can be deleted.
      { "accept-encoding": CATALOGUE_ACCEPT_ENCODING },
    ),
    getJson(
      "/v1/languages",
      [
        ["page_size", "*"],
        ["fields[]", "id"],
        ["fields[]", "text_direction"],
        ["fields[]", "display_names"],
      ],
      deps,
    ),
  ]);

  const byId = new Map<string, RawLanguage>();
  for (const l of rows<RawLanguage>(languages)) {
    if (l.id) byId.set(l.id, l);
  }

  const seen = new Set<string>();
  const out: BibleLanguage[] = [];
  for (const bible of rows<RawBible>(catalogue)) {
    const tag = bible.language_tag;
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);

    const record = byId.get(tag);
    const endonym = record?.display_names?.[tag];
    out.push({
      tag,
      name: record?.display_names?.en ?? endonym ?? intlName(tag),
      ...(endonym ? { endonym } : {}),
      direction:
        record?.text_direction === "rtl"
          ? "rtl"
          : record?.text_direction === "ltr"
            ? "ltr"
            : intlDirection(tag),
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return out;
}

/** Every Bible licensed to us for one language. `[]` on the live 204. */
export async function fetchTranslations(
  languageTag: string,
  deps: YouVersionDeps,
): Promise<BibleTranslation[]> {
  const out: BibleTranslation[] = [];
  let pageToken: string | null = null;

  // `page_size` caps at 50 (100 ⇒ 400), and repeated `language_ranges[]` do not union,
  // so pagination is the only way through a large collection.
  do {
    const params: Array<[string, string]> = [
      ["language_ranges[]", languageTag],
      ["page_size", "50"],
    ];
    if (pageToken) params.push(["page_token", pageToken]);

    const body = await getJson("/v1/bibles", params, deps);
    for (const b of rows<RawBible>(body)) {
      if (b.id === undefined || b.id === null || !b.abbreviation) continue;
      out.push({
        id: String(b.id),
        abbreviation: b.abbreviation,
        title: b.title ?? b.localized_title ?? b.abbreviation,
      });
    }
    pageToken = (body as Collection<RawBible> | null)?.next_page_token ?? null;
  } while (pageToken);

  return out;
}

interface RawBook {
  id?: string;
  title?: string;
  canon?: string;
}

/**
 * The books of one translation, projected to `{usfm,title,canon}`.
 *
 * The upstream payload is 1.59 MB because it nests every chapter and verse, and
 * `fields[]` is ignored on this route — so the projection here is the ONLY thing standing
 * between the browser and that tree. Cached by the route handler.
 */
export async function fetchBooks(
  bibleId: string,
  deps: YouVersionDeps,
): Promise<BibleBookRef[]> {
  const body = await getJson(`/v1/bibles/${encodeURIComponent(bibleId)}/books`, [], deps);
  return rows<RawBook>(body)
    .filter((b): b is RawBook & { id: string } => Boolean(b.id))
    .map((b) => ({
      usfm: b.id,
      title: b.title ?? b.id,
      // Canon is per-translation (27..80 books observed). Never substituted from a
      // local table, and never defaulted to a testament we did not read.
      canon: b.canon ?? "unknown",
    }));
}

interface RawChapter {
  id?: string;
  passage_id?: string;
  title?: string;
}

/** The chapters of one book. `passage_id` is echoed, never rebuilt. */
export async function fetchChapters(
  bibleId: string,
  book: string,
  deps: YouVersionDeps,
): Promise<BibleChapterRef[]> {
  const body = await getJson(
    `/v1/bibles/${encodeURIComponent(bibleId)}/books/${encodeURIComponent(book)}/chapters`,
    [],
    deps,
  );
  return rows<RawChapter>(body)
    .filter((c): c is RawChapter & { id: string; passage_id: string } =>
      Boolean(c.id && c.passage_id),
    )
    .map((c) => ({ id: c.id, passageId: c.passage_id, title: c.title ?? c.id }));
}

/** The verses of one chapter — the genuinely thin upstream route (~1.5 KB). */
export async function fetchVerses(
  bibleId: string,
  book: string,
  chapter: string,
  deps: YouVersionDeps,
): Promise<BibleVerseRef[]> {
  const body = await getJson(
    `/v1/bibles/${encodeURIComponent(bibleId)}/books/${encodeURIComponent(book)}` +
      `/chapters/${encodeURIComponent(chapter)}/verses`,
    [],
    deps,
  );
  return rows<RawChapter>(body)
    .filter((v): v is RawChapter & { id: string; passage_id: string } =>
      Boolean(v.id && v.passage_id),
    )
    .map((v) => ({ id: v.id, passageId: v.passage_id, title: v.title ?? v.id }));
}

/**
 * The verse text. `usfm` MUST be a `passage_id` this client previously handed out —
 * a human reference ("John 3:16") 404s, which is exactly why nothing here builds one.
 * The `reference` string comes back verbatim, bidi control marks and all.
 */
export async function fetchPassage(
  bibleId: string,
  usfm: string,
  deps: YouVersionDeps,
): Promise<BiblePassage> {
  const body = (await getJson(
    `/v1/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(usfm)}`,
    [],
    deps,
  )) as { id?: string; content?: string; reference?: string } | null;

  return {
    passageId: body?.id ?? usfm,
    text: body?.content ?? "",
    reference: body?.reference ?? "",
  };
}
