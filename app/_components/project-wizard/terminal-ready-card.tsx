"use client";

import { studioChipUrl } from "@/lib/studio/project";
import WizardCta from "./wizard-cta";

/**
 * The New-project step-3 terminal card: green ✓ roundel + templated body +
 * monospace URL chip + full-width "Open in studio →" CTA (D-REDIRECT — the CTA
 * IS the redirect; the "Redirecting automatically…" caption is retained copy).
 * A `compact` variant (CTA only, no roundel) is reused for the Import terminal
 * beat after its verifying log settles.
 */
export default function TerminalReadyCard({
  projectId,
  branch,
  onOpen,
  compact = false,
}: {
  projectId: string;
  branch: string;
  onOpen: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return <WizardCta label="Open in studio →" testId="open-in-studio" onClick={onOpen} />;
  }

  return (
    <div data-testid="project-ready-card" style={{ textAlign: "center" }}>
      <div
        style={{
          width: 76,
          height: 76,
          margin: "0 auto",
          borderRadius: "50%",
          background: "rgba(47,143,78,.14)",
          border: "2px solid var(--sg-green)",
          display: "grid",
          placeItems: "center",
          color: "var(--sg-green)",
          fontSize: 36,
        }}
      >
        {"✓"}
      </div>
      <div
        style={{
          fontFamily: "var(--font-anton), sans-serif",
          fontSize: 30,
          lineHeight: 1.02,
          marginTop: 20,
        }}
      >
        {"PROJECT READY."}
      </div>
      <div
        style={{
          fontFamily: "var(--font-zilla), 'Zilla Slab', Georgia, serif",
          fontSize: 14.5,
          lineHeight: 1.55,
          color: "var(--sg-dim)",
          marginTop: 10,
          maxWidth: 390,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <b style={{ color: "var(--sg-fg)" }}>{projectId}</b>
        {" is scaffolded and pushed. You're editing on branch "}
        <b style={{ color: "var(--sg-fg)", fontFamily: "monospace" }}>
          {branch}
        </b>
        {"."}
      </div>
      <div
        style={{
          marginTop: 16,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          border: "1px solid var(--sg-line)",
          borderRadius: 9,
          background: "var(--sg-panel)",
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 12.5,
          color: "var(--sg-dim)",
        }}
      >
        <span style={{ color: "var(--sg-gold)" }}>{"→"}</span>
        {` ${studioChipUrl(projectId)}`}
      </div>
      <WizardCta label="Open in studio →" testId="open-in-studio" onClick={onOpen} />
      <div style={{ marginTop: 11, fontSize: 12, color: "var(--sg-dim)" }}>
        {"Redirecting automatically…"}
      </div>
    </div>
  );
}
