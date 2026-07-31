"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Modal from "../modal";
import GithubConnectBody from "../connect/github-connect-body";
import OpenRouterConnectBody from "../connect/openrouter-connect-body";
import GlooCredentialsForm from "../connect/gloo-credentials-form";
import { useSession } from "../session-provider";
import OctocatIcon from "../octocat-icon";
import LogoMark from "../logo-mark";
import {
  progressFill,
  stepLabel,
  isSkippable,
  nextStep,
  stepAfterSkip,
  doneRecap,
  type WizardStep,
} from "@/lib/onboarding/wizard-model";
import type { ConnectionsState } from "@/lib/connections/connections-model";
import type { GlooCredentials } from "@/lib/connections/gloo-connect";

const eyebrowStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: ".2em",
  color: "var(--sg-dim)",
};

// The red `REQUIRED` pill style is GONE with R1: nothing in this wizard is required any
// more, and a style constant nobody uses is an invitation to put the label back. The 10a
// "not linked" red treatment still exists where it is true — on the profile cards and in
// R3's guardrail modal.

const recommendedTagStyle: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 20,
  background: "rgba(201,154,63,.18)",
  color: "var(--sg-gold-text)",
  fontWeight: 700,
  fontSize: 10,
};

const optionalTagStyle: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 20,
  background: "var(--sg-line)",
  color: "var(--sg-dim)",
  fontWeight: 700,
  fontSize: 10,
};

/**
 * 11a — the first-time setup wizard, shown once after the very first sign-in over a dimmed
 * workspace backdrop. The wizard's own 6px progress bar is its chrome, driven by
 * `lib/onboarding/wizard-model`.
 *
 * ── R1 + R2 (2026-07-31): optional, and dismissible ─────────────────────────────────
 *
 * It used to be `<Modal dismissible={false}>` with the comment *"you complete it or the
 * GitHub gate holds — no Escape/backdrop/✕ dismissal"*. R1 deleted that gate, so the seal
 * had nothing left to hold, and R2 makes dismissal COUNT AS COMPLETION: every exit —
 * the ✕, Escape, a backdrop click — routes through the same `markOnboarded` the Done step
 * calls, so a user who dismisses is never shown the wizard again and can connect whatever
 * they want later from the profile page.
 *
 * ⚠️ The ✕ is the WIZARD's, not `Modal`'s. `Modal` renders its close button only inside the
 * 56px titled header (`{title && …}`), and 11a deliberately has no header bar — so simply
 * flipping `dismissible` would have produced a dismissible modal with nothing to click,
 * leaving Escape as the only visible exit. The 28px / `border-radius:7px` button below is
 * lifted from the project-wizard bar rather than 11b/11c's 30px header variant, because
 * this is the same family of full-screen overlay.
 */
