"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../session-provider";
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
import {
  logSequenceToRows,
  stagesToLogRows,
  jobSucceeded,
  type LogRow,
} from "@/lib/project-wizard/job-log";
import { fetchWizardRepos } from "@/lib/project-wizard/wizard-repos";
import {
  scaffoldExistingRepo,
  pollJobUntilTerminal,
  stashCreateRepoParams,
  pollCreateRepoResult,
  clearCreateRepo,
} from "@/lib/project-wizard/provision-effects";
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

function randomNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 12a + 13a — the 3-step New-project wizard. Step 1 tabs between "Create new repo"
 * (name field) and "Use existing empty repo" (repo picker); step 2 renders the
 * provisioning log; step 3 is the terminal ready card. ONE component covers both tabs.
 *
 * Task #26: two data sources behind the SAME view. In `?mock=` mode the fake ticker
 * drives the log (pure-UI regression, untouched). In real/seed mode the wizard hits
 * the real endpoints — create-new drives the JIT user-auth hop (§2.3/§6b), then both
 * tabs poll the real scaffold job's `stages`.
 */
export default function NewProjectWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { isMock } = useSession();
  const [step, setStep] = useState<NewProjectStep>("configure");
  const [tab, setTab] = useState<RepoTab>("create-new");
  const [repoName, setRepoName] = useState(isMock ? "psalm-121" : "");
  const [selectedRepo, setSelectedRepo] = useState<MockRepo | null>(null);
  const [scaffoldId, setScaffoldId] = useState("");
  const [log, setLog] = useState<LogSequence>(() => initLog([]));
  const [realRepos, setRealRepos] = useState<MockRepo[]>([]);
  const [realRows, setRealRows] = useState<LogRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => () => void (aliveRef.current = false), []);

  const input = { tab, repoName, selectedRepo };
  const projectName =
    tab === "create-new"
      ? repoName.trim()
        ? defaultProjectName(deriveShortName(repoName))
        : "—"
      : selectedRepo
        ? defaultProjectName(selectedRepo.shortName)
        : "—";

  // Real/seed mode: hydrate the existing-empty picker from live GitHub repos.
  useEffect(() => {
    if (isMock) return;
    let active = true;
    void fetchWizardRepos("all").then((repos) => {
      if (active) setRealRepos(repos);
    });
    return () => void (active = false);
  }, [isMock]);

  const pickerRepos = isMock ? reposForNewProject() : realRepos;

  // MOCK path only: auto-sequence the scaffolding log one row per tick, then → ready.
  useEffect(() => {
    if (!isMock || step !== "scaffolding") return;
    if (isLogComplete(log)) {
      const t = setTimeout(() => setStep("ready"), PROVISION_ROW_DELAY_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setLog((l) => advanceLog(l)), PROVISION_ROW_DELAY_MS);
    return () => clearTimeout(t);
  }, [isMock, step, log]);

  const startScaffold = () => {
    if (isMock) {
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
      return;
    }
    // Real/seed mode.
    setErrorMsg(null);
    setRealRows([]);
    setStep("scaffolding");
    if (tab === "create-new") {
      void startRealCreateNew();
    } else if (selectedRepo) {
      void startRealExisting(selectedRepo);
    }
  };

  // Real create-new: the JIT user-auth hop (§2.3/§6b). Stash the form params, open the
  // authorize popup, poll the localStorage result the callback page writes, then poll
  // the scaffold job. A full-page redirect would reset the wizard's step state, so this
  // mirrors the OpenRouter popup+poll pattern.
  const startRealCreateNew = async () => {
    const nonce = randomNonce();
    const name = projectName;
    stashCreateRepoParams(
      nonce,
      {
        repoName: deriveShortName(repoName),
        projectName: name,
        visibility: "private",
        createdFrom: "blank",
      },
      window.localStorage,
    );
    try {
      window.open(
        `/api/connect/github/create-repo/start?state=${encodeURIComponent(nonce)}`,
        "_blank",
      );
    } catch {
      /* popup blocked — the poll below is the source of truth */
    }
    const result = await pollCreateRepoResult(nonce, { storage: window.localStorage });
    clearCreateRepo(nonce, window.localStorage);
    if (!aliveRef.current) return;
    if (!result) {
      setErrorMsg("We couldn't create the repository. Close and try again.");
      return;
    }
    setScaffoldId(result.slug);
    await drivePolling(result.projectId, result.jobId, result.slug);
  };

  // Real existing-empty: the repo already exists, so no JIT — POST straight to the
  // scaffold create endpoint, then poll the job.
  const startRealExisting = async (repo: MockRepo) => {
    const ref = await scaffoldExistingRepo({
      repoOwner: repo.owner,
      repoName: repo.shortName,
      projectName,
    });
    if (!aliveRef.current) return;
    if (!ref) {
      setErrorMsg("We couldn't start scaffolding. Close and try again.");
      return;
    }
    setScaffoldId(repo.shortName);
    await drivePolling(ref.projectId, ref.jobId, repo.shortName);
  };

  const drivePolling = async (projectId: string, jobId: string, slug: string) => {
    const job = await pollJobUntilTerminal(projectId, jobId, {
      onUpdate: (j) => {
        if (aliveRef.current) setRealRows(stagesToLogRows(j.stages));
      },
    });
    if (!aliveRef.current) return;
    if (job && jobSucceeded(job)) {
      setScaffoldId(slug);
      setStep("ready");
    } else {
      setErrorMsg("Scaffolding failed. Close and try again.");
    }
  };

  const logRows: LogRow[] = isMock ? logSequenceToRows(log) : realRows;

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
                  placeholder="my-scripture-video"
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
                repos={pickerRepos}
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
            <ProvisioningLog rows={logRows} />
          </div>
          {errorMsg && (
            <div
              data-testid="new-project-error"
              style={{ marginTop: 12, fontSize: 13, color: "var(--sg-red)" }}
            >
              {errorMsg}
            </div>
          )}
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
