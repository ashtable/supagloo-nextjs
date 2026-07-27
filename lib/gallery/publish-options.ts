/**
 * Turn 16b's decidable half (plan slice C8, §4.9) — no React, no fetch, no DOM.
 *
 * Three questions the publish dialog has to answer, and all three are answerable from
 * data the platform already exposes:
 *
 *  1. **`PROJECT ▾` (D8).** The design shows `psalm-121 · v0.0.2`, and NO endpoint carries
 *     that string: `RenderJobDto` has ids, `ProjectDto` has the slug, `ProjectVersionDto`
 *     has the semver. Rather than grow a joined field on the render DTO for one dropdown,
 *     {@link buildProjectOptions} performs the join CLIENT-SIDE over three reads the app
 *     already makes elsewhere. The cost is one `/versions` call per distinct project that
 *     owns a completed render; the benefit is that no wire contract changes for a label.
 *
 *  2. **`TRANSLATION ▾` (D10).** `TranslationSchema` is `z.string().min(1)` on purpose
 *     (§9-Q10) — the licensed set is YouVersion's, not a constant we get to own. So the
 *     dropdown is a CONVENIENCE, never a gate: {@link translationOptions} offers what we
 *     know and always ends with an escape hatch to free text.
 *
 *  3. **May this be submitted?** The design draws exactly one state and never draws the
 *     submit disabled, so {@link canSubmitPublish} is invented — see its docblock.
 */
import { isPublishable } from "../your-videos/your-videos-model";
import type {
  ProjectDto,
  ProjectManifest,
  ProjectVersionDto,
  RenderJobDto,
} from "../api/contracts";

/** One row of `PROJECT ▾`. The VALUE is the render job id, because a render — not a
 *  project — is what gets published. */
export interface PublishProjectOption {
  renderId: string;
  projectId: string;
  /** `<slug> · v<semver>` when both joins resolved; a stable fallback otherwise. */
  label: string;
  /** The cover frame's S3 key, presignable through the owner-scoped download route. */
  thumbnailAssetKey: string | null;
  /** True only when BOTH joins resolved — the label is trustworthy. */
  resolved: boolean;
}

export interface BuildProjectOptionsInput {
  renders: readonly RenderJobDto[];
  projects: readonly ProjectDto[];
  /** `projectId` → that project's versions, as `GET /api/projects/:id/versions` returns
   *  them. Absent keys are fine: a project whose versions failed to load still yields
   *  options, they are just labelled with the fallback. */
  versions: ReadonlyMap<string, readonly ProjectVersionDto[]>;
}

/**
 * Join renders × projects × versions into the picker's rows.
 *
 * THE RULE THAT MATTERS: **a publishable render is never dropped because a join missed.**
 * A failed `/versions` call is a labelling problem; refusing to list the render would turn
 * it into "your finished video has disappeared", which is a much worse lie than an ugly
 * name. So an unresolved side degrades to the id it does have.
 *
 * Only renders the API would actually accept are offered — `isPublishable` mirrors
 * `GalleryService.publish`'s own three preconditions, so the picker cannot present a
 * choice that is guaranteed to 409. (It CANNOT know about `already_published`; nothing on
 * the render DTO records it. That refusal surfaces from the server, verbatim.)
 *
 * Ordering is newest-completed first, so the render someone just finished is the default.
 * `id` breaks ties descending, so the order is total and the dropdown never reshuffles
 * between two renders that finished in the same millisecond.
 */
export function buildProjectOptions(
  input: BuildProjectOptionsInput,
): PublishProjectOption[] {
  const slugById = new Map(input.projects.map((p) => [p.id, p.slug]));
  const semverById = new Map<string, string>();
  for (const list of input.versions.values()) {
    for (const v of list) semverById.set(v.id, v.semver);
  }

  const seen = new Set<string>();
  const rows: { option: PublishProjectOption; sortAt: number; id: string }[] = [];

  for (const render of input.renders) {
    if (!isPublishable(render)) continue;
    if (seen.has(render.id)) continue;
    seen.add(render.id);

    const slug = slugById.get(render.projectId);
    const semver = semverById.get(render.versionId);
    // The fallbacks are the ids themselves — the only stable, unique thing left when a
    // join misses. Ugly on purpose: it reads as "we could not name this", not as a name.
    const slugPart = slug ?? render.projectId;
    const versionPart = semver !== undefined ? `v${semver}` : "unknown version";

    rows.push({
      option: {
        renderId: render.id,
        projectId: render.projectId,
        label: `${slugPart} · ${versionPart}`,
        thumbnailAssetKey: render.thumbnailAssetKey,
        resolved: slug !== undefined && semver !== undefined,
      },
      sortAt: Date.parse(render.completedAt ?? render.createdAt),
      id: render.id,
    });
  }

  rows.sort((a, b) => {
    const at = Number.isNaN(a.sortAt) ? -Infinity : a.sortAt;
    const bt = Number.isNaN(b.sortAt) ? -Infinity : b.sortAt;
    if (at !== bt) return bt - at;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });

  return rows.map((r) => r.option);
}

