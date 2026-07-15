import LogoMark from "../logo-mark";
import NavAuth from "../nav-auth";

/** Top nav: brand mark + wordmark on the left; placeholder links + auth control. */
export default function Nav() {
  return (
    <nav
      className="flex items-center px-[34px] h-[70px]"
      style={{ gap: 18, borderBottom: "1px solid var(--sg-line)" }}
    >
      <div className="flex items-center" style={{ gap: 11 }}>
        <LogoMark size={34} />
        <span
          style={{
            fontFamily: "var(--font-barlow)",
            fontWeight: 800,
            fontSize: 20,
            letterSpacing: "-.01em",
            color: "var(--sg-fg)",
          }}
        >
          {"Supagloo"}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center mr-2" style={{ gap: 28 }}>
        <button
          type="button"
          className="cursor-pointer"
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: "var(--sg-dim)",
            background: "transparent",
            border: "none",
          }}
        >
          {"How it works"}
        </button>
        <button
          type="button"
          className="cursor-pointer"
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: "var(--sg-dim)",
            background: "transparent",
            border: "none",
          }}
        >
          {"Gallery"}
        </button>
        <NavAuth />
      </div>
    </nav>
  );
}
