import { describe, expect, it, vi } from "vitest";

import {
  createGeneration,
  fetchGeneration,
  presignDownload,
  pollGenerationUntilTerminal,
} from "./ai-generation-data";
import type { AiGenerationDto } from "../api/contracts";

/**
 * Task #35 — the studio AI-generation data layer. Mirrors `studio-data.ts`:
 * injectable `fetch`, Zod-parse via the wire `*ResponseSchema`, return null on any
 * failure (never throws). Fully unit-tested with zero network.
 */

const okJson = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

function genDto(over: Partial<AiGenerationDto> = {}): AiGenerationDto {
  return {
    id: "gen-1",
    projectId: "p1",
    sceneId: "s1",
    kind: "image",
    provider: "openrouter",
    model: "some/image-model",
    status: "queued",
    resultJson: null,
    resultAssetKey: null,
    error: null,
    tokenUsage: null,
    createdAt: "2026-07-24T00:00:00.000Z",
    completedAt: null,
    ...over,
  };
}

describe("createGeneration", () => {
  it("POSTs the client body and returns the generationId on 201", async () => {
    let capturedUrl: RequestInfo | URL | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return okJson({ generationId: "gen-9" }, 201);
    }) as unknown as typeof fetch;

    const id = await createGeneration(
      { kind: "image", projectId: "p1", sceneId: "s1", input: { prompt: "x" } },
      { fetchImpl },
    );
    expect(id).toBe("gen-9");
    expect(capturedUrl).toBe("/api/ai/generations");
    expect(capturedInit?.method).toBe("POST");
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      kind: "image",
      projectId: "p1",
      sceneId: "s1",
      input: { prompt: "x" },
    });
  });

  it("returns null on a non-2xx (e.g. 422 kind_provider_incompatible)", async () => {
    const fetchImpl = vi.fn(async () =>
      okJson({ error: "kind_provider_incompatible" }, 422),
    );
    expect(
      await createGeneration(
        { kind: "image", input: { prompt: "x" } },
        { fetchImpl },
      ),
    ).toBeNull();
  });

  it("returns null when the response body lacks generationId, and never throws on a dead fetch", async () => {
    expect(
      await createGeneration(
        { kind: "image", input: { prompt: "x" } },
        { fetchImpl: async () => okJson({ nope: true }, 201) },
      ),
    ).toBeNull();
    expect(
      await createGeneration(
        { kind: "image", input: { prompt: "x" } },
        {
          fetchImpl: async () => {
            throw new Error("network down");
          },
        },
      ),
    ).toBeNull();
  });
});

describe("fetchGeneration", () => {
  it("unwraps { generation } and returns the DTO", async () => {
    const dto = genDto({ status: "succeeded", resultAssetKey: "projects/p1/assets/gen-1" });
    const got = await fetchGeneration("gen-1", {
      fetchImpl: async () => okJson({ generation: dto }),
    });
    expect(got).toEqual(dto);
  });

  it("returns null on non-2xx / parse failure / throw", async () => {
    expect(await fetchGeneration("gen-1", { fetchImpl: async () => okJson({}, 404) })).toBeNull();
    expect(
      await fetchGeneration("gen-1", { fetchImpl: async () => okJson({ generation: { bad: 1 } }) }),
    ).toBeNull();
  });
});

describe("presignDownload", () => {
  it("returns the presigned url for a key", async () => {
    const url = await presignDownload("projects/p1/assets/gen-1", {
      fetchImpl: async (u) => {
        expect(String(u)).toContain(
          "/api/files/presign-download?key=projects%2Fp1%2Fassets%2Fgen-1",
        );
        return okJson({ url: "http://minio/signed", expiresAt: "2026-07-24T01:00:00.000Z" });
      },
    });
    expect(url).toBe("http://minio/signed");
  });

  it("returns null on a denied/unknown key (404) or a throw", async () => {
    expect(await presignDownload("k", { fetchImpl: async () => okJson({}, 404) })).toBeNull();
    expect(
      await presignDownload("k", {
        fetchImpl: async () => {
          throw new Error("x");
        },
      }),
    ).toBeNull();
  });
});

describe("pollGenerationUntilTerminal", () => {
  it("polls until a terminal status and returns the terminal generation, calling onUpdate per read", async () => {
    const reads = [
      genDto({ status: "queued" }),
      genDto({ status: "running" }),
      genDto({ status: "succeeded", resultAssetKey: "projects/p1/assets/gen-1" }),
    ];
    let i = 0;
    const onUpdate = vi.fn();
    const terminal = await pollGenerationUntilTerminal("gen-1", {
      fetchImpl: async () => okJson({ generation: reads[Math.min(i++, reads.length - 1)] }),
      sleep: async () => {},
      onUpdate,
    });
    expect(terminal?.status).toBe("succeeded");
    expect(terminal?.resultAssetKey).toBe("projects/p1/assets/gen-1");
    expect(onUpdate).toHaveBeenCalledTimes(3);
  });

  it("returns a failed terminal generation (does not treat failure as timeout)", async () => {
    const terminal = await pollGenerationUntilTerminal("gen-1", {
      fetchImpl: async () => okJson({ generation: genDto({ status: "failed", error: "boom" }) }),
      sleep: async () => {},
    });
    expect(terminal?.status).toBe("failed");
    expect(terminal?.error).toBe("boom");
  });

  it("returns null on timeout when never terminal", async () => {
    let t = 0;
    const terminal = await pollGenerationUntilTerminal("gen-1", {
      fetchImpl: async () => okJson({ generation: genDto({ status: "running" }) }),
      sleep: async () => {},
      now: () => (t += 1000),
      timeoutMs: 1500,
    });
    expect(terminal).toBeNull();
  });
});
