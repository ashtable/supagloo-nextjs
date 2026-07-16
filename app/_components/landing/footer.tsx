import LogoMark from "../logo-mark";

/**
 * Footer. Desktop: brand mark + copyright on the left, platform credit on the
 * right. Mobile (9b): centered, stacked (copyright over credit), no brand mark.
 */
export default function Footer() {
  return (
    <footer
      className="flex flex-col md:flex-row items-center justify-center md:justify-start flex-wrap px-4 sm:px-[34px] py-4 md:py-0 min-h-[58px] gap-[5px] md:gap-3"
      style={{ borderTop: "1px solid var(--sg-line)" }}
    >
      <div className="hidden md:block">
        <LogoMark size={22} />
      </div>
      <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--sg-dim)" }}>
        {"© 2026 Supagloo"}
      </span>
      <div className="hidden md:block flex-1" />
      <span style={{ fontWeight: 500, fontSize: 12.5, color: "var(--sg-dim)" }}>
        {"Built on the YouVersion Platform"}
      </span>
    </footer>
  );
}
