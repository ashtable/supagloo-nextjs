// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byTestId, click, mount, queryTestId, type } from "./support/render";

/**
 * Figure 19b — the curated voice list, as a component.
 *
 * Kept to what a Stagehand spec cannot cheaply assert: the composition of the two
 * independent filters, which row carries `RECOMMENDED`, and the two controls that are
 * deliberately ABSENT. The pure selection/remap logic is `speech-voices.test.ts`; this
 * file does not duplicate it.
 */

import VoiceList from "@/app/studio/_components/voice-list";

let mounted: { container: HTMLElement; unmount: () => void } | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

async function list(
  props: Partial<{
    modelId: string | null;
    selectedVoiceId: string | undefined;
    onSelect: (id: string) => void;
  }> = {},
) {
  mounted = await mount(
    <VoiceList
      modelId={props.modelId === undefined ? "canopylabs/orpheus-3b" : props.modelId}
      selectedVoiceId={props.selectedVoiceId}
      onSelect={props.onSelect ?? (() => {})}
    />,
  );
  return mounted.container;
}

const rowNames = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>('[data-testid^="voice-row-"]')].map((el) =>
    el.getAttribute("data-testid")!.replace("voice-row-", ""),
  );

describe("VoiceList", () => {
  it("U-V40: renders the model's voices and derives the count (never a hardcoded 8)", async () => {
    const c = await list();
    const el = byTestId(c, "voice-list");
    expect(Number(el.getAttribute("data-voice-count"))).toBe(rowNames(c).length);
    expect(el.textContent).toContain(`${rowNames(c).length} voices for this model`);
  });

  it("U-V41: exactly one row carries the RECOMMENDED badge", async () => {
    const c = await list();
    expect(c.querySelectorAll('[data-testid="voice-recommended"]')).toHaveLength(1);
  });

  it("U-V42: the search box matches the DESCRIPTOR, not just the name", async () => {
    const c = await list();
    await type(byTestId(c, "voice-filter"), "gravelly");
    expect(rowNames(c)).toEqual(["leo"]);
  });

  it("U-V43: the chips are single-select and COMPOSE with the search box", async () => {
    // 19b draws them as independent, always-visible controls, so one must not reset the
    // other.
    const c = await list();
    await click(byTestId(c, "voice-chip-female"));
    expect(byTestId(c, "voice-chip-female").getAttribute("data-active")).toBe("true");
    expect(byTestId(c, "voice-chip-all").getAttribute("data-active")).toBe("false");

    const femaleOnly = rowNames(c);
    await type(byTestId(c, "voice-filter"), "bright");
    const both = rowNames(c);
    expect(both.length).toBeLessThan(femaleOnly.length);
    expect(both).toEqual(["mia"]);
    // The chip is still active — the search did not clear it.
    expect(byTestId(c, "voice-chip-female").getAttribute("data-active")).toBe("true");
  });

  it("U-V44: a filter with no matches says so rather than rendering an empty panel", async () => {
    const c = await list();
    await type(byTestId(c, "voice-filter"), "zzzz");
    expect(rowNames(c)).toEqual([]);
    expect(queryTestId(c, "voice-none")).not.toBeNull();
  });

  it("U-V45: clicking a row reports the provider voice ID, not the display name", async () => {
    const onSelect = vi.fn();
    const c = await list({ onSelect });
    await click(byTestId(c, "voice-row-tara"));
    expect(onSelect).toHaveBeenCalledWith("tara");
  });

  it("U-V46: with no chosen voice the RECOMMENDED one reads as selected", async () => {
    // It is what the generation will actually use, so showing nothing selected would
    // misreport the state of the project.
    const c = await list({ selectedVoiceId: undefined });
    expect(byTestId(c, "voice-row-zac").getAttribute("data-selected")).toBe("true");
  });

  it("U-V47: an explicit choice overrides the recommendation", async () => {
    const c = await list({ selectedVoiceId: "mia" });
    expect(byTestId(c, "voice-row-mia").getAttribute("data-selected")).toBe("true");
    expect(byTestId(c, "voice-row-zac").getAttribute("data-selected")).toBe("false");
  });

  it("U-V48: the model tag prints the FULL id, not the figure's hand-shortened one", async () => {
    // 19b's header reads `orpheus-3b`; the real id is `canopylabs/orpheus-3b`. Shortening
    // per model is a rule nobody can apply consistently, and the id is what a support
    // conversation needs.
    const c = await list();
    expect(byTestId(c, "voice-model-tag").textContent).toBe("canopylabs/orpheus-3b");
  });

  it("U-V49: an UNKNOWN model still offers a usable list", async () => {
    const c = await list({ modelId: "some/model-nobody-curated" });
    expect(rowNames(c).length).toBeGreaterThan(0);
  });

  it("U-V50: NO audio preview and NO pace control are rendered (settled scope)", async () => {
    // A negative test on purpose. 19b draws a per-row ♪▶/❙❙ preview and a PACE slider;
    // neither ships — the preview needs sample assets and provider spend that do not
    // exist, and PACE has no backing parameter at all (`RequestSpeechArgs` is
    // {modelId, input, voice?}, and `media-client.test.ts` pins the request body). Without
    // this test a later pass would "restore" them from the figure.
    const c = await list();
    expect(c.textContent).not.toContain("PACE");
    expect(c.textContent).not.toContain("❙❙");
    expect(c.querySelector('input[type="range"]')).toBeNull();
    expect(c.textContent).not.toContain("▶");
  });
});
