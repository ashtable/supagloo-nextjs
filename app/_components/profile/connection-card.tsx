"use client";

import { cardModel, type ConnectionsState, type Provider } from "@/lib/connections/connections-model";
import type { GlooCredentials } from "@/lib/connections/gloo-connect";
import GlooCredentialsForm from "../connect/gloo-credentials-form";
import OctocatIcon from "../octocat-icon";

const DESCRIPTIONS: Record<Provider, string> = {
  github:
    "Your projects are stored as repositories. Supagloo clones the repo to a temporary Railway workspace on open and pushes commits back.",
  openrouter:
    "Access premium models (GPT, Claude, Gemini) through your own OpenRouter credits. Connected securely with PKCE — no API key is ever pasted or stored by us.",
  gloo: "Faith-aligned models via the Gloo AI Studio. Paste the client ID & secret from your Gloo developer dashboard — stored encrypted, used only to mint short-lived tokens.",
};

function ProviderTile({ provider }: { provider: Provider }) {
  const base = {
    width: 44,
    height: 44,
    borderRadius: 11,
    display: "grid" as const,
    placeItems: "center" as const,
    flex: "none" as const,
  };
  if (provider === "github") {
    return (
      <span style={{ ...base, background: "var(--sg-fg)", color: "var(--sg-bg)" }}>
        <OctocatIcon size={24} />
      </span>
    );
  }
  if (provider === "openrouter") {
    return (
      <span
        style={{
          ...base,
          background: "linear-gradient(150deg,#c99a3f,#6d3b26)",
          color: "#fff",
          fontWeight: 800,
          fontSize: 16,
        }}
      >
        {"OR"}
      </span>
    );
  }
  return (
    <span
      style={{
        ...base,
        background: "linear-gradient(150deg,#d4a24c,#c0392b)",
        color: "#fff",
        fontWeight: 800,
        fontSize: 18,
      }}
    >
      {"G"}
    </span>
  );
}

/**
 * 10b's connection card — ONE renderer for every provider × status
 * combination, driven entirely by `cardModel(connections, provider)` (plan
 * D-REUSE / ambiguity #5). Carries `data-status` straight from the
 * connections state — the two-phase mock-OAuth seam E2E polls on.
 */
