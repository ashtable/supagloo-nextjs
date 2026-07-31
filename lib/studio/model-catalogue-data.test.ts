import { describe, expect, it } from "vitest";

import { fetchModelCatalogue } from "./model-catalogue-data";

/**
 * U-MC12 — the studio's data-layer read of `GET /api/ai/models`.
 *
 * Same contract as every other reader in `lib/studio/`: injectable `fetch`, Zod-parse
 * against the wire schema, **return null on any failure, never throw**. That convention
 * exists because these run inside client components — a throw takes the editor down, and
 * the model picker is not worth the editor.
 */

const OK = {
  models: [
    {
      id: "vendor/img",
      provider: "openrouter",
      label: "Vendor Image",
      kinds: ["image"],
      pricing: { perOutputImageToken: 0.00006 },
    },
  ],
  providers: { gloo: true, openrouter: true },
  defaults: { image: { provider: "openrouter", model: "vendor/img" } },
};

const fetchOf = (make: () => Response | Promise<Response>): typeof fetch =>
  (async () => make()) as unknown as typeof fetch;

describe("fetchModelCatalogue (U-MC12)", () => {
  it("parses a well-formed catalogue", async () => {
    const result = await fetchModelCatalogue({
      fetchImpl: fetchOf(() => new Response(JSON.stringify(OK), { status: 200 })),
    });
    expect(result?.models).toHaveLength(1);
    expect(result?.providers.gloo).toBe(true);
    expect(result?.defaults.image).toEqual({
      provider: "openrouter",
      model: "vendor/img",
    });
  });

  it("U-MC12a: null on a non-2xx", async () => {
    for (const status of [401, 404, 500, 503]) {
      const result = await fetchModelCatalogue({
        fetchImpl: fetchOf(() => new Response("nope", { status })),
      });
      expect(result, `status ${status}`).toBeNull();
    }
  });

  it("U-MC12b: null on an unparseable body, rather than a partially-trusted object", async () => {
    for (const body of ["<html>", JSON.stringify({ models: "not-an-array" })]) {
      const result = await fetchModelCatalogue({
        fetchImpl: fetchOf(() => new Response(body, { status: 200 })),
      });
      expect(result).toBeNull();
    }
  });

  it("U-MC12c: null on a thrown fetch — never a rejected promise", async () => {
    const result = await fetchModelCatalogue({
      fetchImpl: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it("U-MC12d: an EMPTY catalogue is a successful read, not a failure", async () => {
    // Distinguishable from null on purpose: "we asked and there are none" makes the
    // picker say so, while "we could not ask" leaves it in a loading/unavailable state.
    // Collapsing the two would show "no models" during a network blip.
    const result = await fetchModelCatalogue({
      fetchImpl: fetchOf(
        () =>
          new Response(
            JSON.stringify({
              models: [],
              providers: { gloo: false, openrouter: true },
              defaults: {},
            }),
            { status: 200 },
          ),
      ),
    });
    expect(result).not.toBeNull();
    expect(result?.models).toEqual([]);
  });

  it("reads the BFF route, not the api directly", async () => {
    let seen = "";
    await fetchModelCatalogue({
      fetchImpl: (async (url: string) => {
        seen = String(url);
        return new Response(JSON.stringify(OK), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(seen).toBe("/api/ai/models");
  });
});
