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
  GalleryItemResponseSchema,
  GalleryListResponseSchema,
  GalleryStreamUrlResponseSchema,
  RenderJobListResponseSchema,
  type GalleryItemDto,
  type GalleryListResponse,
  type GalleryStreamUrlResponse,
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

/** `GET /api/gallery/:id` → the item (unwraps `{ item }`), or null. */
export async function fetchGalleryItem(
  id: string,
  deps: FetchDep = {},
): Promise<GalleryItemDto | null> {
  return itemRequest(`/api/gallery/${encodeURIComponent(id)}`, "GET", undefined, deps);
}

/** `GET /api/gallery/:id/stream-url` → a 120s presigned GET for the mp4, or null.
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

/** `POST /api/renders/:id/gallery` → the new 201 item, or null (409 already published,
 *  409 not publishable, 422 underivable book, anything else). */
export async function publishRenderToGallery(
  renderJobId: string,
  body: PublishGalleryItemRequest,
  deps: FetchDep = {},
): Promise<GalleryItemDto | null> {
  return itemRequest(
    `/api/renders/${encodeURIComponent(renderJobId)}/gallery`,
    "POST",
    body,
    deps,
  );
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

/** The shared `{ item }`-envelope request every single-item route uses. */
async function itemRequest(
  url: string,
  method: string,
  body: unknown,
  deps: FetchDep,
): Promise<GalleryItemDto | null> {
  const doFetch = doFetchOf(deps);
  try {
    const init: RequestInit =
      method === "GET" ? { cache: "no-store" } : { method };
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
