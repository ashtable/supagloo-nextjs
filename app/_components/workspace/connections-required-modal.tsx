"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Modal from "../modal";
import OctocatIcon from "../octocat-icon";
import {
  GUARDRAIL_REDIRECT_MS,
  PROFILE_CONNECTIONS_URL,
  type GuardrailVerdict,
} from "@/lib/workspace/connection-guardrail";

/**
 * R3's modal. NET-NEW — nothing in wireframe turns 9–20 is a connection guardrail — so it is
 * COMPOSED from drawn precedent rather than transcribed:
 *
 *   · 11a step 1's three requirement rows (26px provider tile + name + em-dash gloss +
 *     status pill), with the static REQUIRED/OPTIONAL pill swapped for LIVE state, because
 *     this modal is shown BECAUSE something is missing and has to say which;
 *   · 10a's "not linked" treatment on a missing row — the red-tinted frame and `Link ▸`
 *     verb family — so the modal and the page it sends you to read as one thought;
 *   · a GOLD warn tile rather than 12b's red failure card. This is a PRECONDITION, not a
 *     failure: nothing went wrong, something is simply not set up yet;
 *   · 12a's static `Redirecting automatically…` caption — the only auto-redirect vocabulary
 *     this design owns. Deliberately NO countdown ring: a live timer is a control the
 *     design does not have, and it would make the modal read as a threat.
 *
 * It fires from the WORKSPACE, so it takes the light `--sg-*` chrome of 12a/14a/16b, never
 * 20b's studio dark.
 *
 * ── Dismissal, and why it does not cancel the redirect ──────────────────────────────
 *
 * R3, verbatim: *"if they do not click it, they are auto-redirected there anyway."* So the
 * ✕ and "Not now" hide this panel — letting the user see the workspace behind it — but they
 * do not opt out of being taken where they have to go. Making them cancel it would leave a
 * user who clicked ✕ in exactly the state R3 was written to prevent: on the workspace,
 * unable to create anything, with nothing on screen telling them why.
 *
 * That is why dismissal is held HERE rather than by unmounting from the parent. The one
 * thing that DOES cancel the redirect is unmounting — which happens when the verdict stops
 * being "blocked" (connections landed in another tab), and is exactly right: nobody should
 * be yanked to /profile to fix a problem that has gone away.
 */

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "11px 14px",
  border: "1px solid var(--sg-line)",
  borderRadius: 10,
  background: "var(--sg-panel)",
};

/** 10a's canonical "you are missing this" frame, reused verbatim so the row and the card it
 *  sends you to are visibly the same statement. */
const ROW_MISSING: CSSProperties = {
  ...ROW,
  border: "1px solid rgba(192,57,43,.32)",
  background: "rgba(192,57,43,.05)",
};

const PILL: CSSProperties = {
  display: "inline-block",
  padding: "2px 9px",
  borderRadius: 20,
  fontWeight: 700,
  fontSize: 10.5,
};

const TILE: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 7,
  display: "grid",
  placeItems: "center",
  flex: "none",
  color: "#fff",
  fontWeight: 800,
};

interface RequirementRow {
  provider: "github" | "openrouter" | "gloo";
  icon: ReactNode;
  label: string;
  note: string;
  connected: boolean;
}

