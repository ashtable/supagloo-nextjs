/**
 * The gallery FETCH layer (Row 41, plan §5.2). Mirrors `lib/studio/render-data.ts`:
 * an injectable `fetchImpl`, a `safeParse` against the wire contracts, and **it never
 * throws** — every failure becomes a `null`/`[]`/`false` the caller maps to an honest
 * UI state.
 *
 * The never-throws rule matters more here than anywhere else in the app. `/gallery` is
 * the one PUBLIC page: it is reachable by an anonymous visitor, and by a returning one
 * holding a stale cookie (which the API deliberately degrades to anonymous rather than
 * 401-ing). A thrown parse error inside a client effect is an error boundary — a blank
 * page instead of a gallery.
 *
 * Everything goes through the BFF (`/api/gallery…`), never straight at the API: the
 * browser has no API URL and there is no CORS policy. `forwardToApi` already omits the
 * `Authorization` header when the session cookie is absent, so anonymous browsing rides
 * the existing proxy unchanged — anonymous is the natural path here, not a special case.
 */
import {
  GalleryDeleteResponseSchema,
  GalleryItemDetailResponseSchema,
  GalleryItemResponseSchema,
  GalleryListResponseSchema,
  GalleryStreamUrlResponseSchema,
  ProjectListResponseSchema,
  RenderJobListResponseSchema,
  type GalleryItemDetailDto,
  type GalleryItemDto,
  type GalleryListResponse,
  type GalleryStreamUrlResponse,
  type ProjectDto,
  type PublishGalleryItemRequest,
  type RenderJobDto,
} from "../api/contracts";
import { buildGalleryQuery, type GalleryQueryParams } from "./gallery-model";

interface FetchDep {
  fetchImpl?: typeof fetch;
}
const doFetchOf = (deps: FetchDep) => deps.fetchImpl ?? fetch;

/** Read a JSON body without ever letting a non-JSON payload (an HTML error page from a
 *  proxy, an empty body) escape as a throw. */
async function readJson(res: Response): Promise<unknown | undefined> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/** `GET /api/gallery?sort=&q=&cursor=` → one page, or null on ANY failure.
 *
 *  Uncached: the listing carries the viewer's own vote state, so a cached response
 *  would render somebody else's pill. */
export async function fetchGalleryPage(
  params: GalleryQueryParams,
  deps: FetchDep = {},
): Promise<GalleryListResponse | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/gallery?${buildGalleryQuery(params)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const parsed = GalleryListResponseSchema.safeParse(await readJson(res));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * `GET /api/gallery/:id` → ONE item's watch-page detail, or null on ANY failure.
 *
 * This function and its BFF route were both deleted in row 41, and the deletion said
 * exactly what would bring them back: *"if a detail page is ever designed"*. Turn 16a
 * is that page, so they are back — five lines each, as promised, rather than the dead
 * code they were.
 *
 * It parses against the DETAIL schema, not the card one, and that is load-bearing: the
 * realistic wire drift here is being handed a card DTO (a perfectly valid gallery item,
 * missing `makingOf` and `owner.publicVideoCount`), which would otherwise render
 * `undefined public videos` on a public page. A body that fails the detail shape is a
 * `null` and a not-found state, never a half-parsed object.
 *
 * Uncached for the same reason the listing is: the response carries the viewer's own
 * `viewerHasUpvoted`, so a cached one would render somebody else's pill.
 */
export async function fetchGalleryItem(
  id: string,
  deps: FetchDep = {},
): Promise<GalleryItemDetailDto | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/gallery/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const parsed = GalleryItemDetailResponseSchema.safeParse(await readJson(res));
    return parsed.success ? parsed.data.item : null;
  } catch {
    return null;
  }
}

/** `GET /api/gallery/:id/stream-url` → a 120s presigned GET for the mp4, or null.
 *
 *  Its ONE caller is now the watch page (`/gallery/[id]`), which is also the only
 *  surface a viewer sits on for longer than the presign lives — so that page re-signs on
 *  a schedule rather than assuming one URL lasts a session.
 *
 *  NOTE for anyone debugging a silent player: this endpoint signs LOCALLY, so it
 *  answers 200 whether or not the object exists. A missing object shows up only as a
 *  `<video>` stuck at `readyState === 0`, never as an error here. */
