"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../session-provider";
import WizardShell from "./wizard-shell";
import RepoPicker from "./repo-picker";
import ProvisioningLog from "./provisioning-log";
import TerminalReadyCard from "./terminal-ready-card";
import WizardCta from "./wizard-cta";
import {
  reposForImport,
  type MockRepo,
} from "@/lib/project-wizard/repos-model";
import {
  canImport,
  deriveProjectId,
  IMPORT_FAILED_EYEBROW,
  progressFill,
  stepEyebrow,
  verifyOutcome,
  type ImportStep,
} from "@/lib/project-wizard/import-model";
import {
  advanceLog,
  importLogRows,
  initLog,
  isLogComplete,
  PROVISION_ROW_DELAY_MS,
  type LogSequence,
} from "@/lib/project-wizard/provisioning-log";
import {
  logSequenceToRows,
  stagesToLogRows,
  jobSucceeded,
  failedStageKey,
  type LogRow,
} from "@/lib/project-wizard/job-log";
import { fetchWizardRepos } from "@/lib/project-wizard/wizard-repos";
import { importRepo, pollJobUntilTerminal } from "@/lib/project-wizard/provision-effects";
import { studioUrl } from "@/lib/studio/project";

/**
 * 12b — the 2-step Import wizard. Step 1 picks a repo that already holds a Supagloo
 * project; step 2 renders the verifying log and settles to an "Open in studio →" CTA.
 * A repo that fails verification shows the "NOT A SUPAGLOO PROJECT" error card.
 *
 * Task #26: in `?mock=` mode the fake ticker + `repo.isSupaglooProject` drive it
 * (pure-UI regression, untouched). In real/seed mode the wizard POSTs to
 * `/api/projects/import` and polls the real import job — a `verifySupaglooProject`
 * stage failure is what surfaces the error card (not a mock flag).
 */