function Requirement({ row }: { row: RequirementRow }) {
  return (
    <div
      data-testid={`connections-required-row-${row.provider}`}
      data-connected={row.connected ? "true" : "false"}
      style={row.connected ? ROW : ROW_MISSING}
    >
      {row.icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{row.label}</span>{" "}
        <span style={{ fontSize: 12, color: "var(--sg-dim)" }}>{row.note}</span>
      </div>
      <span
        style={{
          ...PILL,
          background: row.connected ? "rgba(47,143,78,.14)" : "rgba(192,57,43,.14)",
          color: row.connected ? "var(--sg-green)" : "var(--sg-red)",
        }}
      >
        {row.connected ? "Connected" : "Not linked"}
      </span>
    </div>
  );
}

export default function ConnectionsRequiredModal({
  open,
  verdict,
  onClose,
}: {
  open: boolean;
  /** The LIVE verdict, so each row states this account's own state. Re-deriving per row in
   *  the view would put a second copy of R3's rule in front of the authoritative one. */
  verdict: GuardrailVerdict;
  /** Optional notification that the user dismissed. The parent must NOT unmount on it —
   *  see the docblock: unmounting is the one thing that cancels the redirect. */
  onClose?: () => void;
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  /** The StrictMode / late-timer guard the ready-card redirect needed too: without it a
   *  modal that has gone away can still navigate the app from under whatever replaced it. */
  const aliveRef = useRef(true);

  useEffect(() => {
    if (!open) return;
    aliveRef.current = true;
    const t = setTimeout(() => {
      if (aliveRef.current) router.push(PROFILE_CONNECTIONS_URL);
    }, GUARDRAIL_REDIRECT_MS);
    return () => {
      aliveRef.current = false;
      clearTimeout(t);
    };
    // Deliberately NOT keyed on `dismissed`: dismissing must not restart or cancel it.
  }, [open, router]);

  const dismiss = () => {
    setDismissed(true);
    onClose?.();
  };

  const rows: RequirementRow[] = [
    {
      provider: "github",
      icon: (
        <span style={{ ...TILE, background: "var(--sg-fg)", color: "var(--sg-bg)" }}>
          <OctocatIcon size={15} />
        </span>
      ),
      label: "GitHub",
      note: "— stores your projects",
      connected: verdict.github,
    },
    {
      provider: "openrouter",
      icon: (
        <span
          style={{
            ...TILE,
            background: "linear-gradient(150deg,#c99a3f,#6d3b26)",
            fontSize: 10,
          }}
        >
          {"OR"}
        </span>
      ),
      label: "OpenRouter.ai",
      note: "— premium models",
      connected: verdict.openrouter,
    },
    {
      provider: "gloo",
      icon: (
        <span
          style={{
            ...TILE,
            background: "linear-gradient(150deg,#d4a24c,#c0392b)",
            fontSize: 12,
          }}
        >
          {"G"}
        </span>
      ),
      label: "Gloo AI",
      note: "— faith-aligned models",
      connected: verdict.gloo,
    },
  ];

  return (
    <Modal
      open={open && !dismissed}
      onClose={dismiss}
      dismissible
      // The ✕ renders ONLY inside `Modal`'s titled header, so this `title` is what puts a
      // close button on screen at all — without it the modal would be dismissible with
      // nothing to click but Escape.
      title="CONNECTIONS REQUIRED"
      testId="connections-required"
      width={520}
    >
      {/* Everything lives in the Modal BODY, which is the scroll region. A tall block
          rendered outside it pushes the action row permanently off-screen on a phone,
          because a fixed backdrop is not something the page can scroll — the 16b publish
          dialog shipped exactly that bug. */}
      <div style={{ padding: "22px 26px 24px" }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            fontSize: 20,
            background: "rgba(201,154,63,.18)",
            border: "1px solid rgba(201,154,63,.45)",
            color: "var(--sg-gold)",
          }}
        >
          {"⚠"}
        </div>

        <div
          style={{
            fontFamily: "var(--font-anton)",
            fontSize: 26,
            lineHeight: 1.05,
            marginTop: 16,
          }}
        >
          {"CONNECT YOUR ACCOUNTS FIRST"}
        </div>

        <div
          style={{
            fontFamily: "var(--font-zilla)",
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--sg-dim)",
            marginTop: 10,
          }}
        >
          {
            "A project lives in your own GitHub repo and is generated with your own model provider, so both have to be linked before you can start one. It takes about a minute."
          }
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 9,
            marginTop: 18,
          }}
        >
          {rows.map((row) => (
            <Requirement key={row.provider} row={row} />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 14,
            fontSize: 12.5,
            lineHeight: 1.5,
            color: "var(--sg-dim)",
          }}
        >
          <span style={{ color: "var(--sg-gold)" }}>{"ⓘ"}</span>
          <span>
            {"You need "}
            <b style={{ color: "var(--sg-fg)", fontWeight: 700 }}>{"GitHub"}</b>
            {" plus "}
            <b style={{ color: "var(--sg-fg)", fontWeight: 700 }}>{"at least one"}</b>
            {" model provider — OpenRouter or Gloo AI."}
          </span>
        </div>

        <div
          className="flex items-center"
          style={{ gap: 12, marginTop: 20 }}
        >
          <button
            type="button"
            data-testid="connections-required-dismiss"
            onClick={dismiss}
            className="cursor-pointer"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--sg-dim)",
              background: "transparent",
              border: "none",
            }}
          >
            {"Not now"}
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            data-testid="connections-required-cta"
            onClick={() => router.push(PROFILE_CONNECTIONS_URL)}
            className="cursor-pointer"
            style={{
              padding: "12px 20px",
              borderRadius: 11,
              backgroundImage: "var(--sg-grad)",
              boxShadow:
                "inset 0 1px 0 rgba(255,235,205,.4), 0 8px 20px rgba(192,57,43,.32)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              border: "none",
            }}
          >
            {"Set up connections →"}
          </button>
        </div>

        {/* 12a's precedent, verbatim in shape: a static caption under the primary. */}
        <div
          style={{
            marginTop: 10,
            textAlign: "right",
            fontFamily: SEMI,
            fontSize: 12,
            color: "var(--sg-dim)",
          }}
        >
          {"Redirecting automatically…"}
        </div>
      </div>
    </Modal>
  );
}
