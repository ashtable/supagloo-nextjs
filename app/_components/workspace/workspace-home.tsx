"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../session-provider";
import WorkspaceNav from "./workspace-nav";
import ProviderStrip from "./provider-strip";
import RecentProjects from "./recent-projects";
import SetupWizard from "../onboarding/setup-wizard";
import OctocatIcon from "../octocat-icon";
import NewProjectWizard from "../project-wizard/new-project-wizard";
import ImportWizard from "../project-wizard/import-wizard";
import { studioUrl } from "@/lib/studio/project";
import { fetchProjectCards } from "@/lib/workspace/projects-real";
import type { DemoProject } from "@/lib/workspace/projects-model";

type WizardOpen = "none" | "new" | "import";

/**
 * 10a — the signed-in home page. Nav + header row (WELCOME BACK, ASH. + new
 * project / import repo) + provider status strip + recent projects, with the
 * first-time wizard (11a) overlaid when `firstSignIn` (plan D-ROUTE).
 * Mount-gated by `useSession()` — renders nothing until the client resolves
 * an authed session (matches `HomeSwitch`'s own gate; belt-and-suspenders
 * against a direct/hard nav render before the swap settles).
 */
export default function WorkspaceHome() {
  const { mounted, session, firstSignIn, isMock } = useSession();
  const router = useRouter();
  const [wizard, setWizard] = useState<WizardOpen>("none");
  const [realProjects, setRealProjects] = useState<DemoProject[] | null>(null);

  // Landing "Blank canvas" (7a) → `/?newproject=blank` opens the SAME New-project
  // wizard as the "＋ New project" header + dashed card (create-new tab, createdFrom
  // blank). Runs once on mount, before the authed early-return guard is reached.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("newproject") === "blank") setWizard("new");
  }, []);

  // Real/seed mode: hydrate the grid from `GET /api/projects` (mock mode keeps the
  // DEMO_PROJECTS fallback inside RecentProjects).
  useEffect(() => {
    if (!mounted || isMock) return;
    let active = true;
    void fetchProjectCards().then((cards) => {
      if (active) setRealProjects(cards);
    });
    return () => void (active = false);
  }, [mounted, isMock]);

  if (!mounted || !session.isAuthed) return null;

  const firstName = (session.user?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const openProject = (id: string) => router.push(studioUrl(id));

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
            data-testid="workspace-new-project"
            onClick={() => setWizard("new")}
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
            data-testid="workspace-import-repo"
            onClick={() => setWizard("import")}
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
        <RecentProjects
          onNewProject={() => setWizard("new")}
          onOpenProject={openProject}
          projects={isMock ? undefined : realProjects ?? []}
        />
      </div>

      {firstSignIn && <SetupWizard />}
      {wizard === "new" && (
        <NewProjectWizard onClose={() => setWizard("none")} />
      )}
      {wizard === "import" && (
        <ImportWizard
          onClose={() => setWizard("none")}
          onStartNew={() => setWizard("new")}
        />
      )}
    </div>
  );
}
