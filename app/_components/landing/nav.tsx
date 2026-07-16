import LogoMark from "../logo-mark";
import NavAuth from "../nav-auth";

/** Top nav: brand mark + wordmark on the left; placeholder links + auth control. */
export default function Nav() {
  return (
    <nav
      className="flex flex-wrap items-center min-h-[70px] px-4 sm:px-[34px] py-2 sm:py-0"
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

      {/* Spacer only at ≥sm — on narrow the auth control is pushed right via
          `ml-auto`, and wraps to its own row below ~390px. */}
      <div className="hidden sm:block flex-1" />

      <div className="flex items-center ml-auto mr-2" style={{ gap: 28 }}>
        {/* The two placeholder links hide below md to keep the wordmark + auth
            control on one row on phones; their text stays in the DOM. */}
        <div className="hidden md:flex items-center" style={{ gap: 28 }}>
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
        </div>
        <NavAuth />
      </div>
    </nav>
  );
}