export default function ConnectionCard({
  provider,
  connections,
  onConnect,
  onDisconnect,
  onOpenModal,
  glooError,
  onClearGlooError,
}: {
  provider: Provider;
  connections: ConnectionsState;
  /** For gloo the inline form supplies the credentials; github/openrouter connect
   *  via `onOpenModal`, so their `onConnect` is called without a payload. */
  onConnect: (payload?: GlooCredentials) => void;
  onDisconnect: () => void;
  onOpenModal?: (provider: "github" | "openrouter") => void;
  /** The Gloo server verify error (gloo card only), shown in the inline form. */
  glooError?: string | null;
  onClearGlooError?: () => void;
}) {
  const conn = connections[provider];
  const model = cardModel(connections, provider);
  const notLinked = conn.status === "not-linked";

  return (
    <div
      data-testid={`connection-card-${provider}`}
      data-status={conn.status}
      className="flex items-start"
      style={{
        gap: 16,
        padding: 20,
        borderRadius: 14,
        border: notLinked
          ? "1px solid rgba(192,57,43,.32)"
          : "1px solid var(--sg-line2)",
        background: notLinked ? "rgba(192,57,43,.05)" : "var(--sg-panel)",
      }}
    >
      <ProviderTile provider={provider} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center" style={{ gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 17 }}>{model.title}</span>
          <span
            className="flex items-center"
            style={{
              gap: 5,
              padding: "3px 9px",
              borderRadius: 20,
              fontWeight: 700,
              fontSize: 11,
              background:
                model.status === "connected"
                  ? "rgba(47,143,78,.14)"
                  : "rgba(192,57,43,.14)",
              color: model.status === "connected" ? "var(--sg-green)" : "var(--sg-red)",
            }}
          >
            {model.status === "connected" && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--sg-green)",
                }}
              />
            )}
            {model.pillText}
          </span>
          {model.badge && (
            <span
              style={{
                padding: "3px 8px",
                borderRadius: 20,
                background: "var(--sg-line)",
                fontWeight: 700,
                fontSize: 10,
                color: "var(--sg-dim)",
                letterSpacing: ".05em",
              }}
            >
              {model.badge}
            </span>
          )}
        </div>

        <div
          style={{
            fontSize: 13,
            color: "var(--sg-dim)",
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          {DESCRIPTIONS[provider]}
        </div>

        {model.body === "detail" && (
          <ConnectionDetail provider={provider} connections={connections} />
        )}

        {model.body === "connect" && (
          <button
            type="button"
            data-testid={`card-connect-${provider}`}
            onClick={() => onOpenModal?.(provider as "github" | "openrouter")}
            className="cursor-pointer"
            style={{
              marginTop: 14,
              padding: "10px 20px",
              borderRadius: 10,
              backgroundImage: "var(--sg-grad)",
              boxShadow:
                "inset 0 1px 0 rgba(255,235,205,.4), 0 6px 16px rgba(192,57,43,.3)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              border: "none",
            }}
          >
            {model.status === "pending" ? "Connecting…" : "Connect"}
          </button>
        )}

        {model.body === "gloo-form" && (
          <div style={{ marginTop: 14 }}>
            <GlooCredentialsForm
              variant="card"
              saveLabel="Save & verify"
              onSave={(creds) => onConnect(creds)}
              pending={conn.status === "pending"}
              serverError={glooError}
              onClearServerError={onClearGlooError}
            />
          </div>
        )}
      </div>

      {model.body === "detail" && (
        <button
          type="button"
          data-testid={`disconnect-${provider}`}
          onClick={onDisconnect}
          className="cursor-pointer"
          style={{
            padding: "9px 15px",
            border: "1px solid var(--sg-line2)",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 13,
            color: "var(--sg-dim)",
            flex: "none",
            background: "transparent",
          }}
        >
          {"Disconnect"}
        </button>
      )}
    </div>
  );
}

function ConnectionDetail({
  provider,
  connections,
}: {
  provider: Provider;
  connections: ConnectionsState;
}) {
  if (provider === "github") {
    const detail = connections.github.detail;
    if (!detail) return null;
    return (
      <div
        className="flex items-center"
        style={{
          gap: 8,
          marginTop: 11,
          padding: "9px 12px",
          border: "1px solid var(--sg-line)",
          borderRadius: 9,
          background: "var(--sg-bg)",
          width: "fit-content",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "linear-gradient(150deg,#d4a24c,#c0392b)",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 9,
            color: "#fff",
          }}
        >
          {"AS"}
        </span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{detail.username}</span>
        <span style={{ fontSize: 12, color: "var(--sg-dim)" }}>
          {`· ${detail.repos} repos accessible`}
        </span>
      </div>
    );
  }

  if (provider === "openrouter") {
    const detail = connections.openrouter.detail;
    if (!detail) return null;
    return (
      <div
        className="flex items-center"
        style={{ gap: 14, marginTop: 11, fontSize: 12.5, color: "var(--sg-dim)" }}
      >
        <span>
          {"Key: "}
          <b style={{ fontFamily: "monospace", color: "var(--sg-fg)" }}>
            {detail.maskedKey}
          </b>
        </span>
        <span style={{ opacity: 0.5 }}>{"·"}</span>
        <span>{detail.credit}</span>
      </div>
    );
  }

  const detail = connections.gloo.detail;
  if (!detail) return null;
  return (
    <div
      className="flex items-center"
      style={{ gap: 8, marginTop: 11, fontSize: 12.5, color: "var(--sg-dim)" }}
    >
      {`Authenticated via ${detail.method.toLowerCase()}.`}
      {detail.clientId && (
        <>
          <span style={{ opacity: 0.5 }}>{"·"}</span>
          <span>
            {"Client ID: "}
            <b style={{ fontFamily: "monospace", color: "var(--sg-fg)" }}>
              {detail.clientId}
            </b>
          </span>
        </>
      )}
    </div>
  );
}
