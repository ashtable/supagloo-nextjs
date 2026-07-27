import { describe, expect, it, vi } from "vitest";

/**
 * Row 41 — the gallery FETCH layer (plan §5.5 U-D1…U-D5).
 *
 * RED until `./gallery-data` ships. Same discipline as `lib/studio/render-data.ts`:
 * an injectable `fetchImpl`, a `safeParse` against the wire contracts, and **it never
 * throws** — every failure (non-2xx, non-JSON body, schema-violating payload, a
 * rejected network call) becomes a `null`/`[]`/`false` the caller maps to an honest UI
 * state. Zero network in this file.
 *
 * Why the never-throws rule matters more here than anywhere else in the app: `/gallery`
 * is the one PUBLIC page, reachable by an anonymous visitor with a stale cookie, and a
 * thrown parse error inside a client effect is an error boundary — a blank page instead
 * of a gallery.
 */
import {
  PUBLISH_FALLBACK_MESSAGE,
  fetchGalleryItem,
  fetchGalleryPage,
  fetchMyProjects,
  fetchMyRenders,
  fetchStreamUrl,
  publishRenderToGallery,
  removeUpvote,
  sendUpvote,
  unpublishGalleryItem,
} from "./gallery-data";

// ── fixtures: verbatim copies of the API's payload shapes ────────────────────

const ITEM = {
  id: "gal_1",
  renderJobId: "rj_1",
  projectId: "prj_1",
  title: "Wilderness",
  description: "Forty days.",
  scriptureReference: "Matthew 4:1-11",
  scriptureBook: "MAT",
  translation: "BSB",
  durationSeconds: 83,
  visibility: "public" as const,
  publishedAt: "2026-07-26T10:00:00.000Z",
  upvoteCount: 41,
  thumbnailUrl: "http://localhost:9000/supagloo-dev/renders/rj_1/thumb.jpg?X-Amz-Signature=x",
  rank: 1,
  viewerHasUpvoted: false,
  owner: { displayName: "Grace Hopper", avatarInitials: "GH" },
};

/** Verbatim copy of `GET /v1/gallery/:id`'s item — the card DTO plus the two fields
 *  only the watch page pays for: the manifest snapshot and the owner's public count. */
const DETAIL_ITEM = {
  ...ITEM,
  owner: { displayName: "Grace Hopper", avatarInitials: "GH", publicVideoCount: 14 },
  makingOf: {
    version: 1,
    capturedAt: "2026-07-26T09:59:00.000Z",
    scriptureText: "In the beginning God created the heaven and the earth.",
    narratorVoiceLabel: "Dramatic baritone",
    musicStyle: "Orchestral",
    captionsOn: true,
    scenes: [
      { index: 1, name: "Void", durationSeconds: 7 },
      { index: 2, name: "Deep", durationSeconds: 8 },
    ],
  },
};

const RENDER = {
  id: "rj_1",
  projectId: "prj_1",
  versionId: "ver_1",
  status: "completed" as const,
  framesDone: 900,
  framesTotal: 900,
  outputSpec: {
    width: 1080,
    height: 1920,
    fps: 30,
    aspectRatio: "9:16",
    codec: "h264",
  },
  outputAssetKey: "renders/rj_1/output.mp4",
  thumbnailAssetKey: "renders/rj_1/thumb.jpg",
  runInBackground: false,
  error: null,
  createdAt: "2026-07-26T09:00:00.000Z",
  startedAt: "2026-07-26T09:00:01.000Z",
  completedAt: "2026-07-26T09:00:30.000Z",
};

/** A `ProjectDto` as `GET /api/projects` returns it — 16b's PROJECT ▾ joins these onto
 *  the renders to build the `<slug> · v<semver>` label. */
const PROJECT = {
  id: "prj_1",
  slug: "psalm-121",
  name: "Psalm 121",
  repoOwner: "ashsrinivas",
  repoName: "psalm-121",
  repoVisibility: "private" as const,
  createdFrom: "blank" as const,
  currentBranch: "v0.0.2",
  thumbnailAssetKey: null,
  lastRenderJobId: null,
  lastOpenedAt: "2026-07-26T09:00:00.000Z",
  createdAt: "2026-07-01T09:00:00.000Z",
};

