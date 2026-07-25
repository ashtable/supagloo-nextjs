import { describe, expect, it } from "vitest";

import {
  startRenderJob,
  fetchRender,
  cancelRenderJob,
  fetchRenderDownloadUrl,
  pollRenderUntilTerminal,
} from "./render-data";
import type { RenderJobDto } from "../api/contracts";

/**
 * Task #38 — the studio RENDER data layer (design-delta §5.3 row 8 / §6c). Mirrors
 * `ai-generation-data.ts`: injectable `fetch`/`sleep`/`now`, Zod-parse via the wire
 * `*ResponseSchema`, and NEVER throw — every failure is a null/false. Zero network.
 */

const okJson = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

const OUTPUT_SPEC = {
  width: 1080,
  height: 1920,
  fps: 30,
  aspectRatio: "9:16",
  codec: "h264",
};

function renderDto(over: Partial<RenderJobDto> = {}): RenderJobDto {
  return {
    id: "rj_1",
    projectId: "prj_1",
    versionId: "pv_1",
    status: "queued",
    framesDone: 0,
    framesTotal: 0,
    outputSpec: { ...OUTPUT_SPEC },
    outputAssetKey: null,
    thumbnailAssetKey: null,
    runInBackground: false,
    error: null,
    createdAt: "2026-07-24T10:00:00.000Z",
    startedAt: null,
    completedAt: null,
    ...over,
  };
}

describe("startRenderJob", () => {
  it("U-RD1: POSTs { versionId, outputSpec, runInBackground } and returns the renderJobId", async () => {
    let url: RequestInfo | URL | undefined;
    let init: RequestInit | undefined;
    const fetchImpl = (async (u: RequestInfo | URL, i?: RequestInit) => {
      url = u;
      init = i;
      return okJson({ renderJobId: "rj_9" }, 201);
    }) as unknown as typeof fetch;

    const id = await startRenderJob(
      "prj_1",
      { versionId: "pv_1", outputSpec: OUTPUT_SPEC, runInBackground: false },
      { fetchImpl },
    );

    expect(id).toBe("rj_9");
    expect(url).toBe("/api/projects/prj_1/renders");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      versionId: "pv_1",
      outputSpec: OUTPUT_SPEC,
      runInBackground: false,
    });
  });

  it("U-RD1b: returns null on any non-2xx or throw (never throws)", async () => {
    const notFound = (async () => okJson({ error: "not_found" }, 404)) as unknown as typeof fetch;
    expect(
      await startRenderJob(
        "prj_1",
        { versionId: "pv_1", outputSpec: OUTPUT_SPEC, runInBackground: false },
        { fetchImpl: notFound },
      ),
    ).toBeNull();

    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(
      await startRenderJob(
        "prj_1",
        { versionId: "pv_1", outputSpec: OUTPUT_SPEC, runInBackground: false },
        { fetchImpl: boom },
      ),
    ).toBeNull();
  });
});

describe("fetchRender", () => {
  it("U-RD2: unwraps { render } with cache no-store", async () => {
    let url: RequestInfo | URL | undefined;
    let init: RequestInit | undefined;
    const fetchImpl = (async (u: RequestInfo | URL, i?: RequestInit) => {
      url = u;
      init = i;
      return okJson({ render: renderDto({ status: "encoding", framesDone: 12 }) });
    }) as unknown as typeof fetch;

    const dto = await fetchRender("rj_1", { fetchImpl });
    expect(dto?.status).toBe("encoding");
    expect(dto?.framesDone).toBe(12);
    expect(url).toBe("/api/renders/rj_1");
    expect(init?.cache).toBe("no-store");
  });

  it("U-RD2b: returns null on a non-2xx or a payload that fails the schema", async () => {
    const gone = (async () => okJson({ error: "not_found" }, 404)) as unknown as typeof fetch;
    expect(await fetchRender("rj_1", { fetchImpl: gone })).toBeNull();

    const junk = (async () =>
      okJson({ render: { id: "rj_1", status: "rendering" } })) as unknown as typeof fetch;
    expect(await fetchRender("rj_1", { fetchImpl: junk })).toBeNull();
  });
});

