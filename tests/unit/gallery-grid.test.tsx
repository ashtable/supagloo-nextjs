// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byTestId, click, mount, queryTestId } from "./support/render";

/**
 * Turn 17b card 4a — the `NOTHING HERE YET.` empty state (plan slice C9).
 *
 * THREE mutually exclusive zero-item states live in this component, and the design draws
 * exactly ONE of them. That asymmetry is the reason this file exists: it would be easy —
 * and wrong — for a later "simplification" to fold loading and error into the designed
 * card, because 4a is the only one with a picture. Loading is not empty, and an error is
 * not empty either; an error means we do not KNOW whether it is empty, which is why it
 * keeps its retry and 4a offers none.
 */

import GalleryGrid from "@/app/_components/gallery/gallery-grid";

let mounted: { container: HTMLElement; unmount: () => void } | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

async function grid(
  props: Partial<{
    loading: boolean;
    error: boolean;
    searchTerm: string;
    onRetry: () => void;
    onClearFilters: () => void;
  }> = {},
) {
  mounted = await mount(
    <GalleryGrid
      items={[]}
      loading={props.loading ?? false}
      error={props.error ?? false}
      searchTerm={props.searchTerm ?? ""}
      voting={new Set<string>()}
      onRetry={props.onRetry ?? (() => {})}
      onClearFilters={props.onClearFilters ?? (() => {})}
      onVote={() => {}}
    />,
  );
  return mounted.container;
}

describe("GalleryGrid's three zero-item states", () => {
  it("U-GG1: items=[] + loading renders the loading state and NOT the empty card", async () => {
    const c = await grid({ loading: true });
    expect(queryTestId(c, "gallery-loading")).not.toBeNull();
    expect(queryTestId(c, "gallery-empty")).toBeNull();
    expect(queryTestId(c, "gallery-error")).toBeNull();
  });

  it("U-GG2: items=[] + error renders the error card WITH Try again and NOT the empty card", async () => {
    const onRetry = vi.fn();
    const c = await grid({ error: true });
    expect(queryTestId(c, "gallery-error")).not.toBeNull();
    expect(queryTestId(c, "gallery-empty")).toBeNull();
    expect(queryTestId(c, "gallery-loading")).toBeNull();

    mounted?.unmount();
    mounted = null;
    const c2 = await grid({ error: true, onRetry });
    await click(byTestId(c2, "gallery-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("U-GG3: items=[] + a search term quotes the term in the copy; with no term the copy omits it", async () => {
    const onClearFilters = vi.fn();
    const c = await grid({ searchTerm: "Habakkuk", onClearFilters });

    expect(byTestId(c, "gallery-empty-title").textContent).toBe("NOTHING HERE YET.");
    const copy = byTestId(c, "gallery-empty-copy").textContent ?? "";
    expect(copy).toContain('No public videos match "Habakkuk".');
    // The searched term is BOLD (`var(--sg-fg)`) inside the dim sentence — the design's
    // one piece of emphasis here, and the thing the reader is looking for.
    expect(byTestId(c, "gallery-empty-term").textContent).toBe("Habakkuk");

    // `Clear filters` is the way out of a search that found nothing.
    await click(byTestId(c, "gallery-clear-filters"));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    // …and the invitation is always there.
    expect(queryTestId(c, "gallery-create-verse")).not.toBeNull();

    mounted?.unmount();
    mounted = null;

    const c2 = await grid({ searchTerm: "" });
    expect(byTestId(c2, "gallery-empty-title").textContent).toBe("NOTHING HERE YET.");
    const copy2 = byTestId(c2, "gallery-empty-copy").textContent ?? "";
    expect(copy2).not.toContain('"');
    expect(copy2).not.toContain("match");
    expect(queryTestId(c2, "gallery-empty-term")).toBeNull();
    // Nothing is filtered, so there is nothing to clear — and a control that does
    // nothing when pressed is exactly what the honesty rule forbids.
    expect(queryTestId(c2, "gallery-clear-filters")).toBeNull();
    expect(queryTestId(c2, "gallery-create-verse")).not.toBeNull();
  });
});
