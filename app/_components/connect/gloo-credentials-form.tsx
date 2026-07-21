"use client";

import { useState, type CSSProperties } from "react";
import {
  validateGlooCredentials,
  type GlooCredentials,
} from "@/lib/connections/gloo-connect";

const labelStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: ".06em",
  color: "var(--sg-dim)",
  marginBottom: 5,
};

const inputStyle: CSSProperties = {
  border: "none",
  outline: "none",
  background: "transparent",
  fontFamily: "monospace",
  fontSize: 13,
  color: "var(--sg-fg)",
  width: "100%",
};

/**
 * The shared Gloo client-id/secret form — used by 10b's inline not-linked card AND
 * the wizard's Gloo step (plan D-REUSE). Task #25 made both fields REAL controlled
 * inputs (`gloo-client-id`, `gloo-secret`) with a 👁 reveal toggle. On submit it
 * runs local validation (both non-empty) and, only if that passes, hands the
 * credentials to `onSave` — the caller runs the LIVE `PUT /api/connect/gloo`
 * verify-then-store. A server verify failure (`serverError`) is rendered in the same
 * `gloo-error` slot as local validation, per §6a ("failure surfaces as a real form
 * error"). Editing a field clears both errors.
 *
 * `variant` only changes layout (stacked in the wizard vs. a 2-col grid on the 10b
 * card) and field background. `onSkip` is provided only by the wizard's Gloo step.
 */
export default function GlooCredentialsForm({
  variant,
  saveLabel,
  onSave,
  pending,
  onSkip,
  serverError,
  onClearServerError,
}: {
  variant: "card" | "wizard";
  saveLabel: string;
  onSave: (creds: GlooCredentials) => void;
  pending: boolean;
  onSkip?: () => void;
  serverError?: string | null;
  onClearServerError?: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const isWizard = variant === "wizard";
  const fieldBg = isWizard ? "var(--sg-panel)" : "var(--sg-bg)";
  const fieldHeight = isWizard ? 42 : 40;

  const clearErrors = () => {
    if (localError) setLocalError(null);
    if (serverError) onClearServerError?.();
  };

  const handleSave = () => {
    const creds = { clientId, clientSecret };
    const err = validateGlooCredentials(creds);
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    onSave(creds);
  };

  const shownError = localError ?? serverError ?? null;

  return (
    <div>
      <div
        style={
          isWizard
            ? { display: "flex", flexDirection: "column", gap: 11 }
            : { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }
        }
      >
        <div>
          <div style={labelStyle}>{"CLIENT ID"}</div>
          <div
            style={{
              height: fieldHeight,
              border: "1px solid var(--sg-line2)",
              borderRadius: 9,
              background: fieldBg,
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
            }}
          >
            <input
              data-testid="gloo-client-id"
              type="text"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                clearErrors();
              }}
              placeholder="gloo_client_id…"
              aria-label="Gloo client ID"
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
          </div>
        </div>
        <div>
          <div style={labelStyle}>{"CLIENT SECRET"}</div>
          <div
            style={{
              height: fieldHeight,
              border: "1px solid var(--sg-line2)",
              borderRadius: 9,
              background: fieldBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 12px",
            }}
          >
            <input
              data-testid="gloo-secret"
              type={revealed ? "text" : "password"}
              value={clientSecret}
              onChange={(e) => {
                setClientSecret(e.target.value);
                clearErrors();
              }}
              placeholder="gloo_client_secret…"
              aria-label="Gloo client secret"
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
            <button
              type="button"
              data-testid="gloo-reveal"
              onClick={() => setRevealed((r) => !r)}
              aria-label={revealed ? "Hide client secret" : "Reveal client secret"}
              className="cursor-pointer"
              style={{
                border: "none",
                background: "transparent",
                fontSize: 12,
                flex: "none",
                marginLeft: 8,
              }}
            >
              {"👁"}
            </button>
          </div>
        </div>
      </div>

      {shownError && (
        <div
          data-testid="gloo-error"
          role="alert"
          style={{
            marginTop: 10,
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--sg-red)",
            lineHeight: 1.4,
          }}
        >
          {shownError}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: isWizard ? 10 : 12,
          marginTop: isWizard ? 18 : 14,
        }}
      >
        <button
          type="button"
          data-testid="gloo-save"
          onClick={handleSave}
          disabled={pending}
          className="cursor-pointer"
          style={{
            flex: isWizard ? 1 : undefined,
            textAlign: "center",
            padding: isWizard ? 14 : "10px 20px",
            borderRadius: isWizard ? 12 : 10,
            backgroundImage: "var(--sg-grad)",
            boxShadow:
              "inset 0 1px 0 rgba(255,235,205,.4), 0 6px 16px rgba(192,57,43,.3)",
            color: "#fff",
            fontWeight: 700,
            fontSize: isWizard ? 15 : 14,
            border: "none",
          }}
        >
          {pending ? "Verifying…" : saveLabel}
        </button>
        {isWizard ? (
          onSkip && (
            <button
              type="button"
              data-testid="wizard-skip"
              onClick={onSkip}
              className="cursor-pointer"
              style={{
                padding: "14px 18px",
                fontWeight: 700,
                fontSize: 14,
                color: "var(--sg-dim)",
                background: "transparent",
                border: "none",
              }}
            >
              {"Skip"}
            </button>
          )
        ) : (
          <span style={{ fontSize: 12.5, color: "var(--sg-dim)" }}>
            {"Need keys? "}
            <b style={{ color: "var(--sg-red)", fontWeight: 700 }}>
              {"Open Gloo dashboard ↗"}
            </b>
          </span>
        )}
      </div>

      {isWizard && (
        <div
          style={{
            textAlign: "center",
            marginTop: 12,
            fontSize: 12.5,
            color: "var(--sg-dim)",
          }}
        >
          {"Need keys? "}
          <b style={{ color: "var(--sg-red)" }}>{"Open Gloo dashboard ↗"}</b>
        </div>
      )}
    </div>
  );
}
