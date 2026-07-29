/**
 * Figure 20b's `"Don't warn me again for this project"` checkbox.
 *
 * ## Where it lives, and why not the manifest
 *
 * `localStorage`, keyed by project id. The alternatives were both worse:
 *
 *   - a **manifest** field would commit a UI preference into the user's GitHub repo,
 *     alongside the composition. It would also be a five-mirror schema change for a
 *     checkbox, and it would travel to anyone who forked the project.
 *   - a **Project row** field would need an api endpoint, a migration and a round-trip to
 *     answer a question the browser can answer synchronously.
 *
 * The cost of `localStorage` is that the preference is per-browser. That is the right
 * trade for a "stop showing me this" flag: the risk of getting it wrong is one extra
 * dialog, not a wrong charge.
 *
 * Storage is INJECTED so this is unit-testable with no DOM, and every access is wrapped:
 * Safari's private mode throws on `localStorage` access rather than returning null, and a
 * throw here would take down the click handler that opens the dialog.
 *
 * **Fail-safe direction: on any doubt, WARN.** A missing/corrupt/unreadable preference
 * means "show the dialog". The failure we can afford is a dialog the user has already
 * dismissed once; the failure we cannot is a silent spend.
 */

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "supagloo.videoWarn.";

/** Namespaced so it cannot collide with anything else this origin stores. */
export function videoWarningKey(projectId: string): string {
  return `${PREFIX}${projectId}`;
}

function defaultStorage(): PreferenceStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // storage disabled entirely
  }
}

/**
 * Should the 20b dialog be shown for this project?
 *
 * True unless the user has explicitly suppressed it. Per-project, exactly as the figure
 * labels it — suppressing the warning on a four-scene devotional must not silence it on a
 * different project entirely.
 */
export function shouldWarnBeforeVideo(
  projectId: string,
  storage: PreferenceStorage | null = defaultStorage(),
): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(videoWarningKey(projectId)) !== "1";
  } catch {
    return true;
  }
}

/** Record `"Don't warn me again for this project"`. Silently a no-op when storage is
 *  unavailable — the user sees the dialog again, which is the safe direction. */
export function suppressVideoWarning(
  projectId: string,
  storage: PreferenceStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(videoWarningKey(projectId), "1");
  } catch {
    /* storage full / disabled — keep warning */
  }
}

/** Undo the suppression (no UI surface today; here so the state is not one-way). */
export function clearVideoWarningPreference(
  projectId: string,
  storage: PreferenceStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(videoWarningKey(projectId));
  } catch {
    /* nothing to do */
  }
}
