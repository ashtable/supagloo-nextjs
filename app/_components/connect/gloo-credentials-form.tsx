"use client";

import { useState, type CSSProperties } from "react";

const labelStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: ".06em",
  color: "var(--sg-dim)",
  marginBottom: 5,
};

/**
 * The shared Gloo client-id/secret form — used by 10b's inline not-linked
 * card AND the wizard's Gloo step (plan D-REUSE). CLIENT ID stays a static
 * display (matches the raw fragments, which never show it as an editable
 * field); CLIENT SECRET is the real interactive seam: a masked `<input>`
 * (`gloo-secret`) with a 👁 reveal toggle (`gloo-reveal`).
 *
 * `variant` only changes layout (stacked in the wizard vs. a 2-col grid in
 * the 10b card, matching the raw fragments) and field background. `onSkip`
 * is provided only by the wizard's Gloo step — 10b's inline form has no skip.
 */
export default function GlooCredentialsForm({
  variant,
  saveLabel,
  onSave,
  pending,
  onSkip,
}: {
  variant: "card" | "wizard";
  saveLabel: string;
  onSave: () => void;
  pending: boolean;
  onSkip?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const isWizard = variant === "wizard";
  const fieldBg = isWizard ? "var(--sg-panel)" : "var(--sg-bg)";
  const fieldHeight = isWizard ? 42 : 40;

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
              fontFamily: "monospace",
              fontSize: 13,
              color: "var(--sg-dim)",
            }}
          >
            {"gloo_client_id…"}
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
              defaultValue="gloo_client_secret_mock"
              readOnly
              aria-label="Gloo client secret"
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "monospace",
                fontSize: 13,
                color: "var(--sg-dim)",
                width: "100%",
              }}
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
          onClick={onSave}
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