/** A `fetch` stand-in that records its calls and answers with one canned response. */
function stubFetch(
  response: { status?: number; json?: unknown; text?: string } = {},
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const status = response.status ?? 200;
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (response.text !== undefined) throw new SyntaxError("Unexpected token");
        return response.json;
      },
    } as unknown as Response;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

/** A `fetch` stand-in that REJECTS, i.e. the network is gone. */
const rejectingFetch = (() =>
  Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;

// ── U-D1 / U-D2 / U-D3: fetchGalleryPage ─────────────────────────────────────

describe("U-D1 fetchGalleryPage", () => {
  it("parses a valid `{items, nextCursor}` envelope", async () => {
    const { fetchImpl } = stubFetch({
      json: { items: [ITEM], nextCursor: "cur_2" },
    });
    const page = await fetchGalleryPage(
      { sort: "popular", q: "", cursor: null },
      { fetchImpl },
    );
    expect(page).not.toBeNull();
    expect(page!.items).toHaveLength(1);
    expect(page!.items[0].title).toBe("Wilderness");
    expect(page!.nextCursor).toBe("cur_2");
  });

  it("accepts `nextCursor: null` (exhausted) without complaint", async () => {
    const { fetchImpl } = stubFetch({ json: { items: [], nextCursor: null } });
    const page = await fetchGalleryPage(
      { sort: "newest", q: "", cursor: null },
      { fetchImpl },
    );
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it("returns null — NEVER throws — on a schema-violating payload", async () => {
    // A bare array is the classic wrong shape (the API deliberately envelopes).
    const { fetchImpl } = stubFetch({ json: [ITEM] });
    await expect(
      fetchGalleryPage({ sort: "popular", q: "", cursor: null }, { fetchImpl }),
    ).resolves.toBeNull();
  });

  it("returns null on an item missing a required field", async () => {
    const { title: _drop, ...broken } = ITEM;
    void _drop;
    const { fetchImpl } = stubFetch({ json: { items: [broken], nextCursor: null } });
    await expect(
      fetchGalleryPage({ sort: "popular", q: "", cursor: null }, { fetchImpl }),
    ).resolves.toBeNull();
  });

  it("returns null on a NON-JSON body (an HTML error page)", async () => {
    const { fetchImpl } = stubFetch({ text: "<!doctype html><h1>502</h1>" });
    await expect(
      fetchGalleryPage({ sort: "popular", q: "", cursor: null }, { fetchImpl }),
    ).resolves.toBeNull();
  });
});

describe("U-D2 fetchGalleryPage failure modes", () => {
  it("returns null on a 500", async () => {
    const { fetchImpl } = stubFetch({ status: 500, json: { error: "internal" } });
    await expect(
      fetchGalleryPage({ sort: "popular", q: "", cursor: null }, { fetchImpl }),
    ).resolves.toBeNull();
  });

  it("returns null on a 400 invalid_cursor", async () => {
    const { fetchImpl } = stubFetch({ status: 400, json: { error: "invalid_cursor" } });
    await expect(
      fetchGalleryPage({ sort: "popular", q: "", cursor: "forged" }, { fetchImpl }),
    ).resolves.toBeNull();
  });

  it("returns null when the network rejects outright", async () => {
    await expect(
      fetchGalleryPage(
        { sort: "popular", q: "", cursor: null },
        { fetchImpl: rejectingFetch },
      ),
    ).resolves.toBeNull();
  });
});

describe("U-D3 fetchGalleryPage request URL", () => {
  it("hits the BFF proxy with the query built by buildGalleryQuery", async () => {
    const { fetchImpl, calls } = stubFetch({ json: { items: [], nextCursor: null } });
    await fetchGalleryPage(
      { sort: "trending", q: "a&b", cursor: "cur_2" },
      { fetchImpl },
    );
    expect(calls[0].url).toBe("/api/gallery?sort=trending&q=a%26b&cursor=cur_2");
  });

  it("never sends a book parameter (§5.2 — the book filter does not exist)", async () => {
    const { fetchImpl, calls } = stubFetch({ json: { items: [], nextCursor: null } });
    await fetchGalleryPage({ sort: "popular", q: "genesis", cursor: null }, { fetchImpl });
    expect(calls[0].url).not.toContain("book");
  });

  it("reads uncached — the listing is vote-state-dependent", async () => {
    const { fetchImpl, calls } = stubFetch({ json: { items: [], nextCursor: null } });
    await fetchGalleryPage({ sort: "popular", q: "", cursor: null }, { fetchImpl });
    expect(calls[0].init?.cache).toBe("no-store");
  });
});

// ── U-D5: fetchStreamUrl ─────────────────────────────────────────────────────

describe("U-D5 fetchStreamUrl", () => {
  it("parses `{ url, expiresAt }`", async () => {
    const { fetchImpl, calls } = stubFetch({
      json: {
        url: "http://localhost:9000/supagloo-dev/renders/rj_1/output.mp4?X-Amz-Signature=x",
        expiresAt: "2026-07-26T10:02:00.000Z",
      },
    });
    const signed = await fetchStreamUrl("gal_1", { fetchImpl });
    expect(signed?.url).toContain("X-Amz-Signature");
    expect(signed?.expiresAt).toBe("2026-07-26T10:02:00.000Z");
    expect(calls[0].url).toBe("/api/gallery/gal_1/stream-url");
  });

  it("returns null on a malformed body", async () => {
    const { fetchImpl } = stubFetch({ json: { url: 42 } });
    await expect(fetchStreamUrl("gal_1", { fetchImpl })).resolves.toBeNull();
  });

  it("returns null on a non-JSON body, a 404 and a rejection", async () => {
    await expect(
      fetchStreamUrl("gal_1", { fetchImpl: stubFetch({ text: "boom" }).fetchImpl }),
    ).resolves.toBeNull();
    await expect(
      fetchStreamUrl("gal_1", { fetchImpl: stubFetch({ status: 404, json: {} }).fetchImpl }),
    ).resolves.toBeNull();
    await expect(
      fetchStreamUrl("gal_1", { fetchImpl: rejectingFetch }),
    ).resolves.toBeNull();
  });
});

// ── U-D4: sendUpvote / removeUpvote ──────────────────────────────────────────

describe("U-D4 sendUpvote / removeUpvote", () => {
  it("sendUpvote POSTs and returns the server's re-read item", async () => {
    const voted = { ...ITEM, upvoteCount: 42, viewerHasUpvoted: true };
    const { fetchImpl, calls } = stubFetch({ json: { item: voted } });
    const item = await sendUpvote("gal_1", { fetchImpl });
    expect(calls[0].url).toBe("/api/gallery/gal_1/upvote");
    expect(calls[0].init?.method).toBe("POST");
    expect(item?.upvoteCount).toBe(42);
    expect(item?.viewerHasUpvoted).toBe(true);
  });

  it("removeUpvote DELETEs and returns the server's re-read item", async () => {
    const { fetchImpl, calls } = stubFetch({ json: { item: ITEM } });
    const item = await removeUpvote("gal_1", { fetchImpl });
    expect(calls[0].url).toBe("/api/gallery/gal_1/upvote");
    expect(calls[0].init?.method).toBe("DELETE");
    expect(item?.viewerHasUpvoted).toBe(false);
  });

  it("both return null on a 401 (the session expired mid-session)", async () => {
    const unauth = stubFetch({ status: 401, json: { error: "unauthorized" } });
    await expect(sendUpvote("gal_1", { fetchImpl: unauth.fetchImpl })).resolves.toBeNull();
    await expect(
      removeUpvote("gal_1", { fetchImpl: unauth.fetchImpl }),
    ).resolves.toBeNull();
  });

  it("both return null on a malformed body and on a rejection", async () => {
    const bad = stubFetch({ json: { item: { id: "gal_1" } } });
    await expect(sendUpvote("gal_1", { fetchImpl: bad.fetchImpl })).resolves.toBeNull();
    await expect(
      removeUpvote("gal_1", { fetchImpl: rejectingFetch }),
    ).resolves.toBeNull();
  });
});

// ── publishRenderToGallery / unpublishGalleryItem ────────────────────────────

describe("publishRenderToGallery", () => {
  const body = {
    title: "Wilderness",
    description: "Forty days.",
    scriptureReference: "Matthew 4:1-11",
    translation: "BSB",
    visibility: "public" as const,
  };

  it("POSTs the publish body to the render-scoped route and returns the 201 item", async () => {
    const { fetchImpl, calls } = stubFetch({ status: 201, json: { item: ITEM } });
    const outcome = await publishRenderToGallery("rj_1", body, { fetchImpl });
    expect(calls[0].url).toBe("/api/renders/rj_1/gallery");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(body);
    expect(outcome).toEqual({ ok: true, item: expect.objectContaining({ id: "gal_1" }) });
  });

  /**
   * The ONE mutating call here that does not collapse to `null` (slice C8).
   *
   * The api distinguishes three publish refusals and the BFF passes status + body
   * through verbatim; flattening them into a house sentence would discard the only
   * thing that tells the user what to do — "already published" and "we can't tell which
   * book that is" have completely different fixes.
   */
  it("carries the api's own refusal message through, per refusal", async () => {
    const refusals = [
      { status: 409, error: "already_published", message: "render is already published to the gallery" },
      { status: 409, error: "render_not_publishable", message: "render is not publishable" },
      { status: 422, error: "scripture_book_underivable", message: "cannot derive a scripture book from the reference" },
    ];
    for (const refusal of refusals) {
      const { fetchImpl } = stubFetch({
        status: refusal.status,
        json: { error: refusal.error, message: refusal.message },
      });
      await expect(
        publishRenderToGallery("rj_1", body, { fetchImpl }),
      ).resolves.toEqual({ ok: false, message: refusal.message });
    }
  });

  it("falls back to the machine code when there is no prose, and to a house sentence when there is neither", async () => {
    // A searchable code still beats "something went wrong".
    await expect(
      publishRenderToGallery("rj_1", body, {
        fetchImpl: stubFetch({ status: 409, json: { error: "already_published" } }).fetchImpl,
      }),
    ).resolves.toEqual({ ok: false, message: "already_published" });

    // A 502 from the proxy, an HTML error page, a dead network: no envelope at all.
    for (const fetchImpl of [
      stubFetch({ status: 500, json: {} }).fetchImpl,
      stubFetch({ status: 502, json: null }).fetchImpl,
      rejectingFetch,
    ]) {
      const outcome = await publishRenderToGallery("rj_1", body, { fetchImpl });
      expect(outcome).toEqual({ ok: false, message: PUBLISH_FALLBACK_MESSAGE });
    }

    // A 201 whose body is NOT a gallery item is a failure, not a silent success.
    await expect(
      publishRenderToGallery("rj_1", body, {
        fetchImpl: stubFetch({ status: 201, json: { item: { id: "gal_1" } } }).fetchImpl,
      }),
    ).resolves.toEqual({ ok: false, message: PUBLISH_FALLBACK_MESSAGE });
  });
});

// ── fetchMyProjects — 16b's PROJECT ▾ join (slice C8) ────────────────────────

describe("fetchMyProjects", () => {
  it("GETs the uncached project list and unwraps `{ projects }`", async () => {
    const { fetchImpl, calls } = stubFetch({ json: { projects: [PROJECT] } });
    await expect(fetchMyProjects({ fetchImpl })).resolves.toEqual([PROJECT]);
    expect(calls[0].url).toBe("/api/projects");
    expect(calls[0].init?.cache).toBe("no-store");
  });

  it("returns [] on a 401, a malformed body and a rejection — a naming call must never hide a publishable render", async () => {
    for (const fetchImpl of [
      stubFetch({ status: 401, json: { error: "unauthorized" } }).fetchImpl,
      stubFetch({ json: { projects: [{ id: "p1" }] } }).fetchImpl,
      rejectingFetch,
    ]) {
      await expect(fetchMyProjects({ fetchImpl })).resolves.toEqual([]);
    }
  });
});

describe("unpublishGalleryItem", () => {
  it("DELETEs the item and reports true on `{ ok: true }`", async () => {
    const { fetchImpl, calls } = stubFetch({ json: { ok: true } });
    await expect(unpublishGalleryItem("gal_1", { fetchImpl })).resolves.toBe(true);
    expect(calls[0].url).toBe("/api/gallery/gal_1");
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("reports false on a 404, a malformed body and a rejection", async () => {
    await expect(
      unpublishGalleryItem("gal_1", {
        fetchImpl: stubFetch({ status: 404, json: {} }).fetchImpl,
      }),
    ).resolves.toBe(false);
    await expect(
      unpublishGalleryItem("gal_1", { fetchImpl: stubFetch({ json: { ok: false } }).fetchImpl }),
    ).resolves.toBe(false);
    await expect(
      unpublishGalleryItem("gal_1", { fetchImpl: rejectingFetch }),
    ).resolves.toBe(false);
  });
});

// ── fetchMyRenders ("Your videos") ───────────────────────────────────────────

describe("fetchMyRenders", () => {
  it("GETs /api/renders?mine=1 and unwraps `{ renders }`", async () => {
    const { fetchImpl, calls } = stubFetch({ json: { renders: [RENDER] } });
    const renders = await fetchMyRenders({ fetchImpl });
    expect(calls[0].url).toBe("/api/renders?mine=1");
    expect(renders).toHaveLength(1);
    expect(renders[0].id).toBe("rj_1");
  });

  it("returns [] — never null, never a throw — on a 401, a bad shape and a rejection", async () => {
    await expect(
      fetchMyRenders({ fetchImpl: stubFetch({ status: 401, json: {} }).fetchImpl }),
    ).resolves.toEqual([]);
    await expect(
      fetchMyRenders({ fetchImpl: stubFetch({ json: { renders: [{ id: "x" }] } }).fetchImpl }),
    ).resolves.toEqual([]);
    await expect(
      fetchMyRenders({ fetchImpl: stubFetch({ text: "<html>" }).fetchImpl }),
    ).resolves.toEqual([]);
    await expect(fetchMyRenders({ fetchImpl: rejectingFetch })).resolves.toEqual([]);
  });
});

// ── U-FGI1…U-FGI4: fetchGalleryItem (Turn 16a, slice C4) ─────────────────────
//
// The single-item read, back after row 41 deliberately deleted it. Its own docblock
// named the condition for its return — "if a detail page is ever designed" — and Turn
// 16a is that page. It obeys the same never-throws contract as every sibling: `/gallery`
// and `/gallery/:id` are the app's only PUBLIC pages, and a thrown parse error inside a
// client effect is a blank screen, not an error message.

describe("U-FGI1 fetchGalleryItem", () => {
  it("GETs /api/gallery/:id and returns the parsed DETAIL item on 200", async () => {
    const { fetchImpl, calls } = stubFetch({ json: { item: DETAIL_ITEM } });
    const item = await fetchGalleryItem("gal_1", { fetchImpl });

    expect(calls[0].url).toBe("/api/gallery/gal_1");
    expect(item).not.toBeNull();
    expect(item!.title).toBe("Wilderness");
    // The two fields a CARD does not carry — the whole reason this DTO is separate.
    expect(item!.owner.publicVideoCount).toBe(14);
    expect(item!.makingOf?.scenes).toHaveLength(2);
    expect(item!.makingOf?.scenes[1]).toEqual({
      index: 2,
      name: "Deep",
      durationSeconds: 8,
    });
  });

  it("percent-encodes the id (it lands in the path, not a query value)", async () => {
    const { fetchImpl, calls } = stubFetch({ json: { item: DETAIL_ITEM } });
    await fetchGalleryItem("gal/../secret", { fetchImpl });
    expect(calls[0].url).toBe("/api/gallery/gal%2F..%2Fsecret");
  });

  it("is UNCACHED — the response carries the viewer's own vote state", async () => {
    // A cached detail response would render somebody else's pill, exactly as it would
    // in the listing (`fetchGalleryPage` makes the same call for the same reason).
    const { fetchImpl, calls } = stubFetch({ json: { item: DETAIL_ITEM } });
    await fetchGalleryItem("gal_1", { fetchImpl });
    expect((calls[0].init as RequestInit | undefined)?.cache).toBe("no-store");
  });
});

describe("U-FGI2 fetchGalleryItem never throws", () => {
  it("returns null on a 404 (unknown id — the API denies uniformly)", async () => {
    const { fetchImpl } = stubFetch({ status: 404, json: { error: "not_found" } });
    await expect(fetchGalleryItem("nope", { fetchImpl })).resolves.toBeNull();
  });

  it("returns null on a 500 and on a dead network", async () => {
    await expect(
      fetchGalleryItem("gal_1", {
        fetchImpl: stubFetch({ status: 500, json: {} }).fetchImpl,
      }),
    ).resolves.toBeNull();
    await expect(
      fetchGalleryItem("gal_1", { fetchImpl: rejectingFetch }),
    ).resolves.toBeNull();
  });

  it("returns null on a NON-JSON body (an HTML error page from a proxy)", async () => {
    const { fetchImpl } = stubFetch({ text: "<!doctype html><h1>502</h1>" });
    await expect(fetchGalleryItem("gal_1", { fetchImpl })).resolves.toBeNull();
  });
});

describe("U-FGI3 fetchGalleryItem degrades on wire drift", () => {
  it("returns null — not a half-parsed object — when the body fails the detail schema", async () => {
    // A CARD payload is the realistic drift: it is a valid gallery item and would
    // parse under the listing's schema, but it carries no `makingOf` and no
    // `publicVideoCount`. Accepting it would render `undefined public videos`.
    const { fetchImpl } = stubFetch({ json: { item: ITEM } });
    await expect(fetchGalleryItem("gal_1", { fetchImpl })).resolves.toBeNull();
  });

  it("returns null on a bare item (no `{ item }` envelope)", async () => {
    const { fetchImpl } = stubFetch({ json: DETAIL_ITEM });
    await expect(fetchGalleryItem("gal_1", { fetchImpl })).resolves.toBeNull();
  });

  it("returns null on a makingOf whose version is not the literal 1", async () => {
    // The version literal is the whole point of carrying a version: a v2 snapshot
    // half-read by this reader would render a confident lie.
    const { fetchImpl } = stubFetch({
      json: {
        item: { ...DETAIL_ITEM, makingOf: { ...DETAIL_ITEM.makingOf, version: 2 } },
      },
    });
    await expect(fetchGalleryItem("gal_1", { fetchImpl })).resolves.toBeNull();
  });
});

describe("U-FGI4 fetchGalleryItem and the pre-existing row", () => {
  it("parses an item whose makingOf is null", async () => {
    // Every item published before the snapshot column existed reads back null, and so
    // does any publish whose best-effort manifest read failed. It is a permanent,
    // first-class case — the page omits those sections rather than erroring.
    const { fetchImpl } = stubFetch({
      json: { item: { ...DETAIL_ITEM, makingOf: null } },
    });
    const item = await fetchGalleryItem("gal_1", { fetchImpl });
    expect(item).not.toBeNull();
    expect(item!.makingOf).toBeNull();
    expect(item!.owner.publicVideoCount).toBe(14);
  });

  it("REQUIRES the makingOf key — an omitted key is drift, not an empty snapshot", async () => {
    const { makingOf: _omit, ...noKey } = DETAIL_ITEM;
    void _omit;
    const { fetchImpl } = stubFetch({ json: { item: noKey } });
    await expect(fetchGalleryItem("gal_1", { fetchImpl })).resolves.toBeNull();
  });
});
