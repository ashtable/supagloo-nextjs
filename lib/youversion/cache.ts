/**
 * A process-level TTL cache for Bible metadata.
 *
 * Why it exists: `GET /v1/bibles/{id}/books` is **1.59 MB and ~415 ms** per translation
 * (measured 2026-07-27) and `fields[]` is ignored on that route, so the payload cannot be
 * narrowed upstream. Without a cache, every open of the book dropdown would pull it
 * again. The language catalogue is two one-shot requests totalling ~860 KB.
 *
 * Why it is deliberately SMALL and in-memory:
 *  - design-delta §9-Q10 requires bible ids to be "resolved via the collection endpoint at
 *    request time" and forbids hardcoding them. A short-TTL, process-lifetime cache keeps
 *    that true in substance — nothing is ever baked into the build or into a database — in
 *    a way a persisted cache would not.
 *  - The only prior art in the codebase is `supagloo-nodejs-dbos/src/providers/discovery.ts`
 *    (the OpenRouter model catalogue): a `Map`, a TTL, an injectable `now()`, and an
 *    explicit clear for tests. This is the same shape on purpose.
 *
 * In-flight requests are SHARED: the entry stores the promise, so N concurrent readers of
 * a cold key make one upstream call rather than N (which, on the 1.59 MB route, is the
 * difference between one fetch and a self-inflicted stampede). A rejected promise is
 * evicted so a transient upstream failure is retried rather than remembered.
 */

export const BIBLE_CACHE_TTL_MS = 30 * 60_000;

/** A generous ceiling: every cached value is a projected slice of a few KB, so the cap is
 *  about bounding an unbounded key space (any translation × any book × any chapter),
 *  not about bytes. Insertion-ordered eviction — `Map` preserves insertion order. */
export const BIBLE_CACHE_MAX_ENTRIES = 256;

interface Entry {
  expiresAt: number;
  value: Promise<unknown>;
}

const store = new Map<string, Entry>();

export interface CacheDeps {
  /** Injectable clock so TTL expiry is tested without timers. */
  now?: () => number;
  ttlMs?: number;
}

/** Read-through cache. `load` runs at most once per key per TTL. */
export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  deps: CacheDeps = {},
): Promise<T> {
  const now = deps.now ?? Date.now;
  const ttlMs = deps.ttlMs ?? BIBLE_CACHE_TTL_MS;

  const hit = store.get(key);
  if (hit && hit.expiresAt >= now()) return hit.value as Promise<T>;
  if (hit) store.delete(key);

  const value = load();
  store.set(key, { expiresAt: now() + ttlMs, value });

  // Evict oldest-first once over the cap. Done AFTER the insert so the value just
  // written is never the one dropped.
  while (store.size > BIBLE_CACHE_MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }

  try {
    return await value;
  } catch (err) {
    // Never remember a failure — but only drop OUR entry, in case a later write for the
    // same key already replaced it.
    if (store.get(key)?.value === value) store.delete(key);
    throw err;
  }
}

/** Drop everything. Tests only — there is no runtime invalidation trigger. */
export function clearBibleCache(): void {
  store.clear();
}

/** Live entry count. Tests only. */
export function bibleCacheSize(): number {
  return store.size;
}
