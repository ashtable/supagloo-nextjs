// @vitest-environment jsdom
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, flush, mount } from "./support/render";
import type { Mounted } from "./support/render";

/**
 * R5 / R7 / D2 / D3 — the Inspector's ACTION buttons, gated on what the user has actually
 * connected.
 *
 * ## The dishonesty this closes
 *
 * `providerOptionsFor` has always greyed out an unconnected provider TAB. Nothing greyed
 * out the buttons those tabs configure. So a user with only Gloo saw
 * `OpenRouter — Not connected` above a live `↻ Regenerate narration`, clicked it, watched a
 * spinner, and got a generic failure minutes later from deep inside DBOS — because
 * `POST /v1/ai/generations` accepted the request (`narration`+`openrouter` is matrix-valid,
 * so the 422 never fired) and only died at credential-decrypt time.
 *
 * The api's new `provider_not_connected` 409 is the authority; this is the half that stops
 * the user asking. Both halves are needed: the UI cannot cover a stale tab or a direct POST,
 * and the server cannot make a button look dead.
 *
 * ## Where the truth comes from — and the fixture that proves it (D4)
 *
 * Connectivity is read from `state.modelCatalogue.providers`, NOT from the session, and
 * this file's session mock reports EVERYTHING connected in every case. So any assertion
 * below that expects a disabled control is unsatisfiable for an implementation that reads
 * the session. That is deliberate:
 *
 *  · `providers.*` is server-derived and documented (api `model-catalogue-service.ts`) to
 *    mean "is this user CONNECTED", not "did the catalogue read succeed";
 *  · the client's `ConnectionsState` conflates "not connected" with "we could not ask"
 *    (`applyConnectionsBase` never sets not-linked, and the hydrate effect returns early on
 *    failure), and `?seed=authed-returning` pre-marks GitHub + OpenRouter connected
 *    regardless of the database — a seam that has already made a connect helper a silent
 *    no-op once.
 *
 * ## Why the clicks are real
 *
 * `click()` dispatches a genuine DOM event, so a `disabled` attribute actually
 * short-circuits it. Calling `onClick()` directly would report "disabled" for a button that
 * still fires.
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

/** EVERYTHING connected, in EVERY test. See the docblock: this is the discriminating
 *  fixture for D4, not a convenience. */
const ALL_CONNECTED_SESSION = {
  mounted: true,
  sessionResolved: true,
  isMock: false,
  connections: {
    github: { provider: "github", status: "connected" },
    openrouter: { provider: "openrouter", status: "connected" },
    gloo: { provider: "gloo", status: "connected" },
  },
};
vi.mock("@/app/_components/session-provider", () => ({
  useSession: () => ALL_CONNECTED_SESSION,
  useOptionalSession: () => ALL_CONNECTED_SESSION,
}));

import SceneInspector from "@/app/studio/_components/scene-inspector";
import { StudioProvider, useStudio } from "@/app/studio/_components/studio-context";
import { resolveGenerationTarget } from "@/lib/api/ai-config";
import { DEMO_STORYBOARD } from "@/lib/studio/storyboard";
import type { StudioProject } from "@/lib/studio/project";
import type {
  AiModelInfo,
  AiProvider,
  ProjectManifest,
} from "@/lib/api/contracts";

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

/** OpenRouter's catalogue is PUBLIC — the api reads it whether or not the user has
 *  connected — so these entries are present in every fixture below. That is what makes the
 *  disabled assertions about CONNECTIVITY rather than about an empty list. */
const OPENROUTER_MODELS: AiModelInfo[] = [
  {
    id: "google/gemini-3.1-flash-image",
    provider: "openrouter",
    label: "Nano Banana 2",
    kinds: ["image"],
    pricing: { perImage: 0.03 },
    voices: null,
  },
  {
    id: "hexgrad/kokoro-82m",
    provider: "openrouter",
    label: "Kokoro 82M",
    kinds: ["narration"],
    pricing: null,
    voices: ["am_adam", "am_michael"],
  },
  {
    id: "google/lyria-3-clip-preview",
    provider: "openrouter",
    label: "Lyria 3",
    kinds: ["music"],
    pricing: null,
    voices: null,
  },
  {
    id: "x-ai/grok-imagine-video",
    provider: "openrouter",
    label: "Grok Imagine Video",
    kinds: ["video"],
    pricing: null,
    voices: null,
  },
];

/** Gloo's catalogue is read ONLY when a credential exists (`model-catalogue-service.ts`
 *  reads it behind `glooCredential ? … : []`), so an unconnected Gloo publishes no models
 *  at all — exactly as modelled below. */
const GLOO_MODELS: AiModelInfo[] = [
  {
    id: "gloo-google-gemini-2.5-flash-image",
    provider: "gloo",
    label: "Gemini 2.5 Flash Image",
    kinds: ["image"],
    pricing: { perImage: 0.03 },
    voices: null,
  },
];