/** The two abbreviations this product documents as its defaults (memory
 *  `kjv-bsb-generation-only`: KJV/BSB is the DEFAULT, never the permitted set). */
export const PUBLISH_TRANSLATION_DEFAULTS = ["KJV", "BSB"] as const;

/** The escape hatch's sentinel value. Selecting it reveals a free-text input — which is
 *  what keeps this dropdown from becoming the closed enum db-lib deliberately refused to
 *  be. It is a sentinel, never a translation, and never reaches the wire. */
export const OTHER_TRANSLATION = "Other…";

/**
 * `{current} ∪ {KJV, BSB} ∪ {manifest}`, deduped, in that order, always ending with
 * {@link OTHER_TRANSLATION}.
 *
 * `current` leads because a value already in the form is the user's, and a dropdown that
 * cannot show its own value is broken. The manifest's translation trails the defaults
 * because it arrives asynchronously and must not reorder a list the user is looking at.
 */
export function translationOptions(input: {
  current: string | null | undefined;
  manifest: string | null | undefined;
}): string[] {
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    const value = (raw ?? "").trim();
    if (!value || value === OTHER_TRANSLATION) return;
    if (out.includes(value)) return;
    out.push(value);
  };
  push(input.current);
  for (const t of PUBLISH_TRANSLATION_DEFAULTS) push(t);
  push(input.manifest);
  out.push(OTHER_TRANSLATION);
  return out;
}

/**
 * The submit gate. **Invented** — Step 4 §2.6 records that the design never draws
 * `Publish to gallery ▸` disabled, and draws the consent box already ticked.
 *
 * Both divergences are deliberate:
 *  - a pre-ticked agreement is a dark pattern (it records an agreement nobody made), so
 *    the box ships UNCHECKED, which only means something if it also gates;
 *  - `title` and `scriptureReference` are `.trim().min(1)` upstream, so a whitespace-only
 *    value is a 400 — better to keep the button honest than to spend a round trip
 *    learning what the schema already told us.
 */
export function canSubmitPublish(input: {
  renderId: string | null;
  title: string;
  passage: string;
  consent: boolean;
  busy: boolean;
}): boolean {
  if (!input.renderId) return false;
  if (input.busy) return false;
  if (!input.consent) return false;
  if (input.title.trim().length === 0) return false;
  if (input.passage.trim().length === 0) return false;
  return true;
}

/**
 * What a project's manifest can honestly prefill into `PASSAGE` and `TRANSLATION`.
 *
 * The manifest has no top-level passage — only per-scene `reference`s — so a value only
 * exists when every scene names the SAME one. Taking scene 1's reference for a video that
 * runs Psalm 23:1 → 23:6 would prefill a passage NARROWER than the video, and that string
 * is both what the server derives `scriptureBook` from and what prints verbatim on a
 * public card. A blank field the user completes is better than a wrong one they accept.
 *
 * Same rule for `translation`: two scenes in two translations do not have "a" translation.
 */
export function manifestPrefill(manifest: ProjectManifest | null | undefined): {
  passage: string | null;
  translation: string | null;
} {
  const scenes = manifest?.scenes ?? [];
  if (scenes.length === 0) return { passage: null, translation: null };
  const unanimous = (values: string[]): string | null => {
    const first = values[0];
    return values.every((v) => v === first) ? first : null;
  };
  return {
    passage: unanimous(scenes.map((s) => s.reference)),
    translation: unanimous(scenes.map((s) => s.translation)),
  };
}
