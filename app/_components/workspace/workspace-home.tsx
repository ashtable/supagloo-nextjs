"use client";

import { useSession } from "../session-provider";
import WorkspaceNav from "./workspace-nav";
import ProviderStrip from "./provider-strip";
import RecentProjects from "./recent-projects";
import SetupWizard from "../onboarding/setup-wizard";
import OctocatIcon from "../octocat-icon";

/**
 * 10a — the signed-in home page. Nav + header row (WELCOME BACK, ASH. + new
 * project / import repo) + provider status strip + recent projects, with the
 * first-time wizard (11a) overlaid when `firstSignIn` (plan D-ROUTE).
 * Mount-gated by `useSession()` — renders nothing until the client resolves
 * an authed session (matches `HomeSwitch`'s own gate; belt-and-suspenders
 * against a direct/hard nav render before the swap settles).
 */
export default function WorkspaceHome() {
  const { mounted, session, firstSignIn } = useSession();

  if (!mounted || !session.isAuthed) return null;

  const firstName = (session.user?.name ?? "").trim().split(/\s+/)[0] ?? "";

  return (
    <div
      data-testid="workspace-home"
      className="min-h-screen w-full flex-1"
      style={{
        background: "var(--sg-bg)",
        color: "var(--sg-fg)",
        fontFamily: "var(--font-barlow)",
      }}
    >
      <div className="mx-auto w-full max-w-[1320px]">
        <WorkspaceNav />

        <div
          className="flex items-end"
          style={{ padding: "34px 34px 22px", gap: 20 }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: ".22em",
                color: "var(--sg-dim)",
                marginBottom: 8,
              }}
            >
              {"YOUR WORKSPACE"}
            </div>
            <div
              style={{
                fontFamily: "var(--font-anton)",
                fontSize: 46,
                lineHeight: 1,
              }}
            >
              {`WELCOME BACK, ${firstName.toUpperCase()}.`}
            </div>
          </div>
          <button
            type="button"
            className="flex items-center cursor-pointer"
            style={{
              gap: 9,
              padding: "13px 22px",
              borderRadius: 12,
              backgroundImage: "var(--sg-grad)",
              boxShadow:
                "inset 0 1px 0 rgba(255,235,205,.4), 0 8px 20px rgba(192,57,43,.32)",
              fontWeight: 700,
              fontSize: 15,
              color: "#fff",
              border: "none",
            }}
          >
            {"＋ New project"}
          </button>
          <button
            type="button"
            className="flex items-center cursor-pointer"
            style={{
              gap: 9,
              padding: "13px 20px",
              border: "1px solid var(--sg-line2)",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              color: "var(--sg-fg)",
              background: "transparent",
            }}
          >
            <OctocatIcon size={16} />
            {"Import repo"}
          </button>
        </div>

        <ProviderStrip />
        <RecentProjects />
      </div>

      {firstSignIn && <SetupWizard />}
    </div>
  );
}
