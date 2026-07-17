import LogoMark from "../logo-mark";
import ProfileMenu from "../profile-menu";

/**
 * 10a's top nav — brand, placeholder links (Gallery/How it works are inert,
 * matching the landing nav's own placeholders), and the shared profile pill +
 * dropdown (plan D-NAV).
 */
export default function WorkspaceNav() {
  return (
    <div
      className="flex items-center"
      style={{
        height: 70,
        gap: 18,
        padding: "0 34px",
        borderBottom: "1px solid var(--sg-line)",
      }}
    >
      <div className="flex items-center" style={{ gap: 11 }}>
        <LogoMark size={34} />
        <span
          style={{
            fontWeight: 800,
            fontSize: 20,
            letterSpacing: "-.01em",
            color: "var(--sg-fg)",
          }}
        >
          {"Supagloo"}
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <div className="flex items-center" style={{ gap: 28, marginRight: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--sg-fg)" }}>
          {"Workspace"}
        </span>
        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--sg-dim)" }}>
          {"Gallery"}
        </span>
        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--sg-dim)" }}>
          {"How it works"}
        </span>
      </div>

      <ProfileMenu pillTestId="workspace-profile-pill" />
    </div>
  );
}
