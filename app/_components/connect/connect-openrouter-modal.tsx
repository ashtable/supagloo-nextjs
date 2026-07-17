"use client";

import { useEffect } from "react";
import Modal from "../modal";
import OpenRouterConnectBody from "./openrouter-connect-body";
import { useSession } from "../session-provider";

/**
 * 11c — the standalone "Connect OpenRouter" modal, launched from a not-linked
 * OpenRouter card on 10b. Reuses `OpenRouterConnectBody` with
 * `showPkceCallout` — present here, unlike the leaner wizard step (ambiguity
 * #6) — plus the "Opens OpenRouter…" footnote (this usage's own trailing
 * copy, not shared with the wizard's "Skip for now →").
 */
export default function ConnectOpenRouterModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { connections, connectProvider } = useSession();
  const openrouter = connections.openrouter;

  useEffect(() => {
    if (open && openrouter.status === "connected") onClose();
  }, [open, openrouter.status, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible
      title="CONNECT ACCOUNT"
      ariaLabel="Connect OpenRouter"
      testId="connect-openrouter-modal"
    >
      <OpenRouterConnectBody
        onConnect={() => connectProvider("openrouter")}
        pending={openrouter.status === "pending"}
        showPkceCallout
      />
      <div
        style={{
          textAlign: "center",
          marginTop: -6,
          paddingBottom: 24,
          fontSize: 12,
          color: "var(--sg-dim)",
        }}
      >
        {"Opens OpenRouter in a new tab · PKCE OAuth"}
      </div>
    </Modal>
  );
}
