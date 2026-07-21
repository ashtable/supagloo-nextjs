import {
  COMING_SOON_LABEL,
  START_ENTRY_POINTS,
} from "@/lib/landing/start-cards-model";

const TAGS = [
  "🔊 Dramatic baritone",
  "🎬 Cosmic visuals",
  "🎻 Orchestral",
  "⏱ 0:32 · 4 scenes",
];

// Mobile-short chip set (9b): drops "Orchestral" and the "· 4 scenes" tail.
const TAGS_MOBILE = ["🔊 Baritone", "🎬 Cosmic", "⏱ 0:32"];

const chipStyle = {
  padding: "6px 12px",
  borderRadius: 20,
  fontWeight: 600,
  fontSize: 12,
  border: "1px solid var(--sg-line2)",
  color: "var(--sg-dim)",
} as const;

/**
 * "Start in one click" featured-demo band: a radial-gradient video poster (DEMO
 * chip, decorative play button, caption) and the Genesis starter-script details
 * (eyebrow, title, description, tag pills, buttons). Stacks poster-over-details
 * below lg (9b) with shortened copy and a single full-width button. Breakpoint is
 * lg (not the site-wide md) so the 768–1024 band gets the stacked+short treatment
 * instead of a cramped side-by-side with a fixed 462px poster clipping the details.
 */
