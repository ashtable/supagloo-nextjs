"use client";

import { useEffect } from "react";
import Modal from "../modal";
import GithubConnectBody from "./github-connect-body";
import { useSession } from "../session-provider";

/**
 * 11b — the standalone "Connect GitHub" modal, launched from a not-linked
 * GitHub card on 10b. Reuses the wizard's GitHub step content verbatim
 * (`GithubConnectBody`) inside the generic `Modal` chrome (dismissible: ✕ /
 * Escape / backdrop). Auto-closes once the mocked OAuth transition lands on
 * "connected" — the same `connections` state 10b's card reflects.
 */
export default function ConnectGithubModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { connections, connectProvider } = useSession();
  const github = connections.github;

  useEffect(() => {
    if (open && github.status === "connected") onClose();
  }, [open, github.status, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible
      title="CONNECT ACCOUNT"
      ariaLabel="Connect GitHub"
      testId="connect-github-modal"
    >
      <GithubConnectBody
        onAuthorize={() => connectProvider("github")}
        pending={github.status === "pending"}
      />
    </Modal>
  );
}
