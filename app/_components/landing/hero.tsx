import SignInButton from "../sign-in-button";

/**
 * Centered hero: eyebrow, two-line headline (line 2 gradient-clipped), serif
 * sub-copy, CTA row (real sign-in pill + inert "Watch the Genesis demo"), and
 * the "100% FREE" trust row.
 */
export default function Hero() {
  return (
    <section className="flex flex-col items-center text-center px-6 sm:px-12 pt-[66px] pb-11">
      <div
        style={{
          fontFamily: "var(--font-barlow-semi)",
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: ".26em",
          color: "var(--sg-dim)",
          marginBottom: 20,
        }}
      >
        {"SCRIPTURE VIDEO STUDIO · BUILT ON YOUVERSION"}
      </div>

      <h1
        className="max-w-[900px] break-words"
        style={{
          fontFamily: "var(--font-anton)",
          // Fixed 74px at the desktop design width; scales down on narrow
          // viewports so the Anton headline never clips. 74px is reached by
          // ~925px (8vw), so ≥1320px stays pixel-faithful at 74px.
          fontSize: "clamp(2rem, 8vw, 74px)",
          lineHeight: 0.98,
          letterSpacing: ".005em",
        }}
      >
        {"TURN SCRIPTURE INTO"}
        <br />
        <span
          style={{
            backgroundImage: "var(--sg-grad-head)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {"CINEMATIC VIDEO."}
        </span>
      </h1>

      <p
        className="max-w-[600px]"
        style={{
          fontFamily: "var(--font-zilla)",
          fontSize: 18,
          lineHeight: 1.55,
          color: "var(--sg-dim)",
          marginTop: 22,
        }}
      >
        {"Pick a verse — Supagloo storyboards it, narrates it in the voice you describe, and scores it into a share-ready short. Sign in with your YouVersion account to begin."}
      </p>

      <div
        className="flex flex-wrap items-center justify-center"
        style={{ gap: 14, marginTop: 34 }}
      >
        <SignInButton variant="hero" />
        <button
          type="button"
          className="flex items-center cursor-pointer"
          style={{
            gap: 9,
            padding: "14px 22px",
            border: "1px solid var(--sg-line2)",
            borderRadius: 13,
            fontWeight: 700,
            fontSize: 15,
            color: "var(--sg-fg)",
            background: "transparent",
          }}
        >
          {"▶ Watch the Genesis demo"}
        </button>
      </div>

      <div
        className="flex items-center flex-wrap justify-center"
        style={{ gap: 12, marginTop: 20 }}
      >
        <span
          className="flex items-center"
          style={{
            gap: 7,
            padding: "6px 13px",
            borderRadius: 20,
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: ".02em",
            color: "#fff",
            backgroundImage: "var(--sg-grad)",
            boxShadow: "0 4px 12px rgba(192,57,43,.3)",
          }}
        >
          {"✦ 100% FREE"}
        </span>
        <span
          style={{
            fontFamily: "var(--font-barlow)",
            fontWeight: 500,
            fontSize: 12.5,
            color: "var(--sg-dim)",
          }}
        >
          {"No credit card · Bring your own "}
          <b style={{ fontWeight: 700, color: "var(--sg-fg)" }}>Gloo AI</b>
          {" & "}
          <b style={{ fontWeight: 700, color: "var(--sg-fg)" }}>
            OpenRouter.ai
          </b>
          {" keys — mix free & premium models"}
        </span>
      </div>
    </section>
  );
}