export default function ImportWizard({
  onClose,
  onStartNew,
}: {
  onClose: () => void;
  onStartNew: () => void;
}) {
  const router = useRouter();
  const { isMock } = useSession();
  const [step, setStep] = useState<ImportStep>("pick");
  const [selectedRepo, setSelectedRepo] = useState<MockRepo | null>(null);
  const [failedRepo, setFailedRepo] = useState<MockRepo | null>(null);
  const [importId, setImportId] = useState("");
  const [log, setLog] = useState<LogSequence>(() => initLog([]));
  const [realRepos, setRealRepos] = useState<MockRepo[]>([]);
  const [realRows, setRealRows] = useState<LogRow[]>([]);
  const [realDone, setRealDone] = useState(false);
  const aliveRef = useRef(true);
  useEffect(() => () => void (aliveRef.current = false), []);

  // Real/seed mode: hydrate the import picker from live GitHub repos.
  useEffect(() => {
    if (isMock) return;
    let active = true;
    void fetchWizardRepos("all").then((repos) => {
      if (active) setRealRepos(repos);
    });
    return () => void (active = false);
  }, [isMock]);

  const pickerRepos = isMock ? reposForImport() : realRepos;

  // MOCK path only: auto-sequence the verifying log; stop at the last row.
  useEffect(() => {
    if (!isMock || step !== "verifying") return;
    if (isLogComplete(log)) return;
    const t = setTimeout(() => setLog((l) => advanceLog(l)), PROVISION_ROW_DELAY_MS);
    return () => clearTimeout(t);
  }, [isMock, step, log]);

  const startImport = () => {
    if (!selectedRepo) return;
    if (isMock) {
      if (verifyOutcome(selectedRepo) === "failure") {
        setFailedRepo(selectedRepo);
        setStep("error");
        return;
      }
      setImportId(deriveProjectId(selectedRepo));
      setLog(
        initLog(
          importLogRows({ latestBranch: selectedRepo.latestBranch ?? "v0.0.1" }),
        ),
      );
      setStep("verifying");
      return;
    }
    // Real/seed mode.
    setRealRows([]);
    setRealDone(false);
    setImportId(deriveProjectId(selectedRepo));
    setStep("verifying");
    void startRealImport(selectedRepo);
  };

  const startRealImport = async (repo: MockRepo) => {
    const ref = await importRepo({
      repoOwner: repo.owner,
      repoName: repo.shortName,
      projectName: repo.shortName,
    });
    if (!aliveRef.current) return;
    if (!ref) {
      setFailedRepo(repo);
      setStep("error");
      return;
    }
    const job = await pollJobUntilTerminal(ref.projectId, ref.jobId, {
      onUpdate: (j) => {
        if (aliveRef.current) setRealRows(stagesToLogRows(j.stages));
      },
    });
    if (!aliveRef.current) return;
    if (job && jobSucceeded(job)) {
      setRealDone(true); // reveals the terminal "Open in studio →" CTA
      return;
    }
    // A verify failure (or any import failure) → the "NOT A SUPAGLOO PROJECT" card.
    // `verifySupaglooProject` is the typed non-retryable failure the design calls out.
    if (job) void failedStageKey(job); // (documented: the stage key that failed)
    setFailedRepo(repo);
    setStep("error");
  };

  const chooseAnother = () => {
    setSelectedRepo(null);
    setFailedRepo(null);
    setRealRows([]);
    setRealDone(false);
    setStep("pick");
  };

  const logRows: LogRow[] = isMock ? logSequenceToRows(log) : realRows;
  const verifyComplete = isMock ? isLogComplete(log) : realDone;

  if (step === "error") {
    return (
      <WizardShell
        testId="import-wizard"
        eyebrow={IMPORT_FAILED_EYEBROW}
        eyebrowTestId="import-eyebrow"
        closeTestId="import-close"
        progress={100}
        progressTestId="import-progress"
        tone="error"
        onClose={onClose}
        contentStyle={{ padding: "30px 28px 28px", textAlign: "center" }}
      >
        <div data-testid="import-error-card">
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto",
              borderRadius: "50%",
              background: "rgba(192,57,43,.12)",
              border: "2px solid var(--sg-red)",
              display: "grid",
              placeItems: "center",
              color: "var(--sg-red)",
              fontSize: 32,
            }}
          >
            {"!"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-anton), sans-serif",
              fontSize: 24,
              lineHeight: 1.05,
              marginTop: 18,
            }}
          >
            {"NOT A SUPAGLOO PROJECT"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-zilla), 'Zilla Slab', Georgia, serif",
              fontSize: 14,
              color: "var(--sg-dim)",
              marginTop: 10,
              lineHeight: 1.55,
              maxWidth: 400,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            <b style={{ color: "var(--sg-fg)" }}>
              {failedRepo?.fullName ?? "This repo"}
            </b>
            {" doesn't contain a Remotion project (no "}
            <span style={{ fontFamily: "monospace" }}>{"remotion.config.ts"}</span>
            {" or version branch). Pick a different repo, or start a new project instead."}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button
              type="button"
              data-testid="import-error-choose-another"
              onClick={chooseAnother}
              className="cursor-pointer"
              style={{
                flex: 1,
                textAlign: "center",
                padding: 13,
                border: "1px solid var(--sg-line2)",
                borderRadius: 11,
                fontWeight: 700,
                fontSize: 14,
                color: "var(--sg-fg)",
                background: "transparent",
              }}
            >
              {"← Choose another"}
            </button>
            <button
              type="button"
              data-testid="import-error-start-new"
              onClick={onStartNew}
              className="cursor-pointer"
              style={{
                flex: 1,
                textAlign: "center",
                padding: 13,
                borderRadius: 11,
                backgroundImage: "var(--sg-grad)",
                boxShadow: "0 6px 16px rgba(192,57,43,.3)",
                fontWeight: 700,
                fontSize: 14,
                color: "#fff",
                border: "none",
              }}
            >
              {"Start new project"}
            </button>
          </div>
        </div>
      </WizardShell>
    );
  }

  return (
    <WizardShell
      testId="import-wizard"
      eyebrow={stepEyebrow(step)}
      eyebrowTestId="import-eyebrow"
      closeTestId="import-close"
      progress={progressFill(step)}
      progressTestId="import-progress"
      onClose={onClose}
    >
      {step === "pick" ? (
        <>
          <div
            style={{
              fontFamily: "var(--font-anton), sans-serif",
              fontSize: 26,
              lineHeight: 1.05,
            }}
          >
            {"IMPORT AN EXISTING PROJECT"}
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
            {"Choose a GitHub repo that already contains a Supagloo project."}
          </div>
          <div style={{ marginTop: 16 }}>
            <RepoPicker
              repos={pickerRepos}
              variant="import"
              selectedFullName={selectedRepo?.fullName ?? null}
              onSelect={setSelectedRepo}
            />
          </div>
          <WizardCta
            label="Import & verify →"
            testId="import-cta"
            onClick={startImport}
            disabled={!canImport(selectedRepo)}
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
            {"VERIFYING "}
            <span style={{ color: "var(--sg-gold)" }}>
              {importId.toUpperCase()}
            </span>
            {"…"}
          </div>
          <div style={{ marginTop: 18 }}>
            <ProvisioningLog rows={logRows} />
          </div>
          {verifyComplete && (
            <TerminalReadyCard
              projectId={importId}
              branch=""
              compact
              onOpen={() => router.push(studioUrl(importId))}
            />
          )}
        </>
      )}
    </WizardShell>
  );
}
