"use client";

import styles from "../studio.module.css";
import { useStudio } from "./studio-context";
import ScripturePicker from "./scripture-picker";
import AiSettingsPanel from "./ai-settings-panel";
import VoiceList from "./voice-list";
import {
  imageSlot,
  videoSlot,
  NARRATION_SLOT,
  MUSIC_SLOT,
} from "@/lib/studio/reducer";
import { MIN_SCENES, canDeleteScene } from "@/lib/studio/storyboard";
import {
  generationActionAvailability,
  resolveChoice,
} from "@/lib/studio/ai-settings";
import { voicesForModelId } from "@/lib/studio/speech-voices";

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const MONO = "ui-monospace, Menlo, monospace";
const ZILLA = "var(--font-zilla), 'Zilla Slab', Georgia, serif";

const LABEL: React.CSSProperties = {
  fontFamily: SEMI,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: ".16em",
  color: "#a99b85",
  marginBottom: 7,
};
const GOLD_LABEL: React.CSSProperties = { ...LABEL, color: "#e6a43b" };

/**
 * Figure 19a's card chrome. Geometry taken literally; COLOUR translated — 19a/19b/20a/20b
 * are a third dark palette, consistently a few units off Wilderness, and the house rule at
 * `scripture-picker.tsx:56` is take the geometry and translate the colour.
 */
const CARD: React.CSSProperties = {
  border: "1px solid rgba(230,180,120,.13)",
  borderRadius: 13,
  overflow: "hidden",
  background: "#1b1410",
};
const CARD_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "11px 14px",
  borderBottom: "1px solid rgba(230,180,120,.1)",
};
const CARD_BODY: React.CSSProperties = { padding: 14 };
/** The model sub-block under a prompt: a hairline, then the controls. */
const SUB_BLOCK: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 14,
  borderTop: "1px solid rgba(230,180,120,.1)",
};

/**
 * 19a's scope tag. The vocabulary is closed — `this scene` / `whole video` — and it
 * scopes the PROMPT the card is built around, not the model selector co-located beneath
 * it. That distinction is load-bearing: `AiGenerationSettingsSchema` records that model
 * choice is project-level and that going per-scene is a manifest migration against an
 * explicit written decision.
 */
function ScopePill({ scope }: { scope: "this scene" | "whole video" }) {
  return (
    <span
      style={{
        fontSize: 9.5,
        color: "#a99b85",
        border: "1px solid rgba(230,180,120,.2)",
        borderRadius: 20,
        padding: "2px 8px",
      }}
    >
      {scope}
    </span>
  );
}
const STAT_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "11px 13px",
  border: "1px solid rgba(230,180,120,.12)",
  borderRadius: 10,
  background: "#0f0b07",
};

/**
 * §7 (D-INSPECTOR-KEEP-EDIT) — the 13b scene inspector: a resting-state visual
 * over the SAME edit seams. Restyled to 13b (300px, simple header, blockquote
 * script, dashed visual box, single captions switch, derived duration) while
 * KEEPING the live `script-input` / `visual-input` / captions edit seams that
 * the whole dirty/Commit/Publish machinery (and E8/E-SP2/E-VER2) depend on. The
 * purely-decorative 5a extras (voice-preview row, music-mood cycler, image
 * dropzone, footer tagline, two-way onscreen pill, the big Anton number, the
 * scene range, the redundant header reroll) are dropped; 13b's `↻ Reroll visual`
 * (inert) and `scene-duration` are added.
 */
