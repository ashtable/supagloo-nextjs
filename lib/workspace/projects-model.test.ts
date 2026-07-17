import { describe, expect, it } from "vitest";

// `./projects-model` does not exist yet — RED until Step 9 creates
// `lib/workspace/projects-model.ts`. Centralizes the 3 demo projects (glyph-exact
// copy + gradient posters) so nothing is hardcoded in JSX (resolves ambiguities
// #10/#11).
import { DEMO_PROJECTS, sortByLastOpened } from "./projects-model";

describe("DEMO_PROJECTS — the three placeholder projects (glyph-exact)", () => {
  it("UP-1a: exactly three projects", () => {
    expect(DEMO_PROJECTS).toHaveLength(3);
  });

  it("UP-1b: 'Let There Be Light' carries its repo, RENDERED status, opened stamp, poster", () => {
    const genesis = DEMO_PROJECTS.find((p) => p.id === "genesis-light");
    expect(genesis).toMatchObject({
      title: "Let There Be Light",
      repo: "ashsrinivas/genesis-light",
      status: "RENDERED",
      opened: "Opened 2h ago",
      branch: "main",
      posterLabel: "GENESIS · LIGHT",
    });
    // a gradient poster string is present (no thumbnail render pipeline)
    expect(typeof genesis!.posterGradient).toBe("string");
    expect(genesis!.posterGradient.length).toBeGreaterThan(0);
  });

  it("UP-1c: the two draft projects match the wireframe verbatim", () => {
    const psalm = DEMO_PROJECTS.find((p) => p.id === "psalm-23");
    expect(psalm).toMatchObject({
      title: "The Lord Is My Shepherd",
      repo: "ashsrinivas/psalm-23",
      status: "DRAFT",
      opened: "Opened yesterday",
      posterLabel: "PSALM 23",
    });

    const beatitudes = DEMO_PROJECTS.find((p) => p.id === "beatitudes");
    expect(beatitudes).toMatchObject({
      title: "Blessed Are They",
      repo: "ashsrinivas/beatitudes",
      status: "DRAFT",
      opened: "Opened 3 days ago",
      posterLabel: "BEATITUDES",
    });
  });
});

describe("sortByLastOpened", () => {
  it("UP-2: orders most-recent first (genesis → psalm-23 → beatitudes), purely", () => {
    // Feed a scrambled copy so the assertion proves the SORT, not the source order.
    const scrambled = [...DEMO_PROJECTS].reverse();
    const sorted = sortByLastOpened(scrambled);
    expect(sorted.map((p) => p.id)).toEqual([
      "genesis-light",
      "psalm-23",
      "beatitudes",
    ]);
    // pure — the input array is not mutated
    expect(scrambled.map((p) => p.id)).toEqual([
      "beatitudes",
      "psalm-23",
      "genesis-light",
    ]);
  });
});