export default function SetupWizard() {
  const {
    session,
    connections,
    connectProvider,
    linkExistingGithub,
    glooError,
    clearGlooError,
    connectErrors,
    markOnboarded,
  } =
    useSession();
  const [step, setStep] = useState<WizardStep>("welcome");

  const firstName = (session.user?.name ?? "").trim().split(/\s+/)[0] ?? "";

  // Auto-advance on connect: a real github/openrouter/gloo connect advances to the next
  // step, so a successful connect moves the user forward rather than stranding them.
  // Skipping a step is handled separately by `goSkip`.
  //
  // R1: this used to ask `canAdvance("github", connections)`. It now reads the connection
  // status DIRECTLY, symmetrically with the other two branches — that is not a cosmetic
  // inline. `canAdvance` was the GATE, and a gate with the refusal removed answers `true`
  // for an unconnected user, which would have made this effect skip straight past the
  // GitHub step the instant the wizard mounted. The predicate had to go, not soften.
  useEffect(() => {
    if (step === "github" && connections.github.status === "connected") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep("openrouter");
    } else if (step === "openrouter" && connections.openrouter.status === "connected") {
      setStep("gloo");
    } else if (step === "gloo" && connections.gloo.status === "connected") {
      setStep("done");
    }
  }, [step, connections]);

  const label = stepLabel(step);
  const fill = progressFill(step);

  const goNext = () => {
    const n = nextStep(step);
    if (n) setStep(n);
  };
  const goSkip = () => {
    const n = stepAfterSkip(step);
    if (n) setStep(n);
  };
  /** ONE source for "does this step offer an escape?" — the model's own predicate, which
   *  before R1 no component consulted. A step that is not skippable is handed `undefined`
   *  and renders no skip affordance at all. */
  const onSkip = isSkippable(step) ? goSkip : undefined;

  return (
    <Modal
      open
      // R2: dismissal IS completion. Every exit `Modal` owns — Escape and the backdrop —
      // lands here, and so does the wizard's own ✕ below, so the persistence cannot depend
      // on which one the user reached for or on how far through they got.
      onClose={markOnboarded}
      dismissible
      ariaLabel="Set up your Supagloo account"
      testId="setup-wizard"
      width={520}
    >
      <div
        data-testid="wizard-progress"
        style={{ height: 6, background: "var(--sg-line)", display: "flex" }}
      >
        <div
          data-testid="wizard-progress-fill"
          style={{
            width: `${fill}%`,
            background: "linear-gradient(90deg,#d4a24c,#c0392b)",
          }}
        />
      </div>

      {/* The wizard's own close chrome — see the docblock for why `Modal`'s cannot be
          used. It sits between the rail and the step eyebrow rather than in a header bar,
          because 11a has no header bar to put it in. */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 12px 0" }}>
        <button
          type="button"
          data-testid="wizard-dismiss"
          aria-label="Close setup"
          title="Close — you can connect these later from your profile"
          onClick={markOnboarded}
          className="cursor-pointer"
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: "1px solid var(--sg-line2)",
            display: "grid",
            placeItems: "center",
            color: "var(--sg-dim)",
            background: "transparent",
            fontSize: 13,
          }}
        >
          {"✕"}
        </button>
      </div>

      <div
        style={{
          padding: step === "done" ? "26px 34px 40px" : "10px 34px 30px",
          textAlign: step === "welcome" || step === "done" ? "center" : "left",
        }}
      >
        {label && (
          <div data-testid="wizard-step-label" style={eyebrowStyle}>
            {label}
          </div>
        )}

        {step === "welcome" && <WelcomeStep firstName={firstName} onNext={goNext} />}
        {step === "github" && (
          <GithubStep
            connections={connections}
            onAuthorize={() => connectProvider("github")}
            onLinkExisting={linkExistingGithub}
            onSkip={onSkip}
            error={connectErrors.github}
          />
        )}
        {step === "openrouter" && (
          <OpenRouterStep
            connections={connections}
            onConnect={() => connectProvider("openrouter")}
            onSkip={onSkip}
            error={connectErrors.openrouter}
          />
        )}
        {step === "gloo" && (
          <GlooStep
            connections={connections}
            onSave={(creds) => connectProvider("gloo", creds)}
            onSkip={onSkip}
            glooError={glooError}
            onClearGlooError={clearGlooError}
          />
        )}
        {step === "done" && (
          <DoneStep connections={connections} onFinish={markOnboarded} />
        )}
      </div>
    </Modal>
  );
}

function ChecklistRow({
  icon,
  label,
  note,
  tag,
  tagStyle,
}: {
  icon: ReactNode;
  label: string;
  note: string;
  tag: string;
  tagStyle: CSSProperties;
}) {
  return (
    <div
      className="flex items-center"
      style={{
        gap: 11,
        padding: "11px 14px",
        border: "1px solid var(--sg-line)",
        borderRadius: 10,
        background: "var(--sg-panel)",
      }}
    >
      {icon}
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</span>{" "}
        <span style={{ fontSize: 12, color: "var(--sg-dim)" }}>{note}</span>
      </div>
      <span style={tagStyle}>{tag}</span>
    </div>
  );
}

