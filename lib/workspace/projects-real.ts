/**
 * The REAL-mode workspace grid source (Task #26 §5.3): `GET /api/projects` →
 * `ProjectDto[]` mapped into the existing card view (the `DemoProject` shape
 * `recent-projects.tsx` already renders) and sorted by last-opened. Pure +
 * injectable `fetch` → zero-network unit tests. Best-effort: any failure → `[]`.
 *
 * The card `id` is the project SLUG so "Open ▸" routes to `/studio/<slug>` (the
 * task-27 studio hydration resolves the real project by slug; task 26 lands there).
 */
import {
  ProjectListResponseSchema,
  type ProjectDto,
} from "../api/contracts";
import type { DemoProject } from "./projects-model";

/** A deterministic poster gradient seeded from the project name (no thumbnail
 *  pipeline yet — a seeded gradient stands in for a poster frame, matching the mock). */
function posterGradientFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return `radial-gradient(circle at 50% 42%, hsl(${hash} 60% 70%) 0%, hsl(${hash} 55% 42%) 45%, #160f14 90%)`;
}

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

/** "Opened just now / Nh ago / yesterday / N days ago" from an ISO timestamp. */
export function relativeOpenedLabel(iso: string, now: number): string {
  const delta = now - new Date(iso).getTime();
  if (delta < MS_HOUR) return "Opened just now";
  if (delta < MS_DAY) return `Opened ${Math.floor(delta / MS_HOUR)}h ago`;
  const days = Math.floor(delta / MS_DAY);
  if (days === 1) return "Opened yesterday";
  return `Opened ${days} days ago`;
}

/** Map a `ProjectDto` → the workspace card view. */
export function projectDtoToCard(dto: ProjectDto, now: number): DemoProject {
  const rendered = dto.lastRenderJobId !== null;
  return {
    id: dto.slug,
    title: dto.name,
    repo: `${dto.repoOwner}/${dto.repoName}`,
    status: rendered ? "RENDERED" : "DRAFT",
    opened: relativeOpenedLabel(dto.lastOpenedAt, now),
    branch: dto.currentBranch,
    posterLabel: dto.name.toUpperCase(),
    posterGradient: posterGradientFor(dto.name),
    // Lower = more recent; negative epoch so the newest sorts first.
    recencyRank: -new Date(dto.lastOpenedAt).getTime(),
  };
}

/** Map + sort a list of DTOs by last-opened (most recent first). */
export function sortCardsByLastOpened(
  dtos: readonly ProjectDto[],
  now: number,
): DemoProject[] {
  return dtos
    .map((d) => projectDtoToCard(d, now))
    .sort((a, b) => a.recencyRank - b.recencyRank);
}

export interface FetchProjectsDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** `GET /api/projects` → sorted card list. `[]` on any failure (never throws). */
export async function fetchProjectCards(
  deps: FetchProjectsDeps = {},
): Promise<DemoProject[]> {
  const doFetch = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  try {
    const res = await doFetch("/api/projects", { cache: "no-store" });
    if (!res.ok) return [];
    const parsed = ProjectListResponseSchema.safeParse(await res.json());
    if (!parsed.success) return [];
    return sortCardsByLastOpened(parsed.data.projects, now());
  } catch {
    return [];
  }
}
