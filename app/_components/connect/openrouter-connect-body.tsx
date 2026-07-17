"use client";

const MODEL_PILLS = ["GPT-4o", "Claude Sonnet", "Gemini 2.5", "+ 300 more"];

/**
 * The OpenRouter connect screen content — glyph-exact from
 * `scratch/design/turn11a.raw.html` (wizard step "openrouter") and
 * `turn11c.raw.html` (the standalone 11c modal). Unlike GitHub, the two
 * usages diverge on purpose (ambiguity #6): the 🔒 PKCE callout is present
 * ONLY in the standalone 11c modal (`showPkceCallout`), omitted in the leaner
 * wizard step. The trailing footnote/skip line also differs between the two,
 * so it is NOT part of this shared body — callers render it themselves.
 */
export default function OpenRouterConnectBody({
  onConnect,
  pending,
  showPkceCallout = false,
}: {
  onConnect: () => void;
  pending: boolean;
  showPkceCallout?: boolean;
}) {
  return (
    <div style={{ padding: "24px 34px 30px" }}>
      <div
        style={{
          width: 60,
          height: 60,
          margin: "0 auto",
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

      <div
        style={{
          fontFamily: "var(--font-anton)",
          fontSize: 28,
          lineHeight: 1.05,
          textAlign: "center",
          marginTop: 16,
        }}
      >
        {"ADD PREMIUM MODELS"}
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
          "Connect OpenRouter to use GPT, Claude & Gemini with your own credits. Uses secure PKCE OAuth — you approve on OpenRouter and no key is ever pasted here."
        }
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {MODEL_PILLS.map((pill) => (
          <span
            key={pill}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              border: "1px solid var(--sg-line2)",
              fontWeight: 600,
              fontSize: 12,
              color: "var(--sg-dim)",
            }}
          >
            {pill}
          </span>
        ))}
      </div>

      {showPkceCallout && (
        <div
          data-testid="pkce-callout"
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: "12px 14px",
            border: "1px solid var(--sg-line)",
            borderRadius: 10,
            background: "var(--sg-panel)",
            fontSize: 12.5,
            color: "var(--sg-dim)",
            lineHeight: 1.5,
          }}
        >
          <span style={{ color: "var(--sg-gold)", flex: "none" }}>{"🔒"}</span>
          {
            " PKCE means the token is exchanged directly between your browser and OpenRouter — Supagloo never sees your password or a long-lived key."
          }
        </div>
      )}

      <button
        type="button"
        data-testid="connect-openrouter-submit"
        onClick={onConnect}
        disabled={pending}
        className="cursor-pointer"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          width: "100%",
          marginTop: showPkceCallout ? 18 : 20,
          padding: 14,
          borderRadius: 12,
          background: "linear-gradient(150deg,#c99a3f,#6d3b26)",
          boxShadow: "0 8px 20px rgba(109,59,38,.3)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 15,
          border: "none",
        }}
      >
        {pending ? "Connecting…" : "Connect with OpenRouter"}
      </button>
    </div>
  );
}
