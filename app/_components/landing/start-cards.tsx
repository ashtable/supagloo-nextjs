const CARDS = [
  {
    icon: "◈",
    iconBg: "rgba(192,57,43,.14)",
    iconBorder: "rgba(192,57,43,.32)",
    title: "Verse of the Day",
    desc: "Today's YouVersion verse, auto-loaded.",
  },
  {
    icon: "🔍",
    iconBg: "rgba(201,154,63,.16)",
    iconBorder: "rgba(201,154,63,.34)",
    title: "From a passage",
    desc: "Pick any book, chapter & verses.",
  },
  {
    icon: "＋",
    iconBg: "rgba(109,59,38,.16)",
    iconBorder: "rgba(109,59,38,.4)",
    title: "Blank canvas",
    desc: "Build the flow from scratch.",
  },
];

/**
 * The "or start your own" trio of inert option cards. Desktop: a 3-up row of
 * vertical cards. Mobile (9b): stacked full-width cards, each horizontal (icon
 * left, title + description right).
 */
export default function StartCards() {
  return (
    <section className="px-6 sm:px-12 pt-[14px] pb-[30px]">
      <div
        style={{
          fontFamily: "var(--font-barlow-semi)",
          fontWeight: 600,
          fontSize: 10,
          letterSpacing: ".2em",
          color: "var(--sg-dim)",
          marginBottom: 12,
        }}
      >
        {"OR START YOUR OWN"}
      </div>

      <div className="flex flex-col md:flex-row gap-[10px] md:gap-[16px]">
        {CARDS.map((c) => (
          <button
            key={c.title}
            type="button"
            // Mobile: horizontal row (icon + text block). Desktop: flex:1 column
            // — three equal cards, matching the mock. Gaps are classes (not inline)
            // so the media variants win.
            className="flex flex-row md:flex-col items-center md:items-start text-left cursor-pointer w-full md:w-auto md:flex-1 gap-[13px] md:gap-[9px] p-[15px] md:p-5"
            style={{
              border: "1px solid var(--sg-line)",
              borderRadius: 13,
              background: "var(--sg-panel)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: c.iconBg,
                border: `1px solid ${c.iconBorder}`,
                display: "grid",
                placeItems: "center",
                fontSize: 17,
                flex: "none",
              }}
            >
              {c.icon}
            </span>
            <span className="flex flex-col gap-[2px] md:gap-[9px]">
              <span
                style={{
                  fontFamily: "var(--font-barlow-semi)",
                  fontWeight: 700,
                  fontSize: 15,
                  color: "var(--sg-fg)",
                }}
              >
                {c.title}
              </span>
              <span
                style={{
                  fontSize: 12.5,
                  color: "var(--sg-dim)",
                  lineHeight: 1.4,
                }}
              >
                {c.desc}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
