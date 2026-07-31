// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, flush, mount, selectOption } from "./support/render";
import type { Mounted } from "./support/render";

/**
 * THE WIRE PIN — pick a voice, regenerate narration, and inspect the request body.
 *
 * ## Why this exists even though nothing is broken here
 *
 * The reported symptom ("the same female voice for Alloy and Shimmer") was diagnosed as
 * `voiceId` never reaching a generation, with a live `AiGeneration` query as evidence.
 * That diagnosis was WRONG and was disproved three ways: a probe of this exact hop
 * captured a body carrying `voiceId`; the api's schema parse retains it; and the DB rows
 * were test fixtures plus user rows created **4 h 20 m before the picker shipped**. The
 * real cause was that the picker offered eight ids the model does not have.
 *
 * But the hop was — and this is the point — **unpinned end to end**. Nothing in any lane
 * asserted that the value the user picks becomes the value the request carries; the
 * diagnosis was plausible precisely because no test could contradict it. So the fix for
 * "bug 1" is this file, and nothing else.
 *
 * ## Why jsdom and not a live e2e
 *
 * A live narration generation costs real provider credit and this lane has a recorded
 * history of `402 out of credit`. Every claim here is about the REQUEST SHAPE, which an
 * injected `createGeneration` observes exactly and for free. What a live run adds — that
 * OpenRouter accepts the id — is a provider fact, not ours, and is covered by the api's
 * catalogue read.
 */

const fetchModelCatalogue = vi.hoisted(() => vi.fn());
const createGeneration = vi.hoisted(() => vi.fn());
const pollGenerationUntilTerminal = vi.hoisted(() => vi.fn());
const presignDownload = vi.hoisted(() => vi.fn());

vi.mock("@/lib/studio/model-catalogue-data", () => ({ fetchModelCatalogue }));
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
  createGeneration,
  pollGenerationUntilTerminal,
  presignDownload,
}));

import SceneInspector from "@/app/studio/_components/scene-inspector";
import { StudioProvider } from "@/app/studio/_components/studio-context";
import { DEMO_STORYBOARD } from "@/lib/studio/storyboard";
import type { StudioProject } from "@/lib/studio/project";
import type { ProjectManifest } from "@/lib/api/contracts";

/** Kokoro's live vocabulary, trimmed. TEST DATA — the source never names a voice. */
const KOKORO_VOICES = [
  "af_alloy", "af_nova", "am_adam", "am_echo", "am_onyx", "bm_daniel", "ff_siwis",
];
/** A second model with a DISJOINT vocabulary, so a stale id is visible as itself. */
const ORPHEUS_VOICES = ["tara", "leah", "zac"];

const MANIFEST: ProjectManifest = {
  manifestVersion: 1,
  composition: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
  scenes: DEMO_STORYBOARD.scenes.map((s) => ({
    id: s.id,
    name: s.visualLabel,
    scriptText: s.script,
    reference: "JOHN 1:23",
    translation: "KJV",
    visualPrompt: s.visualPrompt,
    durationSeconds: s.durationSeconds,
    captions: s.onScreenText === "text",
  })),
  narratorVoice: { description: DEMO_STORYBOARD.voiceDescription },
};

const CATALOGUE = {
  models: [
    {
      id: "hexgrad/kokoro-82m",
      provider: "openrouter" as const,
      label: "hexgrad: Kokoro 82M",
      kinds: ["narration" as const],
      pricing: { perInputToken: 0.00000062 },
      voices: KOKORO_VOICES,
    },
    {
      id: "canopylabs/orpheus-3b-0.1-ft",
      provider: "openrouter" as const,
      label: "Canopy Labs: Orpheus 3B",
      kinds: ["narration" as const],
      pricing: null,
      voices: ORPHEUS_VOICES,
    },
  ],
  providers: { gloo: false, openrouter: true },
  defaults: {
    narration: { provider: "openrouter" as const, model: "hexgrad/kokoro-82m" },
  },
};

