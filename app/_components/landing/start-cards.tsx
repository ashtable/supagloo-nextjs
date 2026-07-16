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

/** The "or start your own" trio of inert option cards. */
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

      <div className="flex flex-wrap" style={{ gap: 16 }}>
        {CARDS.map((c) => (
          <button
            key={c.title}
            type="button"
            className="flex flex-col text-left cursor-pointer"
            style={{
              // `1 1 240px`: three equal columns at the desktop width, wrapping
              // to two then one column as the row narrows (no fixed 3-up row).
              flex: "1 1 240px",
              border: "1px solid var(--sg-line)",
              borderRadius: 13,
              padding: 20,
              background: "var(--sg-panel)",
              gap: 9,
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
              }}
            >
              {c.icon}
            </span>
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
              style={{ fontSize: 12.5, color: "var(--sg-dim)", lineHeight: 1.4 }}
            >
              {c.desc}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
