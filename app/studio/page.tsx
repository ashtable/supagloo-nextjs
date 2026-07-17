import { notFound } from "next/navigation";

/**
 * Bare `/studio` (no project id) is not a valid editor route (A6 /
 * D-ROUTE-STUDIO) — the editor lives at `/studio/[id]`. This guard 404s it into
 * the themed studio not-found UI (`app/studio/not-found.tsx`).
 *
 * NOTE: the plan's file map said to DELETE this file so bare `/studio` 404s, but
 * under Next 16 a nested `not-found.tsx` only catches `notFound()` throws within
 * its segment — it does NOT handle unmatched URLs (only a ROOT `app/not-found.tsx`
 * does, and none exists here). Deleting the page alone yields Next's generic 404
 * ("could not be found"), which the E-SP4 routing test does not accept. This
 * one-line guard is the scoped fix that produces the intended themed 404 without
 * introducing an app-wide root not-found. Verified against `next dev` 2026-07-16.
 */
export default function BareStudioPage(): never {
  notFound();
}