function WelcomeStep({
  firstName,
  onNext,
}: {
  firstName: string;
  onNext: () => void;
}) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
        <LogoMark size={72} />
      </div>
      <div
        style={{
          fontFamily: "var(--font-anton)",
          fontSize: 34,
          lineHeight: 1.02,
          marginTop: 20,
        }}
      >
        {`WELCOME TO SUPAGLOO, ${firstName.toUpperCase()}.`}
      </div>
      <div
        style={{
          fontFamily: "var(--font-zilla)",
          fontSize: 15,
          lineHeight: 1.55,
          color: "var(--sg-dim)",
          marginTop: 14,
          maxWidth: 400,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {
          "Let's connect a few accounts so you can save your work and generate video. It takes about a minute — you can change any of this later."
        }
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 9,
          marginTop: 22,
          textAlign: "left",
        }}
      >
        <ChecklistRow
          icon={
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: "var(--sg-fg)",
                color: "var(--sg-bg)",
                display: "grid",
                placeItems: "center",
                flex: "none",
              }}
            >
              <OctocatIcon size={15} />
            </span>
          }
          label="GitHub"
          note="— stores your projects"
          // R1: was `REQUIRED` in red. It is not required to finish this wizard any more —
          // it is required to CREATE a project, which the workspace guardrail says at the
          // moment it becomes true. A red REQUIRED here would tell the user the opposite of
          // what the very next screen now does.
          tag="RECOMMENDED"
          tagStyle={recommendedTagStyle}
        />
        <ChecklistRow
          icon={
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: "linear-gradient(150deg,#c99a3f,#6d3b26)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                flex: "none",
                fontWeight: 800,
                fontSize: 10,
              }}
            >
              {"OR"}
            </span>
          }
          label="OpenRouter.ai"
          note="— premium models"
          tag="OPTIONAL"
          tagStyle={optionalTagStyle}
        />
        <ChecklistRow
          icon={
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: "linear-gradient(150deg,#d4a24c,#c0392b)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                flex: "none",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              {"G"}
            </span>
          }
          label="Gloo AI"
          note="— faith-aligned models"
          tag="OPTIONAL"
          tagStyle={optionalTagStyle}
        />
      </div>
      <button
        type="button"
        data-testid="wizard-get-started"
        onClick={onNext}
        className="cursor-pointer"
        style={{
          display: "block",
          width: "100%",
          marginTop: 24,
          padding: 14,
          borderRadius: 12,
          backgroundImage: "var(--sg-grad)",
          boxShadow:
            "inset 0 1px 0 rgba(255,235,205,.4), 0 8px 20px rgba(192,57,43,.32)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 15,
          border: "none",
        }}
      >
        {"Get started →"}
      </button>
    </>
  );
}

/**
 * The skip affordance, lifted verbatim from turn 11a's step 3 — a centered 13px
 * `--sg-dim` "Skip for now →" under the primary. R1 puts it on the GitHub step too.
 *
 * ⚠️ `testId` is a PARAMETER because `wizard-skip` is already ambiguous in this codebase:
 * `gloo-credentials-form.tsx` owns a second one. They never co-render, so the ambiguity is
 * latent — but a THIRD copy would make every `clickTestId("wizard-skip")` in the real-lane
 * specs a coin flip, and it would silently break the two existing assertions (`E-B2`,
 * `E-G1`) that count `wizard-skip` on the GitHub step specifically.
 */
function SkipRow({ testId, onSkip }: { testId: string; onSkip: () => void }) {
  return (
    <div style={{ textAlign: "center", marginTop: -8 }}>
      <button
        type="button"
        data-testid={testId}
        onClick={onSkip}
        className="cursor-pointer"
        style={{
          fontSize: 13,
          color: "var(--sg-dim)",
          fontWeight: 600,
          background: "transparent",
          border: "none",
        }}
      >
        {"Skip for now →"}
      </button>
    </div>
  );
}

function GithubStep({
  connections,
  onAuthorize,
  onLinkExisting,
  onSkip,
  error,
}: {
  connections: ConnectionsState;
  onAuthorize: () => void;
  onLinkExisting: () => void;
  /** Absent ⇒ this step is not skippable. R1 makes it always present; the shape keeps
   *  `isSkippable` the only thing that decides. */
  onSkip?: () => void;
  error: string | null;
}) {
  const pending = connections.github.status === "pending";
  return (
    <div>
      <div style={{ textAlign: "right", marginTop: -22 }}>
        <span style={recommendedTagStyle}>{"RECOMMENDED"}</span>
      </div>
      <GithubConnectBody
        onAuthorize={onAuthorize}
        onLinkExisting={onLinkExisting}
        pending={pending}
        error={error}
      />
      {onSkip ? <SkipRow testId="wizard-skip-github" onSkip={onSkip} /> : null}
    </div>
  );
}