describe("pollRenderUntilTerminal", () => {
  it("U-RD3: calls onUpdate on every read and resolves on the first terminal status", async () => {
    const seen: string[] = [];
    const seq = [
      renderDto({ status: "queued" }),
      renderDto({ status: "queued", startedAt: "2026-07-24T10:00:05.000Z" }),
      renderDto({ status: "encoding", framesDone: 30, framesTotal: 90 }),
      renderDto({
        status: "completed",
        framesDone: 90,
        framesTotal: 90,
        outputAssetKey: "renders/rj_1/output.mp4",
        completedAt: "2026-07-24T10:04:00.000Z",
      }),
      renderDto({ status: "completed" }), // must never be read
    ];
    let i = 0;
    const fetchImpl = (async () => okJson({ render: seq[i++] })) as unknown as typeof fetch;

    const terminal = await pollRenderUntilTerminal("rj_1", {
      fetchImpl,
      sleep: async () => {},
      intervalMs: 1,
      onUpdate: (r) => seen.push(r.status),
    });

    expect(seen).toEqual(["queued", "queued", "encoding", "completed"]);
    expect(terminal?.status).toBe("completed");
    expect(terminal?.outputAssetKey).toBe("renders/rj_1/output.mp4");
    expect(i).toBe(4); // stopped at the first terminal read
  });

  it("U-RD3b: `failed` and `canceled` are terminal too", async () => {
    for (const status of ["failed", "canceled"] as const) {
      const fetchImpl = (async () =>
        okJson({ render: renderDto({ status, error: "boom" }) })) as unknown as typeof fetch;
      const terminal = await pollRenderUntilTerminal("rj_1", {
        fetchImpl,
        sleep: async () => {},
        intervalMs: 1,
      });
      expect(terminal?.status).toBe(status);
    }
  });

  it("U-RD3c: returns null once the deadline passes without a terminal read", async () => {
    const fetchImpl = (async () =>
      okJson({ render: renderDto({ status: "encoding" }) })) as unknown as typeof fetch;
    let t = 0;
    const out = await pollRenderUntilTerminal("rj_1", {
      fetchImpl,
      sleep: async () => {
        t += 1000;
      },
      now: () => t,
      intervalMs: 1,
      timeoutMs: 2000,
    });
    expect(out).toBeNull();
  });
});

describe("cancelRenderJob", () => {
  it("U-RD4: POSTs the cancel path and reports success/failure without throwing", async () => {
    let url: RequestInfo | URL | undefined;
    let method: string | undefined;
    const ok = (async (u: RequestInfo | URL, i?: RequestInit) => {
      url = u;
      method = i?.method;
      return okJson({ render: renderDto({ status: "canceled" }) });
    }) as unknown as typeof fetch;
    expect(await cancelRenderJob("rj_1", { fetchImpl: ok })).toBe(true);
    expect(url).toBe("/api/renders/rj_1/cancel");
    expect(method).toBe("POST");

    const conflict = (async () =>
      okJson({ error: "render_not_cancelable" }, 409)) as unknown as typeof fetch;
    expect(await cancelRenderJob("rj_1", { fetchImpl: conflict })).toBe(false);

    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await cancelRenderJob("rj_1", { fetchImpl: boom })).toBe(false);
  });
});

describe("fetchRenderDownloadUrl", () => {
  it("U-RD5: returns the presigned url, or null when the output is not available", async () => {
    const ok = (async () =>
      okJson({
        url: "http://localhost:9000/supagloo-dev/renders/rj_1/output.mp4?X-Amz-Signature=x",
        expiresAt: "2026-07-24T10:09:00.000Z",
      })) as unknown as typeof fetch;
    expect(await fetchRenderDownloadUrl("rj_1", { fetchImpl: ok })).toContain(
      "renders/rj_1/output.mp4",
    );

    const notReady = (async () => okJson({ error: "not_found" }, 404)) as unknown as typeof fetch;
    expect(await fetchRenderDownloadUrl("rj_1", { fetchImpl: notReady })).toBeNull();
  });
});