/**
 * The catalogue exactly as the BFF publishes it for a given connectivity — including
 * `defaults`, taken from the SAME resolver `app/api/ai/models/route.ts` calls.
 *
 * Deriving `defaults` rather than hand-writing them is what makes these tests about the
 * composition: the resolver's own answers are pinned against literal, live-verified ids in
 * `lib/api/ai-config.test.ts` (`U-DT4`/`U-DT5`/`U-DT6`), and what is proven HERE is that
 * the panel renders whatever that resolver decided. A hand-written `defaults` map would
 * assert the fixture instead.
 */
function catalogueFor(providers: { gloo: boolean; openrouter: boolean }) {
  const defaults: Record<string, { provider: AiProvider; model: string }> = {};
  for (const kind of ["image", "narration", "music", "video"] as const) {
    const t = resolveGenerationTarget(kind, {}, providers);
    defaults[kind] = { provider: t.provider as AiProvider, model: t.model };
  }
  return {
    models: [...OPENROUTER_MODELS, ...(providers.gloo ? GLOO_MODELS : [])],
    providers,
    defaults,
  };
}

const GLOO_ONLY = { gloo: true, openrouter: false };
const OPENROUTER_ONLY = { gloo: false, openrouter: true };
const NEITHER = { gloo: false, openrouter: false };
const BOTH = { gloo: true, openrouter: true };

const realProject = (): StudioProject => ({
  id: "psalm-121",
  projectName: "psalm-121",
  repo: "ashsrinivas/psalm-121",
  versionBranch: "v0.0.1",
  storyboard: DEMO_STORYBOARD,
  manifest: MANIFEST,
});

/** The four per-scene / per-project AI action buttons R5/R7/D2 govern. */
const ACTIONS = [
  "reroll-visual",
  "generate-scene-video",
  "regenerate-narration",
  "regenerate-music",
] as const;

let mounted: Mounted | null = null;
let videoWarningNow: () => string | null = () => null;

function StudioProbe() {
  const { videoWarningSceneId } = useStudio();
  useEffect(() => {
    videoWarningNow = () => videoWarningSceneId;
  });
  return null;
}

async function openWith(providers: { gloo: boolean; openrouter: boolean }) {
  fetchModelCatalogue.mockResolvedValue(catalogueFor(providers));
  mounted = await mount(
    <StudioProvider project={realProject()}>
      <SceneInspector />
      <StudioProbe />
    </StudioProvider>,
  );
  await flush();
  return mounted.container;
}

const isDisabled = (root: ParentNode, testId: string) =>
  (byTestId(root, testId) as HTMLButtonElement).disabled;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.resetAllMocks();
});

describe("R7 — no OpenRouter disables the OpenRouter-only controls", () => {
  it("U-PG1: `↻ Regenerate narration` is disabled, and a real click spends nothing", async () => {
    // Gloo publishes ZERO speech models (107-model catalogue, verified live 2026-07-31), so
    // there is no second provider to reroute onto. Narration is genuinely unavailable, and
    // the honest thing is to say so before the user pays for a failure.
    const root = await openWith(GLOO_ONLY);
    expect(isDisabled(root, "regenerate-narration")).toBe(true);

    await click(byTestId(root, "regenerate-narration"));
    expect(createGeneration).not.toHaveBeenCalled();
  });

  it("U-PG2: `↻ Regenerate music` is disabled", async () => {
    const root = await openWith(GLOO_ONLY);
    expect(isDisabled(root, "regenerate-music")).toBe(true);

    await click(byTestId(root, "regenerate-music"));
    expect(createGeneration).not.toHaveBeenCalled();
  });

  it("U-PG3: `▶ Generate video` is disabled TOO — the decision R7 did not make", async () => {
    // ⚠️ R7 names image + music + narration and omits `video`. But `AI_PROVIDERS_BY_KIND`
    // makes video openrouter-ONLY, so with no OpenRouter the per-scene clip button is
    // exactly as unusable as the other two. Leaving it live ships a button that cannot
    // succeed — the precise dishonesty R5/R7 exist to remove — and the asymmetry is already
    // visible today: `ai-settings-panel.tsx`'s `kindAvailable` ALREADY greys the video MODEL
    // SELECT here. So today the UI says "you cannot configure this" while still offering to
    // spend money on it.
    const root = await openWith(GLOO_ONLY);
    expect(isDisabled(root, "generate-scene-video")).toBe(true);
    expect((byTestId(root, "ai-kind-video").dataset.available ?? "")).toBe("false");

    await click(byTestId(root, "generate-scene-video"));
    expect(videoWarningNow()).toBeNull();
    expect(createGeneration).not.toHaveBeenCalled();
  });

  it("U-PG4: `↻ Reroll visual` stays ENABLED — R7's 'they can still do image generation'", async () => {
    // The control against over-disabling. Image is the one media kind with two providers;
    // a rule that disabled the whole card whenever ANY provider was missing would take away
    // the capability R7 explicitly says the user keeps.
    const root = await openWith(GLOO_ONLY);
    expect(isDisabled(root, "reroll-visual")).toBe(false);

    await click(byTestId(root, "reroll-visual"));
    expect(createGeneration).toHaveBeenCalledTimes(1);
    expect(createGeneration.mock.calls[0]![0]).toMatchObject({
      kind: "image",
      provider: "gloo",
      model: "gloo-google-gemini-2.5-flash-image",
    });
  });
});