const project = (): StudioProject => ({
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
  manifest: MANIFEST,
});

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.resetAllMocks();
});

async function open() {
  fetchModelCatalogue.mockResolvedValue(CATALOGUE);
  // A generation that never settles: this file asserts on the REQUEST, and letting the
  // poll resolve would drag the presign/asset path into every case for nothing.
  createGeneration.mockResolvedValue({ id: "gen-1", status: "queued" });
  pollGenerationUntilTerminal.mockReturnValue(new Promise(() => {}));

  mounted = await mount(
    <StudioProvider project={project()}>
      <SceneInspector />
    </StudioProvider>,
  );
  await flush();
  return mounted.container;
}

/** The body of the one `createGeneration` call, typed enough to assert on. */
function narrationBody() {
  expect(createGeneration).toHaveBeenCalledTimes(1);
  return createGeneration.mock.calls[0][0] as {
    kind: string;
    model: string;
    input: { voiceId?: string; voice: { voiceId?: string } };
  };
}

describe("the chosen narrator voice reaches the generation request", () => {
  it("U-V60: a picked voice travels TOP-LEVEL and nested, verbatim", async () => {
    const c = await open();

    await selectOption(byTestId(c, "voice-select"), "am_onyx");
    await click(byTestId(c, "regenerate-narration"));

    const body = narrationBody();
    expect(body.kind).toBe("narration");
    // Top-level is the load-bearing placement: `GenerateNarrationInputSchema` is
    // `NarrationSpecSchema.passthrough()`, so a top-level key survives an api/dbos pinned
    // to an older db-lib, while a key nested inside `voice` is stripped by
    // `VoiceDescriptorSchema` (a plain `z.object`). Both are asserted because the nested
    // copy is what the manifest's `narratorVoice` carries.
    expect(body.input.voiceId).toBe("am_onyx");
    expect(body.input.voice.voiceId).toBe("am_onyx");
  });

  it("U-V61: with NO explicit pick, the body carries the DERIVED default", async () => {
    // What the picker SHOWS selected and what the request SENDS must be the same value.
    // The shipped picker read `selected = selectedVoiceId ?? recommended` for display and
    // omitted `voiceId` entirely from the request when nothing was picked — so it showed a
    // voice as chosen while the provider fell back to its own. Two answers to one
    // question, and only one of them audible.
    const c = await open();

    expect((byTestId(c, "voice-select") as HTMLSelectElement).value).toBe("am_adam");
    await click(byTestId(c, "regenerate-narration"));

    const body = narrationBody();
    expect(body.input.voiceId).toBe("am_adam");
    expect(body.input.voice.voiceId).toBe("am_adam");
  });

  it("U-V62: the body NEVER carries an id the resolved model does not list", async () => {
    // The whole of the reported bug, at the boundary that produced it: `shimmer` is not a
    // Kokoro voice. It was accepted, sent, and silently aliased onto an American FEMALE
    // Kokoro voice — which is why "Alloy" and "Shimmer" sounded like the same narrator.
    const c = await open();

    // GENDER first, deliberately. The VOICE select only offers the CURRENT bucket, and
    // assigning a `<select>` a value it does not offer is a silent no-op (`selectedIndex`
    // becomes -1 and the change event carries ""), so reaching a female voice really does
    // require walking the cascade — which is the control working.
    await selectOption(byTestId(c, "voice-gender"), "female");
    await selectOption(byTestId(c, "voice-select"), "af_nova");
    await click(byTestId(c, "regenerate-narration"));
    expect(narrationBody().input.voiceId).toBe("af_nova");

    const sent = createGeneration.mock.calls[0][0] as {
      model: string;
      input: { voiceId?: string };
    };
    const listed = CATALOGUE.models.find((m) => m.id === sent.model)!.voices;
    expect(listed).toContain(sent.input.voiceId);
  });
});
