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
  canAdvance,
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

const requiredTagStyle: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 20,
  background: "rgba(192,57,43,.14)",
  color: "var(--sg-red)",
  fontWeight: 700,
  fontSize: 10,
};

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
 * 11a — the first-time setup wizard, shown once after the very first sign-in
 * over a dimmed workspace backdrop. `Modal dismissible={false}` (you complete
 * it or the GitHub gate holds — no Escape/backdrop/✕ dismissal); the wizard's
 * own 6px progress bar is its chrome, driven by `lib/onboarding/wizard-model`.
 */
export default function SetupWizard() {
  const { session, connections, connectProvider, glooError, clearGlooError, markOnboarded } =
    useSession();
  const [step, setStep] = useState<WizardStep>("welcome");

  const firstName = (session.user?.name ?? "").trim().split(/\s+/)[0] ?? "";

  // Auto-advance on connect: the GitHub gate opening advances to openrouter; a real
  // openrouter/gloo connect advances to the next step too (Task #25 — same signal
  // as github, so a successful optional connect moves the user forward rather than
  // stranding them). Skipping an optional step is handled separately by `goSkip`.
  useEffect(() => {
    if (step === "github" && canAdvance("github", connections)) {
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

  return (
    <Modal
      open
      onClose={() => {}}
      dismissible={false}
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

      <div
        style={{
          padding: step === "done" ? "40px 34px" : "24px 34px 30px",
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
          />
        )}
        {step === "openrouter" && (
          <OpenRouterStep
            connections={connections}
            onConnect={() => connectProvider("openrouter")}
            onSkip={goSkip}
          />
        )}
        {step === "gloo" && (
          <GlooStep
            connections={connections}
            onSave={(creds) => connectProvider("gloo", creds)}
            onSkip={goSkip}
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
          tag="REQUIRED"
          tagStyle={requiredTagStyle}
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

function GithubStep({
  connections,
  onAuthorize,
}: {
  connections: ConnectionsState;
  onAuthorize: () => void;
}) {
  const pending = connections.github.status === "pending";
  return (
    <div>
      <div style={{ textAlign: "right", marginTop: -22 }}>
        <span style={requiredTagStyle}>{"REQUIRED"}</span>
      </div>
      <GithubConnectBody onAuthorize={onAuthorize} pending={pending} />
    </div>
  );
}

function OpenRouterStep({
  connections,
  onConnect,
  onSkip,
}: {
  connections: ConnectionsState;
  onConnect: () => void;
  onSkip: () => void;
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
      />
      <div style={{ textAlign: "center", marginTop: -8 }}>
        <button
          type="button"
          data-testid="wizard-skip"
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
  onSkip: () => void;
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
