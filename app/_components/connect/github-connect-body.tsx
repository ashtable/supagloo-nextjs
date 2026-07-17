"use client";

import OctocatIcon from "../octocat-icon";

/**
 * The GitHub connect screen content — glyph-exact from
 * `scratch/design/turn11a.raw.html` (wizard step "github") and
 * `turn11b.raw.html` (the standalone 11b modal), which are IDENTICAL apart
 * from their chrome (wizard progress bar vs. modal header). Shared verbatim
 * between the two (plan D-REUSE), including the trailing OAuth footnote —
 * unlike OpenRouter, both usages show the same footnote.
 */
export default function GithubConnectBody({
  onAuthorize,
  pending,
}: {
  onAuthorize: () => void;
  pending: boolean;
}) {
  return (
    <div style={{ padding: "24px 34px 30px" }}>
      <div
        style={{
          width: 60,
          height: 60,
          margin: "0 auto",
          borderRadius: 15,
          background: "var(--sg-fg)",
          color: "var(--sg-bg)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <OctocatIcon size={34} />
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
        {"CONNECT YOUR GITHUB"}
      </div>

      <div
        style={{
          fontFamily: "var(--font-zilla)",
          fontSize: 14.5,
          lineHeight: 1.55,
          color: "var(--sg-dim)",
          textAlign: "center",
          marginTop: 10,
          maxWidth: 410,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {
          "Every project is a GitHub repo — the source of truth. We clone it to a temporary Railway workspace when you open it, and push your changes back."
        }
      </div>

      <div
        style={{
          marginTop: 18,
          border: "1px solid var(--sg-line)",
          borderRadius: 11,
          background: "var(--sg-panel)",
          padding: "15px 16px",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: ".06em",
            color: "var(--sg-dim)",
            marginBottom: 9,
          }}
        >
          {"SUPAGLOO WILL BE ABLE TO"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13 }}>
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <span style={{ color: "var(--sg-green)", flex: "none" }}>{"✓"}</span>
            {" Read & write repositories you choose"}
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <span style={{ color: "var(--sg-green)", flex: "none" }}>{"✓"}</span>
            {" Create new repos for new projects"}
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <span style={{ color: "var(--sg-dim)", flex: "none" }}>{"—"}</span>
            <span style={{ color: "var(--sg-dim)" }}>
              {"Never touch repos you don't select"}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        data-testid="connect-authorize"
        onClick={onAuthorize}
        disabled={pending}
        className="cursor-pointer"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          width: "100%",
          marginTop: 20,
          padding: 14,
          borderRadius: 12,
          background: "var(--sg-fg)",
          color: "var(--sg-bg)",
          fontWeight: 700,
          fontSize: 15,
          border: "none",
        }}
      >
        <OctocatIcon size={18} />
        {pending ? "Connecting…" : "Authorize with GitHub"}
      </button>

      <div
        style={{
          textAlign: "center",
          marginTop: 12,
          fontSize: 12,
          color: "var(--sg-dim)",
        }}
      >
        {"Opens GitHub in a new tab · OAuth"}
      </div>
    </div>
  );
}
