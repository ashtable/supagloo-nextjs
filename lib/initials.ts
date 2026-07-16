/**
 * Derive up-to-two-letter initials from a display name, for avatar monograms.
 *
 * - Two+ words → first letter of the first word + first letter of the last word.
 * - One word → its first two letters.
 * - Empty / undefined → "".
 *
 * Always uppercased; collapses arbitrary interior whitespace.
 */
export function initials(name?: string): string {
  if (!name) return "";

  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  const first = words[0][0];
  const last = words[words.length - 1][0];
  return (first + last).toUpperCase();
}
