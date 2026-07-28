/**
 * The Bible-metadata TTL cache. Modelled on the only prior art in the codebase —
 * `supagloo-nodejs-dbos/src/providers/discovery.ts` (Map + TTL + injectable `now()` +
 * an explicit clear for tests).
 *
 * It exists so the 1.59 MB `/v1/bibles/{id}/books` payload is fetched once per
 * translation per TTL instead of once per dropdown open. It deliberately does NOT
 * persist: §9-Q10 requires bible ids to be resolved from the live collection rather
 * than baked in, and a process-lifetime cache with a short TTL keeps that true.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BIBLE_CACHE_MAX_ENTRIES,
  BIBLE_CACHE_TTL_MS,
  bibleCacheSize,
  cached,
  clearBibleCache,
} from "./cache";

beforeEach(() => {
  clearBibleCache();
});

describe("cached", () => {
  it("U-YC1: a second read of the same key does NOT call the loader again", async () => {
    const load = vi.fn(async () => ["a"]);
    const first = await cached("k", load);
    const second = await cached("k", load);

    expect(first).toEqual(["a"]);
    expect(second).toEqual(["a"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("U-YC1b: distinct keys are distinct entries", async () => {
    await cached("a", async () => 1);
    await cached("b", async () => 2);
    expect(await cached("a", async () => 99)).toBe(1);
    expect(await cached("b", async () => 99)).toBe(2);
  });

  it("U-YC2: an entry expires after the TTL (injected clock, no timers)", async () => {
    let now = 1_000;
    const load = vi.fn(async () => "v");

    await cached("k", load, { now: () => now });
    now += BIBLE_CACHE_TTL_MS - 1;
    await cached("k", load, { now: () => now });
    expect(load).toHaveBeenCalledTimes(1);

    now += 2; // now strictly past the TTL
    await cached("k", load, { now: () => now });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("U-YC3: the entry count is capped — the oldest insert is evicted, never the newest", async () => {
    for (let i = 0; i < BIBLE_CACHE_MAX_ENTRIES; i++) {
      await cached(`k${i}`, async () => i);
    }
    expect(bibleCacheSize()).toBe(BIBLE_CACHE_MAX_ENTRIES);

    await cached("overflow", async () => -1);
    expect(bibleCacheSize()).toBe(BIBLE_CACHE_MAX_ENTRIES);

    // the newest survives...
    const newestLoad = vi.fn(async () => -99);
    expect(await cached("overflow", newestLoad)).toBe(-1);
    expect(newestLoad).not.toHaveBeenCalled();

    // ...and the oldest was the one dropped
    const oldestLoad = vi.fn(async () => -99);
    expect(await cached("k0", oldestLoad)).toBe(-99);
    expect(oldestLoad).toHaveBeenCalledTimes(1);
  });

  it("U-YC4: a REJECTED load is not cached — the next read retries", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("upstream 500"))
      .mockResolvedValueOnce("ok");

    await expect(cached("k", load)).rejects.toThrow("upstream 500");
    expect(bibleCacheSize()).toBe(0);
    await expect(cached("k", load)).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("U-YC5: concurrent readers of a cold key share ONE load (no thundering herd on a 1.59 MB fetch)", async () => {
    let resolve!: (v: string) => void;
    const load = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );

    const a = cached("k", load);
    const b = cached("k", load);
    resolve("shared");

    expect(await a).toBe("shared");
    expect(await b).toBe("shared");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
