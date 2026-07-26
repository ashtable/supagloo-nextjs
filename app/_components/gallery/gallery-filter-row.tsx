"use client";

import SegmentedControl from "../segmented-control";
import GallerySearch from "./gallery-search";
import { GALLERY_SORTS, type GallerySort } from "@/lib/gallery/gallery-model";

/**
 * The filter row: the sort segmented control on the left, a spacer, the search pill on
 * the right.
 *
 * THAT IS THE WHOLE ROW. Turn 15 also drew an `All books ▾` pill; it was cut on
 * 2026-07-26 and is not coming back as a different control. Which books exist is a
 * property of the TRANSLATION and the YouVersion API is the authority on it, so a facet
 * enumerated from a canon hardcoded in this repo would have quietly disagreed with
 * reality — and filtering the gallery by book is not wanted in the first place. Sorting
 * and free-text search are enough.
 *
 * Not mount-gated: this chrome server-renders with the header (D14 gates only the grid).
 */
export default function GalleryFilterRow({
  sort,
  onSortChange,
  search,
  onSearchChange,
}: {
  sort: GallerySort;
  onSortChange: (sort: GallerySort) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div
      data-testid="gallery-filter-row"
      className="flex flex-wrap items-center px-4 sm:px-[34px]"
      style={{ gap: 10, paddingBottom: 18 }}
    >
      <SegmentedControl<GallerySort>
        segments={GALLERY_SORTS}
        value={sort}
        onChange={onSortChange}
        dense
        testId="gallery-sort"
      />
      <div className="hidden sm:block" style={{ flex: 1 }} />
      <GallerySearch value={search} onChange={onSearchChange} />
    </div>
  );
}
