"use client";

import { useEffect, useRef, useState } from "react";
import { completeCreateRepo } from "@/lib/project-wizard/provision-effects";

/**
 * The create-new-repo JIT callback page (§2.3/§6b — a CLIENT page, mirroring the
 * OpenRouter PKCE callback). GitHub redirects the authorize popup here with
 * `?code=&state=`. This page reads the stashed form params (localStorage, written by
 * the opener under the `state` nonce), POSTs `create-repo` to the BFF (which runs the
 * zero-storage user-token dance server-side and delegates to the scaffold create
 * path), and writes the resulting `{ projectId, jobId, slug }` back under the same
 * nonce so the opener's main-tab poll can pick it up and start rendering the
 * provisioning log. Best-effort closes the tab when done.
 */
export default function CreateRepoCallbackPage() {
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const nonce = params.get("state");
      if (!code || !nonce) {
        setState("error");
        return;
      }
      const result = await completeCreateRepo(nonce, code, {
        storage: window.localStorage,
      });
      setState(result ? "done" : "error");
      if (result) {
        try {
          window.close();
        } catch {
          /* not a popup — the opener's poll still resolves */
        }
      }
    })();
  }, []);

  const message =
    state === "working"
      ? "Creating your repository…"
      : state === "done"
        ? "Repository created. You can close this tab."
        : "We couldn't create the repository. Return to Supagloo and try again.";

  return (
    <div
      data-testid="create-repo-callback-status"
      data-state={state}
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--sg-bg)",
        color: "var(--sg-fg)",
        fontFamily: "var(--font-barlow)",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 360, fontSize: 15, lineHeight: 1.5, color: "var(--sg-dim)" }}>
        {message}
      </div>
    </div>
  );
}
