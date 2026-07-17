/**
 * The 3 demo projects shown in 10a's "Recent projects" grid (glyph-exact copy
 * from `scratch/design/turn10a.raw.html`) + their gradient posters, centralized
 * here so nothing is hardcoded in JSX (resolves ambiguities #10/#11). No
 * thumbnail render pipeline — a seeded gradient stands in for a poster frame.
 */

export type ProjectStatus = "RENDERED" | "DRAFT";

export interface DemoProject {
  id: string;
  title: string;
  repo: string;
  status: ProjectStatus;
  opened: string;
  branch: string;
  posterLabel: string;
  posterGradient: string;
  /** Lower = more recently opened. Sortable key for `sortByLastOpened`. */
  recencyRank: number;
}

export const DEMO_PROJECTS: readonly DemoProject[] = [
  {
    id: "genesis-light",
    title: "Let There Be Light",
    repo: "ashsrinivas/genesis-light",
    status: "RENDERED",
    opened: "Opened 2h ago",
    branch: "main",
    posterLabel: "GENESIS · LIGHT",
    posterGradient:
      "radial-gradient(circle at 50% 42%, #ffffff 0%, #ffe8a8 13%, #f0a43a 32%, #8a3a1e 60%, #160f14 90%)",
    recencyRank: 0,
  },
  {
    id: "psalm-23",
    title: "The Lord Is My Shepherd",
    repo: "ashsrinivas/psalm-23",
    status: "DRAFT",
    opened: "Opened yesterday",
    branch: "main",
    posterLabel: "PSALM 23",
    posterGradient:
      "radial-gradient(circle at 40% 35%, #3a5a7a 0%, #1e3350 45%, #0a1220 90%)",
    recencyRank: 1,
  },
  {
    id: "beatitudes",
    title: "Blessed Are They",
    repo: "ashsrinivas/beatitudes",
    status: "DRAFT",
    opened: "Opened 3 days ago",
    branch: "main",
    posterLabel: "BEATITUDES",
    posterGradient:
      "radial-gradient(circle at 55% 40%, #e8d9b8 0%, #c9a24f 40%, #6d4a1e 90%)",
    recencyRank: 2,
  },
];

/** Most-recently-opened first. Pure — does not mutate its input. */
export function sortByLastOpened(
  projects: readonly DemoProject[],
): DemoProject[] {
  return [...projects].sort((a, b) => a.recencyRank - b.recencyRank);
}
