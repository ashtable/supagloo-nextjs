"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { studioUrl } from "@/lib/studio/project";

/**
 * 12b — the 2-step Import wizard. Step 1 picks a repo that already holds a
 * Supagloo project; step 2 auto-sequences the mocked verifying log and settles
 * to an "Open in studio →" CTA. A repo that fails verification (isSupaglooProject
 * === false) shows the whole-screen "NOT A SUPAGLOO PROJECT" error card, whose
 * "Start new project" hands off to the New-project wizard (D-WIZARD-SPLIT).
 */
export default function ImportWizard({
  onClose,
  onStartNew,
}: {
  onClose: () => void;
  onStartNew: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<ImportStep>("pick");
  const [selectedRepo, setSelectedRepo] = useState<MockRepo | null>(null);
  const [failedRepo, setFailedRepo] = useState<MockRepo | null>(null);
  const [importId, setImportId] = useState("");
  const [log, setLog] = useState<LogSequence>(() => initLog([]));

  // Auto-sequence the verifying log; stop at the last row (the terminal CTA is
  // manual — nothing self-navigates, D-REDIRECT).
  useEffect(() => {
    if (step !== "verifying") return;
    if (isLogComplete(log)) return;
    const t = setTimeout(
      () => setLog((l) => advanceLog(l)),
      PROVISION_ROW_DELAY_MS,
    );
    return () => clearTimeout(t);
  }, [step, log]);

  const startImport = () => {
    if (!selectedRepo) return;
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
  };

  const chooseAnother = () => {
    setSelectedRepo(null);
    setFailedRepo(null);
    setStep("pick");
  };

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
              repos={reposForImport()}
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
            <ProvisioningLog seq={log} />
          </div>
          {isLogComplete(log) && (
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
