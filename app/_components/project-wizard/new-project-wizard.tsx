"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import WizardShell from "./wizard-shell";
import SegmentedControl from "./segmented-control";
import RepoPicker from "./repo-picker";
import ProvisioningLog from "./provisioning-log";
import TerminalReadyCard from "./terminal-ready-card";
import WizardCta from "./wizard-cta";
import OctocatIcon from "../octocat-icon";
import {
  deriveShortName,
  reposForNewProject,
  type MockRepo,
} from "@/lib/project-wizard/repos-model";
import {
  canScaffold,
  ctaLabel,
  defaultProjectName,
  deriveProjectId,
  progressFill,
  stepEyebrow,
  type NewProjectStep,
  type RepoTab,
} from "@/lib/project-wizard/new-project-model";
import {
  advanceLog,
  initLog,
  isLogComplete,
  newProjectLogRows,
  PROVISION_ROW_DELAY_MS,
  type LogSequence,
} from "@/lib/project-wizard/provisioning-log";
import { studioUrl } from "@/lib/studio/project";

/** The working branch every freshly-scaffolded project opens on. */
const NEW_BRANCH = "v0.0.1";

const FIELD_LABEL: CSSProperties = {
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: ".06em",
  color: "var(--sg-dim)",
  marginBottom: 5,
};

/**
 * 12a + 13a — the 3-step New-project wizard. Step 1 tabs between "Create new
 * repo" (name field) and "Use existing empty repo" (repo picker); step 2
 * auto-sequences the mocked scaffolding log; step 3 is the terminal ready card.
 * ONE component covers both tabs (D-WIZARD-SPLIT).
 */
export default function NewProjectWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<NewProjectStep>("configure");
  const [tab, setTab] = useState<RepoTab>("create-new");
  const [repoName, setRepoName] = useState("psalm-121");
  const [selectedRepo, setSelectedRepo] = useState<MockRepo | null>(null);
  const [scaffoldId, setScaffoldId] = useState("");
  const [log, setLog] = useState<LogSequence>(() => initLog([]));

  const input = { tab, repoName, selectedRepo };
  const projectName =
    tab === "create-new"
      ? defaultProjectName(deriveShortName(repoName))
      : selectedRepo
        ? defaultProjectName(selectedRepo.shortName)
        : "—";

  // Auto-sequence the scaffolding log one row per tick, then advance to ready
  // (the `setup-wizard` auto-advance pattern; the reducer stays pure, the timer
  // is caller-owned).
  useEffect(() => {
    if (step !== "scaffolding") return;
    if (isLogComplete(log)) {
      const t = setTimeout(() => setStep("ready"), PROVISION_ROW_DELAY_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setLog((l) => advanceLog(l)),
      PROVISION_ROW_DELAY_MS,
    );
    return () => clearTimeout(t);
  }, [step, log]);

  const startScaffold = () => {
    const id = deriveProjectId(input);
    setScaffoldId(id);
    setLog(
      initLog(
        newProjectLogRows(tab, {
          fullName: `ashsrinivas/${id}`,
          branch: NEW_BRANCH,
        }),
      ),
    );
    setStep("scaffolding");
  };

  if (step === "ready") {
    return (
      <WizardShell
        testId="new-project-wizard"
        eyebrow={null}
        eyebrowTestId="new-project-eyebrow"
        closeTestId="new-project-close"
        progress={progressFill("ready")}
        progressTestId="new-project-progress"
        onClose={onClose}
        contentStyle={{ padding: "38px 32px" }}
      >
        <TerminalReadyCard
          projectId={scaffoldId}
          branch={NEW_BRANCH}
          onOpen={() => router.push(studioUrl(scaffoldId))}
        />
      </WizardShell>
    );
  }

  return (
    <WizardShell
      testId="new-project-wizard"
      eyebrow={stepEyebrow(step)}
      eyebrowTestId="new-project-eyebrow"
      closeTestId="new-project-close"
      progress={progressFill(step)}
      progressTestId="new-project-progress"
      onClose={onClose}
    >
      {step === "configure" ? (
        <>
          <div
            style={{
              fontFamily: "var(--font-anton), sans-serif",
              fontSize: 26,
              lineHeight: 1.05,
            }}
          >
            {"WHERE SHOULD THIS PROJECT LIVE?"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-zilla), 'Zilla Slab', Georgia, serif",
              fontSize: 14,
              color: "var(--sg-dim)",
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            {
              "Pick an empty GitHub repo, or create a new one. This becomes the source of truth for your project."
            }
          </div>

          <div style={{ marginTop: 18 }}>
            <SegmentedControl<RepoTab>
              segments={[
                {
                  value: "create-new",
                  label: "Create new repo",
                  testId: "tab-create-new",
                },
                {
                  value: "existing-empty",
                  label: "Use existing empty repo",
                  testId: "tab-existing-empty",
                },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>

          {tab === "create-new" ? (
            <div style={{ marginTop: 16 }}>
              <div style={FIELD_LABEL}>{"NEW REPOSITORY NAME"}</div>
              <div
                style={{
                  height: 44,
                  border: "1px solid var(--sg-line2)",
                  borderRadius: 10,
                  background: "var(--sg-panel)",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    color: "var(--sg-dim)",
                  }}
                >
                  <OctocatIcon size={15} />
                  {"ashsrinivas /"}
                </span>
                <input
                  data-testid="new-repo-name"
                  type="text"
                  aria-label="New repository name"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: "monospace",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--sg-fg)",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                  }}
                />
                <span
                  data-testid="repo-visibility"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    color: "var(--sg-dim)",
                    flex: "none",
                  }}
                >
                  {"🔒 Private ▾"}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <RepoPicker
                repos={reposForNewProject()}
                variant="empty-check"
                selectedFullName={selectedRepo?.fullName ?? null}
                onSelect={setSelectedRepo}
              />
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <div style={FIELD_LABEL}>
              {"PROJECT NAME "}
              <span
                style={{
                  fontWeight: 500,
                  textTransform: "none",
                  letterSpacing: 0,
                }}
              >
                {"— defaults to the repo name"}
              </span>
            </div>
            <div
              data-testid="project-name-display"
              style={{
                height: 44,
                border: "1px solid var(--sg-line2)",
                borderRadius: 10,
                background: "var(--sg-panel)",
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {projectName}
            </div>
          </div>

          <WizardCta
            label={ctaLabel(tab)}
            testId="new-project-cta"
            onClick={startScaffold}
            disabled={!canScaffold(input)}
          />
        </>
      ) : (
        <>
          <div
            style={{
              fontFamily: "var(--font-anton), sans-serif",
              fontSize: 26,
              lineHeight: 1.05,
            }}
          >
            {"SCAFFOLDING "}
            <span style={{ color: "var(--sg-gold)" }}>
              {scaffoldId.toUpperCase()}
            </span>
            {"…"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-zilla), 'Zilla Slab', Georgia, serif",
              fontSize: 14,
              color: "var(--sg-dim)",
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            {
              "Setting up your Remotion project on a temporary Railway workspace. Hang tight — about 20 seconds."
            }
          </div>
          <div style={{ marginTop: 18 }}>
            <ProvisioningLog seq={log} />
          </div>
          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--sg-dim)",
            }}
          >
            <span style={{ color: "var(--sg-gold)" }}>{"ⓘ"}</span>
            {" main stays clean & released; you always edit on the newest "}
            <b style={{ color: "var(--sg-fg)" }}>{"v0.0.x"}</b>
            {" branch."}
          </div>
        </>
      )}
    </WizardShell>
  );
}