export default function SceneInspector() {
  const {
    state,
    dispatch,
    project,
    rerollVisual,
    regenerateNarration,
    regenerateMusic,
    requestSceneVideo,
    removeScene,
    setVoiceId,
  } = useStudio();
  const { storyboard, selectedSceneId, generations } = state;
  const canDelete = canDeleteScene(storyboard);
  const scene =
    storyboard.scenes.find((s) => s.id === selectedSceneId) ??
    storyboard.scenes[0];
  const showCaptions = scene.onScreenText === "text";

  // AI controls (editable voice, music bed, regenerate triggers) render only for a
  // REAL project (a source manifest is present). The mock catalog keeps the
  // canonical 13b read-only inspector byte-for-byte, so the mock studio regression
  // specs stay green. Signal = `project.manifest`, the same one commit()/publish()
  // branch on.
  const aiEnabled = Boolean(project.manifest);

  // 19a orders the narration card provider -> model -> VOICE, "because the voice options
  // come FROM the model". This is the resolved speech model the list keys off; a change
  // to it remaps the chosen voice (see `remapVoiceForSettings` in the reducer).
  //
  // `null` until the catalogue lands, and that is now a MEANINGFUL null rather than an
  // ignorable one: the voice list is the resolved model's own published vocabulary, so
  // before a model resolves there is nothing to offer. `<VoiceList>` renders that state
  // instead of accepting a pick against a list belonging to no model.
  const narrationModelId = resolveChoice(
    "narration",
    storyboard.aiSettings,
    state.modelCatalogue?.defaults ?? {},
    state.modelCatalogue?.models ?? [],
  ).model;
  // The provider's OWN `supported_voices` for that model — never a curated table, never
  // another model's list. `null` covers every "we have no vocabulary to offer" state.
  const narrationVoices = voicesForModelId(
    narrationModelId,
    state.modelCatalogue?.models ?? [],
  );

  const visualStatus = generations[imageSlot(scene.id)]?.status;
  const narrationStatus = generations[NARRATION_SLOT]?.status;
  const musicStatus = generations[MUSIC_SLOT]?.status;
  const sceneVideoStatus = generations[videoSlot(scene.id)]?.status;

  /**
   * R5 / R7 / D2 / D3 — can each kind be generated at all with what this user has
   * connected?
   *
   * Server-derived truth, from the same catalogue the pickers read (D4) — never the
   * session, which cannot tell "not connected" from "we could not ask" and which the
   * `?seed=authed-returning` mock seed contaminates outright.
   *
   * `null` (no catalogue yet, or a failed read) leaves these buttons LIVE and lets the
   * api's `409 provider_not_connected` answer — see `generationActionAvailability` for why
   * a button and a picker part company on exactly that case. The PICKERS below still read
   * "Checking…" and stay disabled, which is what has always shipped.
   *
   * This COMPOSES with the existing `status === "running"` busy-lock (TURN 20) rather than
   * replacing it: a control is live only when the provider can serve it AND nothing is
   * already generating.
   *
   * ⚠️ `video` is included even though R7 names only image + music + narration.
   * `AI_PROVIDERS_BY_KIND` makes video openrouter-ONLY, so with no OpenRouter the per-scene
   * `▶ Generate video` button is exactly as unusable as the other two — and the panel's own
   * `kindAvailable` has ALREADY been greying the video model select in that state, so
   * leaving the button live meant the UI said "you cannot configure this" while still
   * offering to spend money on it.
   */
  const connectedProviders = state.modelCatalogue?.providers ?? null;
  const models = state.modelCatalogue?.models ?? [];
  const imageAvailable = generationActionAvailability("image", connectedProviders, models);
  const videoAvailable = generationActionAvailability("video", connectedProviders, models);
  const narrationAvailable = generationActionAvailability("narration", connectedProviders, models);
  const musicAvailable = generationActionAvailability("music", connectedProviders, models);

  return (
    <div
      data-testid="scene-inspector"
      // WHICH scene every seam on this panel — including `script-input` — belongs to.
      // Bound to `scene.id`, the scene actually RENDERED, never to `selectedSceneId`:
      // the `?? scenes[0]` fallback above means a selection matching nothing still paints
      // a panel, and an id naming the selection would then describe a scene the user is
      // not looking at.
      //
      // Added 2026-07-30 after `studio-hydration.e2e.ts` E-SH2 read this panel's script
      // for scene 2 while asserting an edit committed to scene 1, and reported it as
      // silent data loss. Nothing was lost; the read was simply un-attributable, because
      // the studio has two deliberate entry points that disagree about the opening scene
      // (`STORYBOARD_GENERATED` → `scenes[0]`, `initialStudioState` → `scenes[1]`). A
      // textarea that cannot say whose script it holds can only ever support a hopeful
      // assertion. Attribute-only, like the four seams below it, so the mock inspector's
      // exact-copy anchor stays byte-for-byte.
      data-scene-id={scene.id}
      data-visual-asset-key={scene.visualAssetKey ?? ""}
      // Task #57: attribute-only test seam exposing the selected scene's PERSISTED
      // scripture (carried on the UI Scene from hydrate / an LLM re-plan). Reflects
      // the fresh re-plan value live and the committed value after reopen — the
      // reattachment-bug regression target. Does NOT touch textContent, so the mock
      // inspector's exact-copy anchor stays byte-for-byte.
      data-scene-reference={scene.reference ?? ""}
      data-scene-translation={scene.translation ?? ""}
      // Genesis-1 item 4: still-vs-clip, exposed attribute-only so the mock inspector's
      // exact-copy anchor stays byte-for-byte. Absent ⇒ image, exactly as the manifest
      // and the renderer read it.
      data-visual-asset-kind={scene.visualAssetKind ?? "image"}
      style={{
        width: 300,
        flex: "none",
        minHeight: 0,
        overflow: "auto",
        borderLeft: "1px solid rgba(230,180,120,.12)",
        background:
          "linear-gradient(180deg,rgba(34,26,18,.55),rgba(22,17,13,.35))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* header. 19a moves Delete scene up here beside the scene name — "no longer buried
          under three model blocks" — and adds the scene COUNT and NAME.

          Gated on `aiEnabled` like every other 19a change: mock-lane e2e specs assert the
          13b inspector's exact textContent ("SCENE", "INSPECTOR", "02"), and the lane's
          zero-egress guarantee depends on the AI surface never mounting. So the mock
          catalogue keeps today's header and its trailing Delete button byte-for-byte, and
          only a REAL project gets the regroup. */}
      {aiEnabled ? (
        <div
          data-testid="inspector-header"
          style={{
            flex: "none",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "13px 16px",
            background: "#1b1410",
            borderBottom: "1px solid rgba(230,180,120,.12)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: SEMI,
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: ".18em",
                color: "#a99b85",
              }}
            >
              {"SCENE "}
              <span data-testid="scene-number">
                {String(scene.index).padStart(2, "0")}
              </span>
              {` OF ${String(storyboard.scenes.length).padStart(2, "0")}`}
            </div>
            <div
              data-testid="scene-name"
              style={{
                fontFamily: SEMI,
                fontWeight: 700,
                fontSize: 17,
                lineHeight: 1.15,
                marginTop: 2,
                color: "#f1e7d6",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {scene.visualLabel}
            </div>
          </div>
          <button
            type="button"
            data-testid="delete-scene"
            onClick={() => removeScene(scene.id)}
            disabled={!canDelete}
            title={canDelete ? undefined : `Minimum ${MIN_SCENES} scenes.`}
            className={canDelete ? styles.hoverable : undefined}
            style={{
              flex: "none",
              padding: "8px 12px",
              border: "1px solid rgba(198,85,43,.45)",
              borderRadius: 9,
              background: "rgba(198,85,43,.12)",
              fontWeight: 700,
              fontSize: 12.5,
              color: canDelete ? "#e0745a" : "#a99b85",
              opacity: canDelete ? 1 : 0.5,
              cursor: canDelete ? "pointer" : "not-allowed",
            }}
          >
            {"✕ Delete scene"}
          </button>
        </div>
      ) : (
        <div
          style={{
            height: 40,
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 16px",
            fontFamily: SEMI,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: ".18em",
            color: "#a99b85",
            borderBottom: "1px solid rgba(230,180,120,.12)",
          }}
        >
          {"SCENE "}
          <span data-testid="scene-number">
            {String(scene.index).padStart(2, "0")}
          </span>
          {" · INSPECTOR"}
        </div>
      )}

      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* SCRIPTURE — item 1's picker (real projects only, exactly like the AI
            controls below: the mock catalogue keeps the canonical 13b inspector, and the
            mock e2e lane keeps its zero-egress guarantee). */}
        {aiEnabled ? <ScripturePicker /> : null}

        {/* SCRIPT — editable blockquote (the primary dirty seam) */}
        <div>
          <div style={LABEL}>{"SCRIPT"}</div>
          <textarea
            data-testid="script-input"
            aria-label="Narration script"
            // Item 1's "respecting RTL/LTR". `dir="auto"` is the HTML first-strong-
            // character algorithm — the same one the preview caption and the generated
            // Remotion source use, so the editor, the preview and the render cannot
            // disagree about direction. It needs no per-scene language field, and so no
            // manifest schema change across four mirrors.
            dir="auto"
            value={scene.script}
            onChange={(e) =>
              dispatch({ type: "EDIT_SCRIPT", script: e.target.value })
            }
            rows={2}
            // `.scriptInput` carries the italic AND its `:dir(rtl)` override — see the
            // rule's comment for why that answer belongs in CSS, not in a hand-written
            // script detector.
            className={styles.scriptInput}
            style={{
              width: "100%",
              resize: "none",
              fontFamily: ZILLA,
              fontWeight: 400,
              fontSize: 16,
              lineHeight: 1.4,
              color: "#f1e7d6",
              background: "transparent",
              border: "none",
              // LOGICAL properties: under RTL a `border-left` quote rule lands on the
              // TRAILING edge of the text it is supposed to introduce.
              borderInlineStart: "3px solid #c6552b",
              paddingInlineStart: 12,
              outline: "none",
            }}
          />
        </div>

        {/* VISUAL — 19a makes each prompt a CARD that owns its own model controls. The
            `→ AI` chip is replaced by the scope tag (a deliberate deletion, not an
            oversight: the gold label still marks the section as AI-driven). */}
        <div
          {...(aiEnabled ? { "data-testid": "visual-card" } : {})}
          style={aiEnabled ? CARD : undefined}
        >
          <div
            style={
              aiEnabled
                ? CARD_HEADER
                : { display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }
            }
          >
            <span style={GOLD_LABEL}>{aiEnabled ? "VISUAL" : "VISUAL PROMPT"}</span>
            {aiEnabled ? (
              <>
                <span style={{ flex: 1 }} />
                <ScopePill scope="this scene" />
              </>
            ) : (
              <span
                style={{
                  fontSize: 9,
                  color: "#a99b85",
                  border: "1px solid rgba(230,180,120,.18)",
                  borderRadius: 20,
                  padding: "2px 7px",
                }}
              >
                {"→ AI"}
              </span>
            )}
          </div>
          <div style={aiEnabled ? CARD_BODY : undefined}>
          <div
            style={{
              border: "1.5px dashed rgba(230,164,59,.5)",
              background: "rgba(230,164,59,.06)",
              borderRadius: 10,
              padding: "11px 12px",
            }}
          >
            <textarea
              data-testid="visual-input"
              aria-label="Visual prompt"
              value={scene.visualPrompt}
              onChange={(e) =>
                dispatch({ type: "EDIT_VISUAL_PROMPT", prompt: e.target.value })
              }
              rows={3}
              style={{
                width: "100%",
                resize: "none",
                fontFamily: MONO,
                fontSize: 12,
                lineHeight: 1.5,
                color: "#e8dcc6",
                background: "transparent",
                border: "none",
                outline: "none",
              }}
            />
          </div>
          <button
            type="button"
            data-testid="reroll-visual"
            data-state={visualStatus ?? "idle"}
            disabled={visualStatus === "running" || !imageAvailable.enabled}
            // A disabled control is a lie if the reason is invisible. The provider tabs
            // carry their own reason pill, but they sit in a different block from this
            // button, and a greyed button with no explanation reads as a bug.
            title={imageAvailable.enabled ? undefined : imageAvailable.reason}
            onClick={() => rerollVisual(scene.id)}
            className={styles.hoverable}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 9,
              padding: "7px 12px",
              border: "1px solid rgba(230,180,120,.24)",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 12,
              color: imageAvailable.enabled ? "#f1e7d6" : "#6b5a50",
              background: "transparent",
              opacity:
                visualStatus === "running" || !imageAvailable.enabled ? 0.5 : 1,
              cursor:
                visualStatus === "running" || !imageAvailable.enabled
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {visualStatus === "running" ? "Rerolling…" : "↻ Reroll visual"}
          </button>
          {/* Item 4 — generate a CLIP for this scene instead of a still, from the same
              visual prompt. Sits beside "↻ Reroll visual" because the two are the same
              decision (what fills this scene's frame) rather than a separate mode. Real
              projects only: `aiEnabled` guards it for the same reason every other AI
              control is guarded. */}
          {aiEnabled ? (
            <button
              type="button"
              data-testid="generate-scene-video"
              data-state={sceneVideoStatus ?? "idle"}
              disabled={sceneVideoStatus === "running" || !videoAvailable.enabled}
              title={videoAvailable.enabled ? undefined : videoAvailable.reason}
              // 20b: this now OPENS the cost/time confirmation rather than spending.
              // The availability gate (`71e32a9`, "can this run at all?") is upstream and
              // still applies — the two compose, and this only ever fires when video is
              // already runnable.
              onClick={() => requestSceneVideo(scene.id)}
              className={styles.hoverable}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 9,
                marginLeft: 8,
                padding: "7px 12px",
                border: "1px solid rgba(230,180,120,.24)",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 12,
                color: videoAvailable.enabled ? "#f1e7d6" : "#6b5a50",
                background: "transparent",
                opacity:
                  sceneVideoStatus === "running" || !videoAvailable.enabled ? 0.5 : 1,
                cursor:
                  sceneVideoStatus === "running" || !videoAvailable.enabled
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {sceneVideoStatus === "running" ? "Generating clip…" : "▶ Generate video"}
            </button>
          ) : null}
          {visualStatus === "failed" ? (
            <span
              data-testid="reroll-error"
              style={{ display: "block", marginTop: 6, fontSize: 11, color: "#e0745a" }}
            >
              {"Generation failed — retry"}
            </span>
          ) : null}
          {sceneVideoStatus === "failed" ? (
            <span
              data-testid="scene-video-error"
              style={{ display: "block", marginTop: 6, fontSize: 11, color: "#e0745a" }}
            >
              {"Video generation failed — retry"}
            </span>
          ) : null}

          {/* 19a: SCENE IMAGE + SCENE VIDEO move UNDER the visual prompt — "Visual = image
              model AND video model, since both render this scene" — and FAITH ALIGNMENT
              moves inside the image block, because it only affects Gloo-generated images.
              The panel is rendered per-card rather than rewritten, so every per-kind testid
              (`ai-kind-*`, `ai-provider-*`, `ai-model-*`, `ai-cost-*`, `faith-alignment`)
              survives the move unchanged. */}
          {aiEnabled ? (
            <div style={SUB_BLOCK}>
              {/* F16: the VISUAL card's scope pill reads `this scene`, and it scopes the
                  PROMPT. The model selectors co-located beneath it are PROJECT-level —
                  `AiGenerationSettingsSchema` records that a per-scene choice would make
                  the user re-pick a model 5–10 times and that the reverse is a manifest
                  migration. The panel's own `· whole video` qualifier is kept here (and
                  only here — the narration and music cards already say it in their
                  headers) so the co-location cannot be read as per-scene scope. */}
              <AiSettingsPanel
                rootTestId="ai-settings"
                kinds={["image", "video"]}
                heading="MODELS"
                includeFaithAlignment
              />
            </div>
          ) : null}
          </div>
        </div>

        {/* NARRATOR VOICE · whole video. Mock catalog → the canonical 13b read-only
            box (keeps the exact-copy regression anchors in textContent). Real
            project → an editable descriptor + a real "↻ Regenerate narration". */}
        <div
          {...(aiEnabled ? { "data-testid": "narration-card" } : {})}
          style={aiEnabled ? CARD : undefined}
        >
          <div style={aiEnabled ? CARD_HEADER : { marginBottom: 7 }}>
            <span style={GOLD_LABEL}>
              {aiEnabled ? "NARRATION" : "NARRATOR VOICE"}
            </span>
            {aiEnabled ? (
              <>
                <span style={{ flex: 1 }} />
                <ScopePill scope="whole video" />
              </>
            ) : (
              <span
                style={{ fontFamily: SEMI, fontWeight: 600, fontSize: 10, color: "#a99b85" }}
              >
                {" · whole video"}
              </span>
            )}
          </div>
          {aiEnabled ? (
            <div style={CARD_BODY}>
              {/* 19a lists provider → model → VOICE in that order, "because the voice
                  options come FROM the model". */}
              <AiSettingsPanel kinds={["narration"]} heading={null} includeFaithAlignment={false} />
              <div style={{ marginTop: 14 }} />
              {/* The three cascading dropdowns REPLACE the free-text descriptor.
                  The box is gone because it was a lie: OpenRouter's speech endpoint takes
                  a NAMED voice, its request body is exactly
                  `{model, input, voice, response_format}`, and the descriptor reached no
                  provider-facing code at all — every project narrated in "alloy" however
                  carefully the sentence was written. A control that cannot affect its
                  output is worse than no control.

                  R9(c), 2026-07-31: the read-only `voice-description` box that used to sit
                  under this list is GONE. It was shown as "context for the choice" and it
                  was instead a SECOND answer to the same question, generated before any
                  voice existed to choose — the reported screenshot has `VOICE: Michael`
                  directly above *"Warm, wise, and resonant FEMALE voice with a calm pace"*.
                  The contradiction needs a chosen voice next to a generated sentence, so it
                  can only exist in this card.

                  `storyboard.voiceDescription` itself is NOT dead and is NOT removed:
                  db-lib's `VoiceDescriptorSchema.description` is REQUIRED, `manifest-adapter`
                  round-trips it both ways, `storyboard.ts` reads it out of a generation
                  result, `studio-context` sends it with every narration request, and the
                  non-`aiEnabled` branch below still displays it (`U-I11`, now the only test
                  holding that one surviving render). Removing it end to end would be a
                  required→optional db-lib migration across all five manifest mirrors for
                  zero user benefit. */}
              <VoiceList
                modelId={narrationModelId}
                voices={narrationVoices}
                selectedVoiceId={storyboard.voiceId}
                onSelect={setVoiceId}
              />
              <button
                type="button"
                data-testid="regenerate-narration"
                data-state={narrationStatus ?? "idle"}
                disabled={
                  narrationStatus === "running" ||
                  storyboard.scenes.length === 0 ||
                  !narrationAvailable.enabled
                }
                title={
                  narrationAvailable.enabled ? undefined : narrationAvailable.reason
                }
                onClick={regenerateNarration}
                className={styles.hoverable}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 9,
                  padding: "7px 12px",
                  border: "1px solid rgba(230,180,120,.24)",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 12,
                  color: narrationAvailable.enabled ? "#f1e7d6" : "#6b5a50",
                  background: "transparent",
                  opacity:
                    narrationStatus === "running" || !narrationAvailable.enabled
                      ? 0.5
                      : 1,
                  cursor: narrationAvailable.enabled ? "pointer" : "not-allowed",
                }}
              >
                {narrationStatus === "running" ? "Generating…" : "↻ Regenerate narration"}
              </button>
              {narrationStatus === "failed" ? (
                <span
                  data-testid="narration-error"
                  style={{ display: "block", marginTop: 6, fontSize: 11, color: "#e0745a" }}
                >
                  {"Generation failed — retry"}
                </span>
              ) : null}
            </div>
          ) : (
            <div
              style={{
                border: "1px solid rgba(230,180,120,.18)",
                borderRadius: 10,
                background: "#0f0b07",
                padding: "11px 12px",
                fontFamily: MONO,
                fontSize: 11.5,
                lineHeight: 1.5,
                color: "#a99b85",
              }}
            >
              {storyboard.voiceDescription}
            </div>
          )}
        </div>

        {/* MUSIC BED · whole video — editable style + regenerate (real projects only;
            the 13b mock inspector has no music control). */}
        {aiEnabled ? (
          <div data-testid="music-card" style={CARD}>
            <div style={CARD_HEADER}>
              <span style={GOLD_LABEL}>{"MUSIC BED"}</span>
              <span style={{ flex: 1 }} />
              <ScopePill scope="whole video" />
            </div>
            <div style={CARD_BODY}>
            {/* A TEXTAREA, matching NARRATOR VOICE above. It was a single-line `input`,
                which silently truncated the prompt it was showing: "Cinematic, ethereal,
                building fr…" rendered as one clipped line with no wrap and no scrollbar,
                so a mood the user had actually written looked half-lost. Both fields hold
                the same kind of value — a freeform descriptor of a whole-video track —
                so they get the same control. */}
            <textarea
              data-testid="music-input"
              aria-label="Music style"
              value={storyboard.musicMood}
              onChange={(e) => dispatch({ type: "SET_MUSIC_MOOD", mood: e.target.value })}
              placeholder="e.g. Swelling strings"
              rows={3}
              style={{
                width: "100%",
                resize: "none",
                border: "1px solid rgba(230,180,120,.18)",
                borderRadius: 10,
                background: "#0f0b07",
                padding: "11px 12px",
                fontFamily: MONO,
                fontSize: 11.5,
                lineHeight: 1.5,
                color: "#e8dcc6",
                outline: "none",
              }}
            />
            <button
              type="button"
              data-testid="regenerate-music"
              data-state={musicStatus ?? "idle"}
              disabled={musicStatus === "running" || !musicAvailable.enabled}
              title={musicAvailable.enabled ? undefined : musicAvailable.reason}
              onClick={regenerateMusic}
              className={styles.hoverable}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 9,
                padding: "7px 12px",
                border: "1px solid rgba(230,180,120,.24)",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 12,
                color: musicAvailable.enabled ? "#f1e7d6" : "#6b5a50",
                background: "transparent",
                opacity:
                  musicStatus === "running" || !musicAvailable.enabled ? 0.5 : 1,
                cursor: musicAvailable.enabled ? "pointer" : "not-allowed",
              }}
            >
              {musicStatus === "running" ? "Generating…" : "↻ Regenerate music"}
            </button>
            {musicStatus === "failed" ? (
              <span
                data-testid="music-error"
                style={{ display: "block", marginTop: 6, fontSize: 11, color: "#e0745a" }}
              >
                {"Generation failed — retry"}
              </span>
            ) : null}
            {/* 19a: the music model moves under the music bed it configures. */}
            <div style={SUB_BLOCK}>
              <AiSettingsPanel kinds={["music"]} heading={null} includeFaithAlignment={false} />
            </div>
            </div>
          </div>
        ) : null}

        {/* The standalone `GENERATION · whole video` section is GONE (19a): "Generation
            settings are no longer a separate section at the bottom." Its parts are
            redistributed above — image + video under the visual prompt (with faith
            alignment inside the image block), the speech model under narration, the music
            model under the music bed. Nothing was deleted and no testid moved; the panel
            is simply mounted three times with the kinds each card owns.

            The mock catalogue never mounted it at all (the panel's own `project.manifest`
            guard), so the byte-for-byte 13b inspector is unaffected either way. */}

        {/* On-screen captions — single switch (SET_ON_SCREEN_TEXT) */}
        <div style={STAT_ROW}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#f1e7d6" }}>
              {"On-screen captions"}
            </div>
            <div style={{ fontSize: 11, color: "#a99b85" }}>{"Show verse text"}</div>
          </div>
          <button
            type="button"
            data-testid="captions-switch"
            role="switch"
            aria-checked={showCaptions}
            aria-label="On-screen captions"
            data-on={showCaptions ? "true" : "false"}
            onClick={() =>
              dispatch({
                type: "SET_ON_SCREEN_TEXT",
                value: showCaptions ? "voice-only" : "text",
              })
            }
            className={styles.hoverable}
            style={{
              width: 38,
              height: 22,
              flex: "none",
              borderRadius: 20,
              border: "none",
              padding: 0,
              position: "relative",
              background: showCaptions ? "#c6552b" : "rgba(230,180,120,.22)",
            }}
          >
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: 2,
                left: showCaptions ? 18 : 2,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 120ms ease",
              }}
            />
          </button>
        </div>

        {/* Duration — derived, read-only */}
        <div style={STAT_ROW}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#f1e7d6" }}>
              {"Duration"}
            </div>
            <div style={{ fontSize: 11, color: "#a99b85" }}>{"Scene length"}</div>
          </div>
          <span
            data-testid="scene-duration"
            style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, color: "#f1e7d6" }}
          >
            {`${scene.durationSeconds.toFixed(1)}s`}
          </span>
        </div>

        {/* Delete scene — the other half of USER DECISION D3. Without it the 10-scene
            ceiling would be a one-way door: a user who adds a screen they don't want has
            no way back and the project is stuck a scene longer forever. The 5-scene floor
            is enforced in the MODEL (`deleteScene` refuses); this button reports it.

            REAL projects render it in the sticky header instead (19a: "no longer buried
            under three model blocks"). The mock catalogue keeps it here, because the 13b
            inspector's DOM is a byte-for-byte anchor for the mock e2e lane. */}
        {aiEnabled ? null : (
          <button
            type="button"
            data-testid="delete-scene"
            onClick={() => removeScene(scene.id)}
            disabled={!canDelete}
            title={canDelete ? undefined : `Minimum ${MIN_SCENES} scenes.`}
            className={canDelete ? styles.hoverable : undefined}
            style={{
              alignSelf: "flex-start",
              padding: "7px 12px",
              border: "1px solid rgba(230,180,120,.24)",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 12,
              color: canDelete ? "#e0745a" : "#a99b85",
              background: "transparent",
              opacity: canDelete ? 1 : 0.5,
              cursor: canDelete ? "pointer" : "not-allowed",
            }}
          >
            {"✕ Delete scene"}
          </button>
        )}
      </div>
    </div>
  );
}
