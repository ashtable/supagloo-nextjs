// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { byTestId, click, mount } from "./support/render";
import type { CostEstimate } from "@/lib/studio/cost-estimate";

/**
 * Figure 20b — the pre-video confirmation.
 *
 * The assertions worth having here are the ones a screenshot would not catch: which
 * button is the affirmative one, that the fabricated figures from the drawing are NOT on
 * screen, and that the alternative's cost comes from the honest module rather than a
 * number typed into a design tool.
 */

import VideoWarningDialog from "@/app/studio/_components/video-warning-dialog";

const UNPRICED: CostEstimate = {
  usdPerRun: null,
  rate: null,
  basis: "Gloo prices per token — the total depends on prompt length and alignment.",
  confidence: "unpriced",
};

let mounted: { container: HTMLElement; unmount: () => void } | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

async function dialog(
  over: Partial<{
    sceneCount: number;
    stillEstimate: CostEstimate;
    onUseStillImage: (d: boolean) => void;
    onGenerateVideo: (d: boolean) => void;
    onClose: () => void;
  }> = {},
) {
  mounted = await mount(
    <VideoWarningDialog
      open
      sceneLabel="Scene 02 · The Deep"
      sceneCount={over.sceneCount ?? 4}
      stillEstimate={over.stillEstimate ?? UNPRICED}
      onClose={over.onClose ?? (() => {})}
      onUseStillImage={over.onUseStillImage ?? (() => {})}
      onGenerateVideo={over.onGenerateVideo ?? (() => {})}
    />,
  );
  // The Modal portals to document.body, so queries go against the document.
  return document.body;
}

describe("VideoWarningDialog", () => {
  it("U-D15: names the scene it is about to spend on", async () => {
    const root = await dialog();
    expect(byTestId(root, "video-warning-scene").textContent).toBe(
      "Scene 02 · The Deep",
    );
  });

  it("U-D16: shows the MEASURED time, not the figure's 2–6 MIN", async () => {
    // The one live run took 8 min 5 s. Printing "2–6 MIN" would understate the wait by
    // more than 30% while claiming to be an estimate.
    const root = await dialog();
    expect(byTestId(root, "video-warning-time").textContent).toBe("~8 min");
    expect(root.textContent).not.toContain("2–6");
  });

  it("U-D17: every advisory number carries its qualifier AND its measurement date", async () => {
    const root = await dialog();
    const q = byTestId(root, "video-warning-qualifier").textContent ?? "";
    expect(q).toContain("2026-07-28");
    expect(q.toLowerCase()).toContain("no price");
  });

  it("U-D18: the all-scenes projection is COMPUTED from the real scene count", async () => {
    // 20b's "$2.00" and "24 minutes" assume four scenes and a per-scene time nobody
    // measured. Two scenes must not print the four-scene literals.
    const root = await dialog({ sceneCount: 2 });
    const line = byTestId(root, "video-warning-all-scenes").textContent ?? "";
    expect(line).toContain("2 scenes");
    expect(line).toContain("$1.00");
    expect(line).not.toContain("$2.00");
  });

  it("U-D19: the still-image basis comes from the HONEST cost module", async () => {
    const root = await dialog();
    expect(byTestId(root, "video-warning-still-basis").textContent).toContain(
      UNPRICED.basis,
    );
  });

  it("U-D20: the fabricated figures from the drawing are NOWHERE on screen", async () => {
    // A negative test on purpose: `$0.003`, `1/150th` and `~15 seconds` are numbers no
    // measurement supports, and `cost-estimate.ts`'s rule is "a number we cannot defend is
    // never shown". Without this a later pass would transcribe them back in from 20b.
    const root = await dialog();
    const text = root.textContent ?? "";
    expect(text).not.toContain("$0.003");
    expect(text).not.toContain("1/150");
    expect(text).not.toContain("15 seconds");
  });

  it("U-D21: THE ROLE INVERSION — the CHEAP path is the gradient primary", async () => {
    // The whole point of the screen. Everywhere else the gradient marks the affirmative
    // action; here it marks the RECOMMENDED one, because the affirmative action spends
    // real money in the user's own provider account.
    const root = await dialog();
    const still = byTestId(root, "video-warning-use-still");
    const confirm = byTestId(root, "video-warning-confirm");
    expect(still.style.background).toContain("linear-gradient");
    expect(confirm.style.background).not.toContain("linear-gradient");
    expect(confirm.style.border).toContain("1px solid");
  });

  it("U-D22: the confirm button wears its price", async () => {
    const root = await dialog();
    expect(byTestId(root, "video-warning-confirm").textContent).toBe(
      "Generate video · $0.50",
    );
  });

  it("U-D23: each action reports the don't-warn-again state it was taken with", async () => {
    const onUseStillImage = vi.fn();
    const onGenerateVideo = vi.fn();
    const root = await dialog({ onUseStillImage, onGenerateVideo });

    await click(byTestId(root, "video-warning-use-still"));
    expect(onUseStillImage).toHaveBeenCalledWith(false);

    await click(byTestId(root, "video-warning-dont-ask"));
    await click(byTestId(root, "video-warning-confirm"));
    expect(onGenerateVideo).toHaveBeenCalledWith(true);
  });

  it("U-D24: the checkbox starts UNCHECKED — suppression is always an explicit act", async () => {
    const root = await dialog();
    expect(
      (byTestId(root, "video-warning-dont-ask") as HTMLInputElement).checked,
    ).toBe(false);
  });
});
