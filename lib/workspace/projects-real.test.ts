import { describe, expect, it } from "vitest";

// RED until `lib/workspace/projects-real.ts` ships. The real-mode workspace grid
// source (Task #26 §5.3): `GET /api/projects` → `ProjectDto[]` mapped into the
// existing card view (`DemoProject` shape) and sorted by last-opened. Pure +
// injectable fetch → zero-network tests.
import {
  projectDtoToCard,
  sortCardsByLastOpened,
  relativeOpenedLabel,
  fetchProjectCards,
} from "./projects-real";

const DTO = {
  id: "prj_1",
  slug: "psalm-121",
  name: "Psalm 121",
  repoOwner: "acme",
  repoName: "psalm-121",
  repoVisibility: "private" as const,
  createdFrom: "blank" as const,
  currentBranch: "v0.0.1",
  thumbnailAssetKey: null,
  lastRenderJobId: null,
  lastOpenedAt: "2026-07-21T10:00:00.000Z",
  createdAt: "2026-07-20T00:00:00.000Z",
};

const NOW = new Date("2026-07-21T12:00:00.000Z").getTime();

describe("projectDtoToCard", () => {
  it("U-PR1: maps a DTO to the card view (slug id, owner/name repo, DRAFT, branch)", () => {
    const card = projectDtoToCard(DTO, NOW);
    expect(card.id).toBe("psalm-121"); // slug → the /studio/[slug] route id + testid
    expect(card.title).toBe("Psalm 121");
    expect(card.repo).toBe("acme/psalm-121");
    expect(card.status).toBe("DRAFT"); // no render yet
    expect(card.branch).toBe("v0.0.1");
    expect(card.opened).toContain("ago");
  });

  it("U-PR2: a project with a last render is RENDERED", () => {
    const card = projectDtoToCard(
      { ...DTO, lastRenderJobId: "r1", thumbnailAssetKey: "k" },
      NOW,
    );
    expect(card.status).toBe("RENDERED");
  });
});

describe("relativeOpenedLabel", () => {
  it("U-PR3: renders hours/days-ago captions", () => {
    expect(relativeOpenedLabel("2026-07-21T10:00:00.000Z", NOW)).toBe("Opened 2h ago");
    expect(relativeOpenedLabel("2026-07-20T12:00:00.000Z", NOW)).toBe("Opened yesterday");
    expect(relativeOpenedLabel("2026-07-18T12:00:00.000Z", NOW)).toBe("Opened 3 days ago");
    expect(relativeOpenedLabel("2026-07-21T11:40:00.000Z", NOW)).toBe("Opened just now");
  });
});

describe("sortCardsByLastOpened", () => {
  it("U-PR4: most-recently-opened first", () => {
    const older = { ...DTO, id: "p2", slug: "older", lastOpenedAt: "2026-07-19T00:00:00.000Z" };
    const cards = sortCardsByLastOpened([older, DTO], NOW);
    expect(cards.map((c) => c.id)).toEqual(["psalm-121", "older"]);
  });
});

describe("fetchProjectCards", () => {
  it("U-PR5: GETs /api/projects and returns sorted cards", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(url);
      return new Response(JSON.stringify({ projects: [DTO] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const cards = await fetchProjectCards({ fetchImpl, now: () => NOW });
    expect(seen[0]).toBe("/api/projects");
    expect(cards[0].title).toBe("Psalm 121");
  });

  it("U-PR6: returns [] on a non-200 or thrown fetch (never throws)", async () => {
    const bad = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await fetchProjectCards({ fetchImpl: bad })).toEqual([]);
    const thrown = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await fetchProjectCards({ fetchImpl: thrown })).toEqual([]);
  });
});
