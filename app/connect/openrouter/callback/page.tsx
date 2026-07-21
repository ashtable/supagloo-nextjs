"use client";

import { useEffect, useRef, useState } from "react";
import {
  openrouterBrowserBaseUrl,
  readCallbackCode,
  readVerifier,
  clearVerifier,
  exchangeOpenRouterCode,
  postOpenRouterKey,
} from "@/lib/connections/openrouter-connect";

/**
 * The OpenRouter PKCE callback page (design-delta §5.1 — a CLIENT page, not a
 * server route). OpenRouter redirects the connect tab here with `?code=`. This page
 * reads the stashed verifier (localStorage, written by the opener), does the
 * browser↔OpenRouter token exchange (the API/BFF never see the code/verifier,
 * §9-Q5), and POSTs ONLY the resulting key to the BFF. The opener's main-tab poll
 * (`GET /api/connections`) then flips openrouter to connected. Best-effort closes
 * the tab when done — the poll is the source of truth either way.
 */
export default function OpenRouterCallbackPage() {
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      const code = readCallbackCode(window.location.search);
      const verifier = readVerifier();
      if (!code || !verifier) {
        setState("error");
        return;
      }
      const key = await exchangeOpenRouterCode({
        code,
        verifier,
        baseUrl: openrouterBrowserBaseUrl(),
      });
      if (!key) {
        clearVerifier();
        setState("error");
        return;
      }
      const ok = await postOpenRouterKey({ key });
      clearVerifier();
      setState(ok ? "done" : "error");
      if (ok) {
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
      ? "Finishing your OpenRouter connection…"
      : state === "done"
        ? "Connected. You can close this tab."
        : "We couldn't complete the OpenRouter connection. Return to Supagloo and try again.";

  return (
    <div
      data-testid="openrouter-callback-status"
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
      <div style={{ maxWidth: 360 }}>
        <div
          style={{
            width: 60,
            height: 60,
            margin: "0 auto 18px",
            borderRadius: 15,
            background: "linear-gradient(150deg,#c99a3f,#6d3b26)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 22,
          }}
        >
          {"OR"}
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: "var(--sg-dim)" }}>
          {message}
        </div>
      </div>
    </div>
  );
}
