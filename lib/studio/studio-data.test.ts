import { describe, expect, it, vi } from "vitest";

import {
  resolveProjectBySlug,
  fetchProject,
  fetchManifest,
  loadStudioProject,
  commitVersion,
} from "./studio-data";
import { type ProjectManifest, type ProjectDto } from "../api/contracts";

const DTO: ProjectDto = {
  id: "clabc123",
  slug: "psalm-121",
  name: "Psalm 121",
  repoOwner: "ashsrinivas",
  repoName: "psalm-121",
  repoVisibility: "private",
  createdFrom: "blank",
  currentBranch: "v0.0.1",
  thumbnailAssetKey: null,
  lastRenderJobId: null,
  lastOpenedAt: "2026-07-20T00:00:00.000Z",
  createdAt: "2026-07-20T00:00:00.000Z",
};

const MANIFEST: ProjectManifest = {
  manifestVersion: 1,
  composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
  scenes: [
    {
      id: "s1",
      name: "wilderness",
      scriptText: "I am the voice of one",
      reference: "JOHN 1:23",
      translation: "KJV",
      visualPrompt: "dawn wilderness",
      durationSeconds: 5,
      captions: true,
      visualAssetKey: null,
    },
  ],
  narratorVoice: { description: "warm baritone" },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A URL-routing fake fetch. `routes` maps `METHOD path-prefix` → Response. */
function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL).href ?? String(input);
    return handler(url, init);
  }) as unknown as typeof fetch;
}

describe("resolveProjectBySlug", () => {
  it("U-D1: finds the ProjectDto whose slug matches, returns its cuid id", async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url).toContain("/api/projects");
      return jsonResponse(200, { projects: [DTO, { ...DTO, id: "other", slug: "other" }] });
    });
    const dto = await resolveProjectBySlug("psalm-121", { fetchImpl });
    expect(dto?.id).toBe("clabc123");
  });

  it("U-D2: returns null when no project has that slug (or the list fails)", async () => {
    const hit = fakeFetch(() => jsonResponse(200, { projects: [DTO] }));
    expect(await resolveProjectBySlug("nope", { fetchImpl: hit })).toBeNull();

    const dead = fakeFetch(() => jsonResponse(401, { error: "unauthorized" }));
    expect(await resolveProjectBySlug("psalm-121", { fetchImpl: dead })).toBeNull();
  });
});

describe("fetchProject", () => {
  it("U-D3: unwraps { project } from GET /api/projects/:id; 404 → null", async () => {
    const ok = fakeFetch((url) => {
      expect(url).toContain("/api/projects/clabc123");
      return jsonResponse(200, { project: DTO });
    });
    expect((await fetchProject("clabc123", { fetchImpl: ok }))?.slug).toBe("psalm-121");

    const gone = fakeFetch(() => jsonResponse(404, { error: "not_found" }));
    expect(await fetchProject("clabc123", { fetchImpl: gone })).toBeNull();
  });
});

describe("fetchManifest", () => {
  it("U-D4: forwards the ref and returns the parsed manifest on 200", async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url).toContain("/api/projects/clabc123/manifest");
      expect(url).toContain("ref=v0.0.1");
      return jsonResponse(200, { manifest: MANIFEST });
    });
    const res = await fetchManifest("clabc123", "v0.0.1", { fetchImpl });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.manifest.scenes[0].scriptText).toBe("I am the voice of one");
  });

  it("U-D5: maps the API error codes to distinct reasons", async () => {
    const notFound = fakeFetch(() => jsonResponse(404, { error: "manifest_not_found" }));
    const r1 = await fetchManifest("clabc123", "v0.0.1", { fetchImpl: notFound });
    expect(r1).toEqual({ ok: false, reason: "manifest_not_found" });

    const invalid = fakeFetch(() => jsonResponse(422, { error: "manifest_invalid" }));
    const r2 = await fetchManifest("clabc123", "v0.0.1", { fetchImpl: invalid });
    expect(r2).toEqual({ ok: false, reason: "manifest_invalid" });

    const noGithub = fakeFetch(() => jsonResponse(409, { error: "github_not_connected" }));
    const r3 = await fetchManifest("clabc123", "v0.0.1", { fetchImpl: noGithub });
    expect(r3).toEqual({ ok: false, reason: "github_not_connected" });
  });
});

describe("loadStudioProject", () => {
  it("U-D6: composes list→:id→manifest into a real StudioProject (id=cuid, slug carried, manifest carried)", async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url.includes("/manifest")) return jsonResponse(200, { manifest: MANIFEST });
      if (/\/api\/projects\/clabc123(\?|$)/.test(url)) return jsonResponse(200, { project: DTO });
      return jsonResponse(200, { projects: [DTO] });
    });
    const result = await loadStudioProject("psalm-121", { fetchImpl });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.project.id).toBe("clabc123"); // the API cuid, not the slug
      expect(result.project.slug).toBe("psalm-121");
      expect(result.project.projectName).toBe("Psalm 121");
      expect(result.project.repo).toBe("ashsrinivas/psalm-121");
      expect(result.project.versionBranch).toBe("v0.0.1");
      // the source manifest is carried for the commit round-trip
      expect(result.project.manifest).toEqual(MANIFEST);
      // and the storyboard is hydrated from it (not DEMO_STORYBOARD)
      expect(result.project.storyboard.scenes[0].script).toBe("I am the voice of one");
    }
  });

  it("U-D7: a slug that matches no project → not_found", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(200, { projects: [DTO] }));
    expect((await loadStudioProject("ghost", { fetchImpl })).status).toBe("not_found");
  });

  it("U-D8: a corrupt manifest → error (reason manifest_invalid), not a silent ready", async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url.includes("/manifest")) return jsonResponse(422, { error: "manifest_invalid" });
      if (/\/api\/projects\/clabc123(\?|$)/.test(url)) return jsonResponse(200, { project: DTO });
      return jsonResponse(200, { projects: [DTO] });
    });
    const result = await loadStudioProject("psalm-121", { fetchImpl });
    expect(result).toEqual({ status: "error", reason: "manifest_invalid" });
  });
});

describe("commitVersion", () => {
  it("U-D9: POSTs { manifest, message } and returns the jobId", async () => {
    let sentBody: unknown = null;
    const fetchImpl = fakeFetch((url, init) => {
      expect(url).toContain("/api/projects/clabc123/commit");
      expect(init?.method).toBe("POST");
      sentBody = JSON.parse(String(init?.body));
      return jsonResponse(200, { jobId: "job_1" });
    });
    const jobId = await commitVersion("clabc123", MANIFEST, "Update storyboard", {
      fetchImpl,
    });
    expect(jobId).toBe("job_1");
    expect(sentBody).toEqual({ manifest: MANIFEST, message: "Update storyboard" });
  });

  it("U-D10: a non-2xx (e.g. 409 git_ops_in_flight) → null", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(409, { error: "git_ops_in_flight" }));
    expect(await commitVersion("clabc123", MANIFEST, "x", { fetchImpl })).toBeNull();
  });
});