export default function FeaturedDemo() {
  return (
    <section className="px-6 sm:px-12 pt-2 pb-5">
      {/* Section label — the group's accessible name. Desktop long carries the
          id referenced by aria-labelledby; the mobile-short label is decorative. */}
      <div
        id="featured-demo-eyebrow"
        className="hidden lg:block"
        style={{
          fontFamily: "var(--font-barlow-semi)",
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: ".22em",
          color: "var(--sg-red)",
          marginBottom: 12,
        }}
      >
        {"⚡ START IN ONE CLICK — NO BLANK PAGE"}
      </div>
      <div
        className="lg:hidden"
        style={{
          fontFamily: "var(--font-barlow-semi)",
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: ".18em",
          color: "var(--sg-red)",
          marginBottom: 10,
        }}
      >
        {"⚡ START IN ONE CLICK"}
      </div>

      {/* role="group" + aria-labelledby keeps the card as a single named region
          in the a11y outline (generic divs are otherwise pruned/flattened), so
          the eyebrow reads as the label ABOVE the card while "FEATURED STARTER
          SCRIPT" stays clearly nested inside it. */}
      <div
        role="group"
        aria-labelledby="featured-demo-eyebrow"
        className="flex flex-col lg:flex-row overflow-hidden"
        style={{
          border: "1px solid var(--sg-line2)",
          borderRadius: 16,
          background: "var(--sg-panel)",
        }}
      >
        {/* Poster — decorative gradient thumbnail (no real media). Hidden from
            the a11y tree so the "DEMO" badge doesn't compete as "the label above
            the demo card" in semantic extraction; still in raw DOM text, so
            exact-copy anchors are unaffected. Below lg it stacks full-width above
            the details (fixed height, since its content is absolutely positioned);
            at ≥lg it returns to the fixed 462px side column. */}
        <div
          aria-hidden
          className="relative overflow-hidden w-full h-[240px] lg:w-[462px] lg:h-auto lg:flex-none"
          style={{ background: "var(--sg-poster)" }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              boxShadow: "inset 0 0 120px rgba(20,8,4,.7)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              fontFamily: "var(--font-barlow-semi)",
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: ".18em",
              color: "#160f14",
              background: "rgba(255,232,168,.94)",
              padding: "4px 10px",
              borderRadius: 5,
            }}
          >
            {"DEMO"}
          </div>
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "rgba(22,17,13,.42)",
              border: "1.5px solid rgba(255,240,220,.75)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontSize: 20,
              paddingLeft: 4,
            }}
          >
            ▶
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 18,
              textAlign: "center",
              fontFamily: "var(--font-barlow-semi)",
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: ".22em",
              color: "rgba(255,240,220,.9)",
            }}
          >
            {"GENESIS 1:1–4 · KJV"}
          </div>
        </div>

        {/* Details */}
        <div
          className="flex flex-col justify-center"
          style={{ flex: 1, padding: "30px 34px", gap: 16 }}
        >
          {/* "FEATURED STARTER SCRIPT" is an overline WITHIN the heading (folds
              into the heading's accessible name instead of competing with the
              section eyebrow). Hidden on mobile (9b drops it), still in DOM text. */}
          <h2 aria-label="GENESIS · LET THERE BE LIGHT" style={{ margin: 0 }}>
            <span
              aria-hidden
              className="hidden lg:block"
              style={{
                fontFamily: "var(--font-barlow-semi)",
                fontWeight: 600,
                fontSize: 10,
                letterSpacing: ".2em",
                color: "var(--sg-dim)",
                marginBottom: 7,
              }}
            >
              {"FEATURED STARTER SCRIPT"}
            </span>
            {/* The visible title is aria-hidden and the heading's name comes from
                the h2's aria-label, so semantic extraction can't split "GENESIS ·"
                into a separate label. aria-* don't touch textContent, so every
                exact-copy anchor still renders verbatim. */}
            <span
              aria-hidden
              className="block"
              style={{
                fontFamily: "var(--font-anton)",
                fontSize: 36,
                lineHeight: 1,
                color: "var(--sg-fg)",
              }}
            >
              {"GENESIS · "}
              <span style={{ color: "var(--sg-gold)" }}>
                {"LET THERE BE LIGHT"}
              </span>
            </span>
          </h2>

          {/* Description — desktop long / mobile-short (9b). */}
          <p
            className="hidden lg:block max-w-[520px]"
            style={{
              fontFamily: "var(--font-zilla)",
              fontSize: 15,
              lineHeight: 1.5,
              color: "var(--sg-dim)",
            }}
          >
            {"The first four verses of creation — the Spirit of God moving over dark waters, then light bursting across the cosmos. Dramatic narration, breathtaking visuals, an austere orchestral score. Already storyboarded and ready to render."}
          </p>
          <p
            className="lg:hidden"
            style={{
              fontFamily: "var(--font-zilla)",
              fontSize: 14,
              lineHeight: 1.45,
              color: "var(--sg-dim)",
            }}
          >
            {"The first four verses of creation — already storyboarded and ready to render."}
          </p>

          {/* Tag pills — desktop 4-set / mobile-short 3-set (9b). */}
          <div className="hidden lg:flex flex-wrap" style={{ gap: 8 }}>
            {TAGS.map((tag) => (
              <span key={tag} style={chipStyle}>
                {tag}
              </span>
            ))}
          </div>
          <div className="flex lg:hidden flex-wrap" style={{ gap: 6 }}>
            {TAGS_MOBILE.map((tag) => (
              <span
                key={tag}
                style={{ ...chipStyle, padding: "5px 10px", fontSize: 11 }}
              >
                {tag}
              </span>
            ))}
          </div>

          <div
            className="flex flex-col lg:flex-row lg:items-center"
            style={{ gap: 12, marginTop: 4 }}
          >
            {/* Demo-origin CTA — descoped in v1 (model: enabled:false,
                comingSoon:true). aria-disabled + data-disabled (no native
                `disabled` attr, so an e2e click never hangs), no onClick,
                reduced opacity. The label stays in its OWN span so the mobile
                e2e's exact-textContent visibility probe still matches it. */}
            <button
              type="button"
              aria-disabled="true"
              data-testid={START_ENTRY_POINTS.demo.testId}
              data-disabled="true"
              className="flex items-center justify-center lg:justify-start cursor-default w-full lg:w-auto"
              style={{
                gap: 8,
                padding: "12px 22px",
                borderRadius: 11,
                fontFamily: "var(--font-barlow-semi)",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: ".05em",
                textTransform: "uppercase",
                color: "#fff",
                backgroundImage: "var(--sg-grad)",
                border: "none",
                boxShadow:
                  "inset 0 1px 0 rgba(255,235,205,.45), 0 8px 20px rgba(192,57,43,.34)",
                opacity: 0.55,
              }}
            >
              <span>{START_ENTRY_POINTS.demo.title}</span>
              {/* App pill geometry; colors adapted to sit on the gradient. */}
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 20,
                  background: "rgba(22,17,13,.4)",
                  color: "rgba(255,240,220,.95)",
                  fontWeight: 700,
                  fontSize: 10,
                  textTransform: "none",
                  letterSpacing: 0,
                  flex: "none",
                }}
              >
                {COMING_SOON_LABEL}
              </span>
            </button>
            {/* Dropped on mobile (9b): the single full-width start button is the
                only CTA there. */}
            <button
              type="button"
              data-testid="demo-preview"
              className="hidden lg:inline-flex cursor-pointer"
              style={{
                padding: "12px 18px",
                border: "1px solid var(--sg-line2)",
                borderRadius: 11,
                fontWeight: 600,
                fontSize: 13,
                color: "var(--sg-fg)",
                background: "transparent",
              }}
            >
              {"Preview scenes ▸"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
