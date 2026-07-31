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
import ConnectionsRequiredModal from "./connections-required-modal";
import { studioUrl } from "@/lib/studio/project";
import { fetchProjectCards } from "@/lib/workspace/projects-real";
import { evaluateConnectionGuardrail } from "@/lib/workspace/connection-guardrail";
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
  const {
    mounted,
    session,
    firstSignIn,
    isMock,
    serverUserId,
    connections,
    connectionsResolved,
  } = useSession();
  const router = useRouter();
  const [wizard, setWizard] = useState<WizardOpen>("none");
  const [realProjects, setRealProjects] = useState<DemoProject[] | null>(null);

  // Landing "Blank canvas" (7a) → `/?newproject=blank` opens the SAME New-project
  // wizard as the "＋ New project" header + dashed card (create-new tab, createdFrom
  // blank). Runs once on mount, before the authed early-return guard is reached.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    // Intentional one-shot mount effect (the documented `nav-auth.tsx` pattern, not a
    // cascading-render bug): `window.location.search` is a browser value that does not
    // exist during SSR, so reading it here is the synchronization this effect is FOR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.get("newproject") === "blank") setWizard("new");
  }, []);

  // Real/seed mode: hydrate the grid from `GET /api/projects` (mock mode keeps the
  // DEMO_PROJECTS fallback inside RecentProjects).
  //
  // Gated on `serverUserId`, NOT on `mounted` alone — that asymmetry with the connections
  // effect (`session-provider.tsx`, which has always gated on the server user) is the
  // whole of the "grid is still empty after the first reload" half of the login bug. This
  // component mounts the instant `session.isAuthed` flips true, and `isAuthed` is true
  // from YouVersion auth ALONE, before the sign-in exchange has minted a cookie. The
  // effect fired, `GET /api/projects` 401'd, `fetchProjectCards` swallowed it and returned
  // `[]` (it returns `[]` on ANY failure), and with `[mounted, isMock]` deps nothing ever
  // asked again — so "you have no projects" was rendered on top of a 401.
  //
  // Keying on the user ID rather than a boolean also makes a user SWITCH refetch, instead
  // of showing one account the previous account's grid.
  useEffect(() => {
    if (!mounted || isMock) return;
    if (!serverUserId) return; // no cookie yet → an owner-scoped read would 401
    let active = true;
    void fetchProjectCards().then((cards) => {
      if (active) setRealProjects(cards);
    });
    return () => void (active = false);
  }, [mounted, isMock, serverUserId]);

  if (!mounted || !session.isAuthed) return null;

  const firstName = (session.user?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const openProject = (id: string) => router.push(studioUrl(id));

  /**
   * R3 — the create/import guardrail, DERIVED AT RENDER TIME from the current connection
   * state. Never decided inside a click handler.
   *
   * That is what makes the `/?newproject=blank` deep link work: it sets the intent from a
   * mount effect, BEFORE `GET /api/connections` has answered, so a handler-time decision
   * would be made against "nothing is connected" and could never be revisited. Here the
   * launcher only records WHICH wizard was asked for; what renders is re-decided on every
   * render, and swaps from the wizard to the modal (or back) the moment the answer arrives.
   *
   * `connectionsResolved` is the other half: an unresolved or failed read is not an answer
   * about the user's data, so it verdicts ALLOWED. The api's 409s remain the backstop for
   * that window.
   */
  const verdict = evaluateConnectionGuardrail(connections, connectionsResolved);
  const blocked = verdict.kind === "blocked";
  const wizardRequested = wizard !== "none";

  /**
   * Nothing in the LAUNCHER FAMILY — R3's modal and both project wizards — may render
   * while the user is still inside first-time onboarding.
   *
   * ## Why (2026-07-31 review, revision R3)
   *
   * `/?newproject=blank` is reachable from the landing page's "Blank canvas" card, from a
   * bookmark, from history and from a typed URL. A signed-out visitor who follows it and
   * signs in lands here with the query intact, so the mount effect above sets
   * `wizard = "new"` while `firstSignIn` is still true — and `<SetupWizard/>` is already
   * on screen. Two portalled dialogs stack, and 6 s later R3's redirect pushes
   * `/profile#connections`, where `profile-page.tsx` `router.replace("/")`s any
   * `firstSignIn` user straight back. The user is yanked twice and returns to a setup
   * wizard reset to step 1. A user inside onboarding is ALREADY being shown the connection
   * screens; R3 has nothing to add to them, and its destination is unreachable for them.
   *
   * ## D2 — ONE derived predicate, not three inline `!firstSignIn` copies
   *
   * Same reasoning as `evaluateConnectionGuardrail` itself: the rule has one name and one
   * definition, and a fourth launcher would otherwise be guarded by whoever remembered to.
   *
   * ## The gate covers THREE elements because there are TWO doorways, not one
   *
   * Gating only the modal is a half fix. `evaluateConnectionGuardrail` deliberately
   * verdicts ALLOWED while `connectionsResolved` is false (a failed/pending read is not an
   * answer about the user's data — `U-GR5`), and `connectionsResolved` is false until the
   * real-mode fetch lands. So on the FIRST mount at `?newproject=blank`, `blocked` is
   * false, the modal never renders, and `<NewProjectWizard/>` renders over the setup
   * wizard anyway. Both wizards need live GitHub data on their first step and neither has
   * a designed empty state — the comment below says so — so the second doorway leads to
   * exactly the harm the first one was closed for.
   *
   * ## D1 — this is a RENDER gate, not an intent gate (decided; pinned by U-WGC4)
   *
   * `wizard` is deliberately left set. When onboarding completes and `firstSignIn` flips
   * false, the requested wizard (or R3's modal, if they are still unconnected) opens. That
   * is coherent with the intent/verdict split this component already documents — the user
   * DID ask for a project, and the ask is honoured as soon as it can be. The alternative,
   * suppressing `setWizard("new")` in the mount effect while `firstSignIn`, silently drops
   * the deep link for exactly the users it most exists for: the ones arriving from the
   * landing page for the first time.
   */
  const launcherLive = !firstSignIn;

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
      {/* The intent/verdict split. Both wizards need live GitHub data on their FIRST step
          (owner login, repo lists) and neither has a designed empty state, and R3 mandates
          a redirect away from this page — which is worse fired from a modal over a modal.
          So the refusal happens here, at the one point all six entry points converge, and
          the wizard below simply never mounts while blocked. */}
      {launcherLive && wizardRequested && blocked && (
        <ConnectionsRequiredModal open verdict={verdict} />
      )}
      {launcherLive && wizard === "new" && !blocked && (
        <NewProjectWizard onClose={() => setWizard("none")} />
      )}
      {launcherLive && wizard === "import" && !blocked && (
        <ImportWizard
          onClose={() => setWizard("none")}
          onStartNew={() => setWizard("new")}
        />
      )}
    </div>
  );
}