describe("D3 — an existing project opened with NOTHING connected", () => {
  it("U-PG5: every AI action is disabled, and the editor is still fully up", async () => {
    // R3 blocks CREATION, never opening. Today this state resolves to
    // `{provider:"openrouter", model:null}`, the client sends no target, the BFF substitutes
    // the deployment default, the api answers 201, and it dies deep in DBOS.
    const root = await openWith(NEITHER);
    for (const id of ACTIONS) {
      expect(isDisabled(root, id), `${id} must be disabled`).toBe(true);
    }
    // Nothing is HIDDEN and nothing crashes: everything that needs no model provider —
    // editing, scripture, captions, duration — is untouched, so the Inspector still
    // explains itself instead of going quietly dead.
    expect(byTestId(root, "script-input")).toBeTruthy();
    expect(byTestId(root, "visual-input")).toBeTruthy();
    expect(byTestId(root, "captions-switch")).toBeTruthy();
    expect(byTestId(root, "scene-duration")).toBeTruthy();
  });
});

describe("R4 — no Gloo moves image onto OpenRouter, end to end through the panel", () => {
  it("U-PG6: the OpenRouter tab is selected, its model is chosen, and the reroll works", async () => {
    // The bug this fixes, measured: with Gloo unconnected the BFF still published
    // `defaults.image = {provider:"gloo", …}`, so `resolveChoice` returned gloo, the Gloo
    // tab rendered DISABLED, `isSelected = option.available && …` made NEITHER tab appear
    // selected, and `modelsFor("image","gloo")` was `[]` because the api returns no Gloo
    // models without a credential — so the model select read "no models available".
    // Image generation was simply unusable for a no-Gloo user.
    const root = await openWith(OPENROUTER_ONLY);

    const openrouterTab = byTestId(root, "ai-provider-image-openrouter");
    expect(openrouterTab.dataset.available).toBe("true");
    expect(openrouterTab.dataset.selected).toBe("true");

    const glooTab = byTestId(root, "ai-provider-image-gloo");
    expect(glooTab.dataset.available).toBe("false");
    expect(
      byTestId(root, "ai-provider-reason-image-gloo").textContent ?? "",
    ).toMatch(/not connected/i);

    const select = byTestId(root, "ai-model-image") as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect(select.value).toBe("google/gemini-3.1-flash-image");

    expect(isDisabled(root, "reroll-visual")).toBe(false);
    await click(byTestId(root, "reroll-visual"));
    expect(createGeneration.mock.calls[0]![0]).toMatchObject({
      kind: "image",
      provider: "openrouter",
      model: "google/gemini-3.1-flash-image",
    });
  });
});

describe("the reason is always on screen", () => {
  it("U-PG7: every disabled action button carries a `title` naming WHY", async () => {
    // A disabled control is a lie if the reason is invisible. The provider tabs already
    // render `<Provider> — Not connected` + `Link ▸`, but those sit in a different card from
    // `↻ Regenerate music`, and a greyed button with no explanation reads as a bug.
    const root = await openWith(NEITHER);
    const missing: string[] = [];
    for (const id of ACTIONS) {
      const title = byTestId(root, id).getAttribute("title") ?? "";
      if (title.trim().length === 0) missing.push(id);
    }
    expect(missing).toEqual([]);
    // …and the reason has to be the ACTUAL one, not a generic "unavailable".
    expect(byTestId(root, "regenerate-narration").getAttribute("title")).toMatch(
      /openrouter/i,
    );
    expect(byTestId(root, "reroll-visual").getAttribute("title")).toMatch(
      /no model provider/i,
    );
  });
});

describe("the TURN-20 generation guardrails are not regressed", () => {
  it("U-PG8: a RUNNING generation still disables, and video still confirms before spending", async () => {
    // The new connection gate must COMPOSE with the busy-lock and the cost confirmation,
    // never replace them. Both were shipped deliberately (TURN 20) and neither is in this
    // task's scope.
    const root = await openWith(BOTH);

    // (a) the cost confirmation still stands in front of the spend.
    expect(isDisabled(root, "generate-scene-video")).toBe(false);
    await click(byTestId(root, "generate-scene-video"));
    expect(videoWarningNow()).not.toBeNull();
    expect(createGeneration).not.toHaveBeenCalled();

    // (b) the busy-lock still disables the buttons while a generation is running. The poll
    // never settles, so the studio stays in `running` for the rest of the test.
    createGeneration.mockResolvedValue("gen-1");
    pollGenerationUntilTerminal.mockReturnValue(new Promise(() => {}));
    await click(byTestId(root, "regenerate-narration"));
    expect(createGeneration).toHaveBeenCalledTimes(1);
    expect(byTestId(root, "regenerate-narration").dataset.state).toBe("running");
    expect(isDisabled(root, "regenerate-narration")).toBe(true);
  });
});
