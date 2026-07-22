/**
 * The REAL-mode studio data layer (Task #27 — design-delta §5.3 rows 3 & 6). The
 * mock `findStudioProject`/`DEMO_STORYBOARD` seam is replaced (for real projects) by:
 *   1. `GET /api/projects` → match the URL SLUG → the cuid `Project.id` (the only
 *      slug→id index the API exposes — there is no get-by-slug route);
 *   2. `GET /api/projects/:id` → the authoritative `ProjectDto`;
 *   3. `GET /api/projects/:id/manifest?ref=<currentBranch>` → the Zod-parsed
 *      `ProjectManifest`, hydrated into a `StudioProject`;
 * and commit by `POST /api/projects/:id/commit { manifest, message }` → poll the
 * ProjectJob (job polling reuses `pollJobUntilTerminal` from provision-effects —
 * commit jobs are kind-agnostic).
 *
 * Pure + injectable `fetch` so the whole surface is unit-tested with zero network.
 */
import {
  ProjectListResponseSchema,
  ProjectResponseSchema,
  ManifestResponseSchema,
  CommitVersionResponseSchema,
  type ProjectDto,
  type ProjectManifest,
} from "../api/contracts";
import { hydrateStoryboard } from "./manifest-adapter";
import type { StudioProject } from "./project";

interface FetchDep {
  fetchImpl?: typeof fetch;
}
const doFetchOf = (deps: FetchDep) => deps.fetchImpl ?? fetch;

/** `GET /api/projects` → the `ProjectDto` whose slug matches. Null on miss / any
 *  failure (never throws). This is the slug→cuid resolution. */
export async function resolveProjectBySlug(
  slug: string,
  deps: FetchDep = {},
): Promise<ProjectDto | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch("/api/projects", { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = ProjectListResponseSchema.safeParse(await res.json());
    if (!parsed.success) return null;
    return parsed.data.projects.find((p) => p.slug === slug) ?? null;
  } catch {
    return null;
  }
}

/** `GET /api/projects/:id` → the `ProjectDto` (unwraps `{ project }`). Null on any
 *  failure. */
export async function fetchProject(
  id: string,
  deps: FetchDep = {},
): Promise<ProjectDto | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/projects/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = ProjectResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.project : null;
  } catch {
    return null;
  }
}

export type ManifestResult =
  | { ok: true; manifest: ProjectManifest }
  | { ok: false; reason: string };

/** `GET /api/projects/:id/manifest?ref=` → the parsed manifest, or a distinct
 *  failure reason mapped from the API's error body (`manifest_not_found`,
 *  `github_not_connected`, `manifest_invalid`, …) so the loader can tell "not found"
 *  from "corrupt". */
export async function fetchManifest(
  id: string,
  ref: string,
  deps: FetchDep = {},
): Promise<ManifestResult> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(
      `/api/projects/${id}/manifest?ref=${encodeURIComponent(ref)}`,
      { cache: "no-store" },
    );
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const reason =
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : `http_${res.status}`;
      return { ok: false, reason };
    }
    const parsed = ManifestResponseSchema.safeParse(body);
    if (!parsed.success) return { ok: false, reason: "manifest_invalid" };
    return { ok: true, manifest: parsed.data.manifest };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

export type StudioLoadResult =
  | { status: "ready"; project: StudioProject }
  | { status: "not_found" }
  | { status: "error"; reason: string };

/** Compose the slug→id→manifest chain into a real `StudioProject` (or a not_found /
 *  error the resolver surfaces as the themed studio 404 / load-error body). */
export async function loadStudioProject(
  slug: string,
  deps: FetchDep = {},
): Promise<StudioLoadResult> {
  const found = await resolveProjectBySlug(slug, deps);
  if (!found) return { status: "not_found" };

  const dto = await fetchProject(found.id, deps);
  if (!dto) return { status: "not_found" };

  const manifest = await fetchManifest(dto.id, dto.currentBranch, deps);
  if (!manifest.ok) return { status: "error", reason: manifest.reason };

  const project: StudioProject = {
    id: dto.id,
    slug: dto.slug,
    projectName: dto.name,
    repo: `${dto.repoOwner}/${dto.repoName}`,
    versionBranch: dto.currentBranch,
    storyboard: hydrateStoryboard(manifest.manifest),
    manifest: manifest.manifest,
  };
  return { status: "ready", project };
}

/** `POST /api/projects/:id/commit { manifest, message }` → the commit job id. Null on
 *  any non-2xx (e.g. 409 `git_ops_in_flight`, 422 `manifest_invalid`) or failure. */
export async function commitVersion(
  projectId: string,
  manifest: ProjectManifest,
  message: string,
  deps: FetchDep = {},
): Promise<string | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/projects/${projectId}/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manifest, message }),
    });
    if (!res.ok) return null;
    const parsed = CommitVersionResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.jobId : null;
  } catch {
    return null;
  }
}
