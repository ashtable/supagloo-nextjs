/**
 * The pure 14a review model (no React/DOM): the mock commit title/body plus the
 * diff-file list. Paths are templated off the project id (so the data row reads
 * `captions/<id>.json`, NOT the design tool's `psalm-23` mock), and each row's
 * TONE is derived from the file extension (D-DIFF-TONE: `.tsx` → code/green,
 * data files → gold) — a rule, not three hardcoded colors.
 */
import type { StudioProject } from "./project";

export type DiffTone = "code" | "data";

export interface DiffFile {
  /** git status letter (mocked — always Modified). */
  status: "M";
  /** repo-relative path. */
  path: string;
  /** color signal, derived from the extension. */
  tone: DiffTone;
}

export interface PublishReview {
  title: string;
  body: string;
  files: DiffFile[];
}

/** Extension → tone: code files (`.tsx`) green, everything else (data/assets,
 *  here `.json`) gold. The single rule behind the diff-row colors. */
function toneForPath(path: string): DiffTone {
  return path.endsWith(".tsx") ? "code" : "data";
}

/**
 * The mocked commit review for a project's publish. The two code files are
 * generic composition sources; the data file is the project's own caption track,
 * templated off `project.id`.
 */
export function publishReview(project: StudioProject): PublishReview {
  const paths = [
    "src/Composition.tsx",
    "src/scenes/OpeningScene.tsx",
    `captions/${project.id}.json`,
  ];
  return {
    title: "Refine scene visuals & enable captions",
    body: "Reworked the opening scene prompt, turned on on-screen captions, and tightened scene timing.",
    files: paths.map((path) => ({ status: "M", path, tone: toneForPath(path) })),
  };
}