export async function fetchStreamUrl(
  id: string,
  deps: FetchDep = {},
): Promise<GalleryStreamUrlResponse | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/gallery/${encodeURIComponent(id)}/stream-url`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const parsed = GalleryStreamUrlResponseSchema.safeParse(await readJson(res));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** `POST /api/gallery/:id/upvote` → the server's RE-READ item (count and
 *  `viewerHasUpvoted` after the transaction), or null on a 401 / any failure. */
export async function sendUpvote(
  id: string,
  deps: FetchDep = {},
): Promise<GalleryItemDto | null> {
  return itemRequest(
    `/api/gallery/${encodeURIComponent(id)}/upvote`,
    "POST",
    undefined,
    deps,
  );
}

/** `DELETE /api/gallery/:id/upvote` → the server's re-read item, or null. */
export async function removeUpvote(
  id: string,
  deps: FetchDep = {},
): Promise<GalleryItemDto | null> {
  return itemRequest(
    `/api/gallery/${encodeURIComponent(id)}/upvote`,
    "DELETE",
    undefined,
    deps,
  );
}

/**
 * The publish call's two outcomes, kept DISTINGUISHABLE all the way to the dialog.
 *
 * This is the one mutating call in this module that does not collapse a failure to
 * `null`, and the reason is specific: the api answers a publish refusal with three
 * different, individually actionable messages (`render_not_publishable`,
 * `already_published`, `scripture_book_underivable`), the BFF passes status + body
 * through verbatim, and a dialog that flattened all three into one house sentence would
 * throw away the only thing that tells the user what to do next. "That didn't publish"
 * is not a reason.
 */
export type PublishOutcome =
  | { ok: true; item: GalleryItemDto }
  | { ok: false; message: string };

/** What we say when the api said nothing usable (a dead upstream, an HTML error page,
 *  a body that is not the error envelope). Deliberately actionable, not an apology. */
export const PUBLISH_FALLBACK_MESSAGE =
  "That didn't publish. Check the title and passage, then try again.";

/** `POST /api/renders/:id/gallery` → the new 201 item, or the api's own refusal message
 *  (409 already published, 409 not publishable, 422 underivable book, anything else). */
export async function publishRenderToGallery(
  renderJobId: string,
  body: PublishGalleryItemRequest,
  deps: FetchDep = {},
): Promise<PublishOutcome> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(
      `/api/renders/${encodeURIComponent(renderJobId)}/gallery`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = await readJson(res);
    if (!res.ok) return { ok: false, message: errorMessageOf(payload) };
    const parsed = GalleryItemResponseSchema.safeParse(payload);
    return parsed.success
      ? { ok: true, item: parsed.data.item }
      : { ok: false, message: PUBLISH_FALLBACK_MESSAGE };
  } catch {
    return { ok: false, message: PUBLISH_FALLBACK_MESSAGE };
  }
}

/** Pull the api's `message` out of its error envelope. Falls back to the machine `error`
 *  code only when there is no prose — a bare code is still more informative than a
 *  house sentence, because it is searchable. */
function errorMessageOf(payload: unknown): string {
  if (!payload || typeof payload !== "object") return PUBLISH_FALLBACK_MESSAGE;
  const body = payload as { message?: unknown; error?: unknown };
  if (typeof body.message === "string" && body.message.trim().length > 0) {
    return body.message;
  }
  if (typeof body.error === "string" && body.error.trim().length > 0) {
    return body.error;
  }
  return PUBLISH_FALLBACK_MESSAGE;
}

/** `DELETE /api/gallery/:id` → true only on a real `{ ok: true }`. Un-publishing frees
 *  the render's unique gallery slot; the S3 objects are NOT reclaimed. */
export async function unpublishGalleryItem(
  id: string,
  deps: FetchDep = {},
): Promise<boolean> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/gallery/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) return false;
    return GalleryDeleteResponseSchema.safeParse(await readJson(res)).success;
  } catch {
    return false;
  }
}

/** `GET /api/renders?mine=1` → "Your videos". Returns `[]` — never null, never a throw
 *  — on a 401 / a bad shape / a dead network, because an empty library and an
 *  unreachable API render the same honest empty state. */
export async function fetchMyRenders(deps: FetchDep = {}): Promise<RenderJobDto[]> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch("/api/renders?mine=1", { cache: "no-store" });
    if (!res.ok) return [];
    const parsed = RenderJobListResponseSchema.safeParse(await readJson(res));
    return parsed.success ? parsed.data.renders : [];
  } catch {
    return [];
  }
}

/**
 * `GET /api/projects` → the caller's projects. `[]` — never null, never a throw — on any
 * failure, for the same reason `fetchMyRenders` returns `[]`: 16b's PROJECT picker joins
 * these onto the renders purely to NAME them, so an unreachable list must degrade the
 * labels, never the list of publishable renders (`buildProjectOptions` falls back to the
 * project id). A publishable render disappearing because a naming call failed would be
 * the worse failure by far.
 */
export async function fetchMyProjects(deps: FetchDep = {}): Promise<ProjectDto[]> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch("/api/projects", { cache: "no-store" });
    if (!res.ok) return [];
    const parsed = ProjectListResponseSchema.safeParse(await readJson(res));
    return parsed.success ? parsed.data.projects : [];
  } catch {
    return [];
  }
}

/** The shared `{ item }`-envelope request the MUTATING single-item routes use.
 *
 *  All three callers mutate, so there is no cache branch here — a POST/DELETE has
 *  nothing to cache. The one GET that reads a single item, `fetchGalleryItem`, does not
 *  go through this helper at all: it parses the wider DETAIL schema and passes
 *  `cache: "no-store"` itself. (An earlier revision of this docblock said the GET no
 *  longer existed; Turn 16a's watch page brought it back.) */
async function itemRequest(
  url: string,
  method: "POST" | "DELETE",
  body: unknown,
  deps: FetchDep,
): Promise<GalleryItemDto | null> {
  const doFetch = doFetchOf(deps);
  try {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const res = await doFetch(url, init);
    if (!res.ok) return null;
    const parsed = GalleryItemResponseSchema.safeParse(await readJson(res));
    return parsed.success ? parsed.data.item : null;
  } catch {
    return null;
  }
}
