import {
  COMING_SOON_LABEL,
  BLANK_CANVAS_HREF,
  LANDING_START_CARDS,
  type StartEntryPoint,
  type StartOrigin,
} from "@/lib/landing/start-cards-model";

/** Per-card icon visuals (presentation-only; enablement/copy live in the model). */
const ICONS: Record<StartOrigin, { icon: string; bg: string; border: string }> =
  {
    votd: {
      icon: "◈",
      bg: "rgba(192,57,43,.14)",
      border: "rgba(192,57,43,.32)",
    },
    passage: {
      icon: "🔍",
      bg: "rgba(201,154,63,.16)",
      border: "rgba(201,154,63,.34)",
    },
    blank: {
      icon: "＋",
      bg: "rgba(109,59,38,.16)",
      border: "rgba(109,59,38,.4)",
    },
    demo: { icon: "▶", bg: "transparent", border: "transparent" }, // unused here
  };

/** Small "Coming soon" pill, matching the muted NOT-EMPTY pill treatment. */
function ComingSoonPill() {
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 20,
        background: "var(--sg-line)",
        color: "var(--sg-dim)",
        fontWeight: 700,
        fontSize: 10,
        flex: "none",
      }}
    >
      {COMING_SOON_LABEL}
    </span>
  );
}

/** The shared card body (icon + title[+pill] + description). */
function CardBody({ card }: { card: StartEntryPoint }) {
  const visuals = ICONS[card.createdFrom];
  return (
    <>
      <span
        aria-hidden
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: visuals.bg,
          border: `1px solid ${visuals.border}`,
          display: "grid",
          placeItems: "center",
          fontSize: 17,
          flex: "none",
        }}
      >
        {visuals.icon}
      </span>
      <span className="flex flex-col gap-[2px] md:gap-[9px]">
        <span className="flex items-center" style={{ gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--font-barlow-semi)",
              fontWeight: 700,
              fontSize: 15,
              color: "var(--sg-fg)",
            }}
          >
            {card.title}
          </span>
          {card.comingSoon && <ComingSoonPill />}
        </span>
        <span
          style={{
            fontSize: 12.5,
            color: "var(--sg-dim)",
            lineHeight: 1.4,
          }}
        >
          {card.desc}
        </span>
      </span>
    </>
  );
}

// Mobile: horizontal row (icon + text block). Desktop: flex:1 column — three
// equal cards, matching the mock. Gaps are classes (not inline) so the media
// variants win. Shared by the disabled buttons and the active anchor.
const CARD_CLASSES =
  "flex flex-row md:flex-col items-center md:items-start text-left w-full md:w-auto md:flex-1 gap-[13px] md:gap-[9px] p-[15px] md:p-5";

const CARD_FRAME = {
  border: "1px solid var(--sg-line)",
  borderRadius: 13,
  background: "var(--sg-panel)",
} as const;

/**
 * The "or start your own" trio, driven by `LANDING_START_CARDS`. v1: VOTD and
 * From-a-passage render disabled "coming soon" (reduced opacity, pill,
 * aria-disabled, no onClick — no native `disabled` attr so an e2e click never
 * hangs); "Blank canvas" is the one live origin — an anchor into the
 * workspace's New-project wizard (`/?newproject=blank`). Desktop: a 3-up row of
 * vertical cards. Mobile (9b): stacked full-width horizontal cards.
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
        {LANDING_START_CARDS.map((card) =>
          card.enabled ? (
            <a
              key={card.createdFrom}
              href={BLANK_CANVAS_HREF}
              data-testid={card.testId}
              className={`${CARD_CLASSES} cursor-pointer`}
              style={CARD_FRAME}
            >
              <CardBody card={card} />
            </a>
          ) : (
            <button
              key={card.createdFrom}
              type="button"
              aria-disabled="true"
              data-testid={card.testId}
              data-disabled="true"
              className={`${CARD_CLASSES} cursor-default`}
              style={{ ...CARD_FRAME, opacity: 0.55 }}
            >
              <CardBody card={card} />
            </button>
          ),
        )}
      </div>
    </section>
  );
}
