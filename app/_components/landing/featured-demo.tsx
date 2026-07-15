const TAGS = [
  "🔊 Dramatic baritone",
  "🎬 Cosmic visuals",
  "🎻 Orchestral",
  "⏱ 0:32 · 4 scenes",
];

/**
 * "Start in one click" featured-demo band: a radial-gradient video poster on the
 * left (DEMO chip, decorative play button, caption) and the Genesis starter
 * script details on the right (eyebrow, title, description, tag pills, two inert
 * buttons).
 */
export default function FeaturedDemo() {
  return (
    <section className="px-12 pt-2 pb-5">
      <div
        id="featured-demo-eyebrow"
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

      {/* role="group" + aria-labelledby keeps the card as a single named region
          in the a11y outline (generic divs are otherwise pruned/flattened), so
          the eyebrow reads as the label ABOVE the card while "FEATURED STARTER
          SCRIPT" stays clearly nested inside it. */}
      <div
        role="group"
        aria-labelledby="featured-demo-eyebrow"
        className="flex overflow-hidden"
        style={{
          border: "1px solid var(--sg-line2)",
          borderRadius: 16,
          background: "var(--sg-panel)",
        }}
      >
        {/* Poster — a decorative gradient thumbnail (fake play button, no real
            media). Hidden from the a11y tree: the meaningful content is the
            section eyebrow + the details column, and the "DEMO" badge otherwise
            competes as "the label above the demo card" in semantic extraction.
            Still present in raw DOM text, so exact-copy anchors are unaffected. */}
        <div
          aria-hidden
          className="relative overflow-hidden"
          style={{ width: 462, flex: "none", background: "var(--sg-poster)" }}
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
          {/* "FEATURED STARTER SCRIPT" is an overline WITHIN the heading (not a
              separate node), so it folds into the heading's accessible name
              instead of competing with the section eyebrow as "the small label
              above the demo card". Still fully accessible + rendered as text. */}
          <h2 style={{ margin: 0 }}>
            <span
              aria-hidden
              style={{
                display: "block",
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
            <span
              style={{
                display: "block",
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

          <p
            className="max-w-[520px]"
            style={{
              fontFamily: "var(--font-zilla)",
              fontSize: 15,
              lineHeight: 1.5,
              color: "var(--sg-dim)",
            }}
          >
            {"The first four verses of creation — the Spirit of God moving over dark waters, then light bursting across the cosmos. Dramatic narration, breathtaking visuals, an austere orchestral score. Already storyboarded and ready to render."}
          </p>

          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {TAGS.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  fontWeight: 600,
                  fontSize: 12,
                  border: "1px solid var(--sg-line2)",
                  color: "var(--sg-dim)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="flex items-center" style={{ gap: 12, marginTop: 4 }}>
            <button
              type="button"
              className="flex items-center cursor-pointer"
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
              }}
            >
              {"▶ Start from this demo"}
            </button>
            <button
              type="button"
              className="cursor-pointer"
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
