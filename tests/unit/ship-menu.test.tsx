// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, mount, queryTestId } from "./support/render";
import type { Mounted } from "./support/render";

/**
 * Task items 3, 4 and 5 — the studio's share popover.
 *
 * Provenance matters for reading these assertions. `SHIP IT`, the platform chips and the
 * "daily recurring post" block are Turn-5 "Wilderness Studio" artefacts — a superseded
 * design direction (Step 4 §1). Turns 7-17 never re-introduce scheduling or social
 * auto-posting anywhere, and no scheduler exists at any layer of the system. So item 4 is
 * a convergence ON the live design, not a departure from it, and item 3 disables (rather
 * than hides) what remains, per plan row 71's honesty rule: *anything the design draws
 * with no backing capability ships visibly disabled with a tooltip — never invisible,
 * never a silent no-op*.
 *
 * Item 5's checkbox ships DISABLED and UNCHECKED per USER DECISION D2. The item text's
 * premise ("we immediately share all videos today") is false: `POST /v1/renders/:id/gallery`
 * is opt-in and owner-only, and 16b gates it behind a consent checkbox that deliberately
 * ships unchecked. A checked box here would assert a behaviour the system does not have.
 */

vi.mock("@/lib/studio/studio-data", () => ({
  commitVersion: vi.fn(),
  publishVersion: vi.fn(),
  fetchVersions: vi.fn(async () => null),
}));
vi.mock("@/lib/studio/render-data", () => ({
  startRenderJob: vi.fn(),
  cancelRenderJob: vi.fn(),
  fetchRenderDownloadUrl: vi.fn(),
  pollRenderUntilTerminal: vi.fn(),
}));
vi.mock("@/lib/studio/ai-generation-data", () => ({
  createGeneration: vi.fn(),
  pollGenerationUntilTerminal: vi.fn(),
  presignDownload: vi.fn(),
}));

import ShipMenu from "@/app/studio/_components/ship-menu";
import { StudioProvider } from "@/app/studio/_components/studio-context";
import { DEMO_STORYBOARD } from "@/lib/studio/storyboard";
import type { StudioProject } from "@/lib/studio/project";

const PROJECT: StudioProject = {
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
};

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.resetAllMocks();
});

async function open() {
  mounted = await mount(
    <StudioProvider project={PROJECT}>
      <ShipMenu />
    </StudioProvider>,
  );
  return byTestId(mounted.container, "ship-menu");
}

describe("ShipMenu — items 3/4/5", () => {
  it("U-SM1: the popover is titled SHARE; the superseded SHIP IT string is gone", async () => {
    const panel = await open();
    expect(panel.textContent).toContain("SHARE");
    expect(panel.textContent).not.toContain("SHIP IT");
  });

  it("U-SM2: all three platform chips are DISABLED and each carries a title saying why", async () => {
    const panel = await open();
    for (const id of ["share-tiktok", "share-yt-shorts", "share-add-platform"]) {
      const chip = byTestId(panel, id) as HTMLButtonElement;
      expect(chip.disabled, `${id} must be disabled`).toBe(true);
      expect(chip.getAttribute("title"), `${id} must explain itself`).toBeTruthy();
    }
  });

  it("U-SM2b: a disabled chip does not wear a ✓ — a check on a dead control reads as 'selected'", async () => {
    const panel = await open();
    expect(byTestId(panel, "share-tiktok").textContent).toBe("TikTok");
    expect(byTestId(panel, "share-yt-shorts").textContent).toBe("YT Shorts");
    expect(panel.textContent).not.toContain("✓ ");
  });

  it("U-SM3: clicking a chip changes nothing (it is disabled, not merely inert)", async () => {
    const panel = await open();
    const before = panel.outerHTML;
    await click(byTestId(panel, "share-tiktok"));
    await click(byTestId(panel, "share-yt-shorts"));
    expect(panel.outerHTML).toBe(before);
  });

  it("U-SM4: the daily-recurring block and its nested rows are GONE (item 4)", async () => {
    const panel = await open();
    expect(queryTestId(panel, "post-auto")).toBeNull();
    expect(panel.textContent).not.toContain("Make this a daily recurring post");
    expect(panel.textContent).not.toContain("Approve each cut before it posts");
    expect(panel.textContent).not.toContain("Post automatically");
  });

  it("U-SM5: the gallery row exists, DISABLED and UNCHECKED, with a title (USER DECISION D2)", async () => {
    const panel = await open();
    const row = byTestId(panel, "share-gallery") as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    expect(row.getAttribute("data-checked")).toBe("false");
    expect(row.getAttribute("aria-checked")).toBe("false");
    expect(row.getAttribute("title")).toBeTruthy();
    // house voice: `gallery` lowercase in sentence copy (uppercase only in eyebrows)
    expect(row.textContent).toContain("Share to the gallery");
    expect(row.textContent).not.toContain("Gallery");
  });

  it("U-SM6: clicking the gallery row does not check it", async () => {
    const panel = await open();
    const row = byTestId(panel, "share-gallery");
    await click(row);
    expect(row.getAttribute("data-checked")).toBe("false");
  });
});