function OpenRouterStep({
  connections,
  onConnect,
  onSkip,
  error,
}: {
  connections: ConnectionsState;
  onConnect: () => void;
  onSkip?: () => void;
  error: string | null;
}) {
  const pending = connections.openrouter.status === "pending";
  return (
    <div>
      <div style={{ textAlign: "right", marginTop: -22 }}>
        <span style={recommendedTagStyle}>{"RECOMMENDED"}</span>
      </div>
      <OpenRouterConnectBody
        onConnect={onConnect}
        pending={pending}
        showPkceCallout={false}
        error={error}
      />
      {onSkip ? <SkipRow testId="wizard-skip" onSkip={onSkip} /> : null}
    </div>
  );
}

function GlooStep({
  connections,
  onSave,
  onSkip,
  glooError,
  onClearGlooError,
}: {
  connections: ConnectionsState;
  onSave: (creds: GlooCredentials) => void;
  /** Passed straight through to `GlooCredentialsForm`, which owns this step's skip
   *  affordance (and its `wizard-skip` testid) rather than the wizard. */
  onSkip?: () => void;
  glooError: string | null;
  onClearGlooError: () => void;
}) {
  const pending = connections.gloo.status === "pending";
  return (
    <div>
      <div style={{ textAlign: "right", marginTop: -22, marginBottom: 8 }}>
        <span style={recommendedTagStyle}>{"RECOMMENDED"}</span>
      </div>
      <div
        style={{
          width: 60,
          height: 60,
          margin: "0 auto",
          borderRadius: 15,
          background: "linear-gradient(150deg,#d4a24c,#c0392b)",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          fontWeight: 800,
          fontSize: 26,
        }}
      >
        {"G"}
      </div>
      <div
        style={{
          fontFamily: "var(--font-anton)",
          fontSize: 28,
          lineHeight: 1.05,
          textAlign: "center",
          marginTop: 16,
        }}
      >
        {"GLOO AI CREDENTIALS"}
      </div>
      <div
        style={{
          fontFamily: "var(--font-zilla)",
          fontSize: 14.5,
          lineHeight: 1.5,
          color: "var(--sg-dim)",
          textAlign: "center",
          marginTop: 10,
          maxWidth: 420,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {
          "Paste the client ID & secret from your Gloo developer dashboard. Stored encrypted — used only to mint short-lived tokens."
        }
      </div>
      <div style={{ marginTop: 16 }}>
        <GlooCredentialsForm
          variant="wizard"
          saveLabel="Save & finish"
          onSave={onSave}
          pending={pending}
          onSkip={onSkip}
          serverError={glooError}
          onClearServerError={onClearGlooError}
        />
      </div>
    </div>
  );
}

function DoneStep({
  connections,
  onFinish,
}: {
  connections: ConnectionsState;
  onFinish: () => void;
}) {
  const rows = doneRecap(connections);
  return (
    <div>
      <div
        style={{
          width: 78,
          height: 78,
          margin: "0 auto",
          borderRadius: "50%",
          background: "rgba(47,143,78,.14)",
          border: "2px solid var(--sg-green)",
          display: "grid",
          placeItems: "center",
          color: "var(--sg-green)",
          fontSize: 38,
        }}
      >
        {"✓"}
      </div>
      <div
        style={{
          fontFamily: "var(--font-anton)",
          fontSize: 34,
          lineHeight: 1.02,
          marginTop: 22,
        }}
      >
        {"YOU'RE ALL SET."}
      </div>
      <div
        style={{
          fontFamily: "var(--font-zilla)",
          fontSize: 15,
          lineHeight: 1.55,
          color: "var(--sg-dim)",
          marginTop: 12,
          maxWidth: 390,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {"Your accounts are connected. Let's turn some scripture into video."}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginTop: 22,
          textAlign: "left",
          maxWidth: 340,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {rows.map((row) => (
          <div
            key={row.provider}
            style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}
          >
            <span style={{ color: row.connected ? "var(--sg-green)" : "var(--sg-dim)" }}>
              {row.text}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        data-testid="wizard-finish"
        onClick={onFinish}
        className="cursor-pointer"
        style={{
          display: "block",
          width: "100%",
          marginTop: 26,
          padding: 14,
          borderRadius: 12,
          backgroundImage: "var(--sg-grad)",
          boxShadow:
            "inset 0 1px 0 rgba(255,235,205,.4), 0 8px 20px rgba(192,57,43,.32)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 15,
          border: "none",
        }}
      >
        {"Go to my workspace →"}
      </button>
    </div>
  );
}
