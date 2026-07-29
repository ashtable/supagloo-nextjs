/**
 * The landing page's demo video — fetching its short-lived playback URL.
 *
 * The mp4 lives in the private Railway bucket (Railway Buckets have no public URLs at
 * all), so playback goes through a 120-second presigned GET issued by
 * `GET /api/demo/stream-url` → `GET /v1/demo/stream-url`. Nothing is sent with the
 * request: the upstream signs a compile-time constant key, and a caller-supplied key on an
 * unauthenticated presigner would sign any object in the bucket for anyone.
 */

/** The BFF route. A constant so the component and its tests cannot drift apart. */
export const DEMO_STREAM_URL_PATH = "/api/demo/stream-url";

export interface DemoStreamDeps {
  fetchImpl?: typeof fetch;
}

/**
 * Fetch a playable URL for the demo video, or null if one could not be obtained.
 *
 * NULL RATHER THAN THROWING, because every caller is a click handler on a marketing page:
 * there is nothing useful to do with an exception, and an unhandled one in an event
 * handler is worse than a visible "couldn't load" state. The distinction between "offline",
 * "500" and "malformed body" is not actionable by a visitor, so all three collapse here —
 * and the modal says the same honest sentence for each.
 */
export async function fetchDemoStreamUrl(
  deps: DemoStreamDeps = {},
): Promise<string | null> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(DEMO_STREAM_URL_PATH, { cache: "no-store" });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const url = (body as { url?: unknown } | null)?.url;
    return typeof url === "string" && url.length > 0 ? url : null;
  } catch {
    return null;
  }
}
