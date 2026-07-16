import HeroLede from "./hero-lede";

/**
 * Centered hero. Stays a Server Component: the auth-varying + mount-gated lede
 * (eyebrow, headline, sub-copy, CTA block) lives in the `HeroLede` client leaf;
 * this wrapper keeps the section shell and the viewport-only trust row so the
 * marketing chrome stays server-rendered.
 */
export default function Hero() {
  return (
    <section className="flex flex-col items-center text-center px-6 sm:px-12 pt-[66px] pb-11">
      <HeroLede />

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

        {/* Trust note — viewport-only (D2-a): the full note on desktop, the
            shortened note on mobile (drops "— mix free & premium models"). Both
            stay in the DOM (the hidden one is display:none). */}
        <span
          className="hidden md:block"
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
        <span
          className="md:hidden"
          style={{
            fontFamily: "var(--font-barlow)",
            fontWeight: 500,
            fontSize: 11.5,
            lineHeight: 1.4,
            color: "var(--sg-dim)",
          }}
        >
          {"No credit card · Bring your own "}
          <b style={{ fontWeight: 700, color: "var(--sg-fg)" }}>Gloo AI</b>
          {" & "}
          <b style={{ fontWeight: 700, color: "var(--sg-fg)" }}>
            OpenRouter.ai
          </b>
          {" keys"}
        </span>
      </div>
    </section>
  );
}
