import LogoMark from "../logo-mark";

/** Footer: small brand mark + copyright on the left, platform credit on the right. */
export default function Footer() {
  return (
    <footer
      className="flex flex-wrap items-center px-4 sm:px-[34px] py-3 sm:py-0 min-h-[58px]"
      style={{ gap: 12, borderTop: "1px solid var(--sg-line)" }}
    >
      <LogoMark size={22} />
      <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--sg-dim)" }}>
        {"© 2026 Supagloo"}
      </span>
      <div className="hidden sm:block flex-1" />
      <span style={{ fontWeight: 500, fontSize: 12.5, color: "var(--sg-dim)" }}>
        {"Built on the YouVersion Platform"}
      </span>
    </footer>
  );
}
