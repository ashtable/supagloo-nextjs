import { describe, expect, it } from "vitest";

// RED until `lib/project-wizard/job-log.ts` ships. The pure adapter that replaces the
// fake ticker's DATA SOURCE (Task #26 §5.3 row 4): the provisioning log is now driven
// by the polled `ProjectJob.stages` JSON instead of a timer. The `ProvisioningLog`
// VIEW contract is preserved — it renders `{ label, status }` rows with
// data-status ∈ completed|active|queued|failed.
import {
  stagesToLogRows,
  logSequenceToRows,
  jobSucceeded,
  jobFailed,
  jobIsTerminal,
  failedStageKey,
  type LogRow,
} from "./job-log";
import { initLog, advanceLog } from "./provisioning-log";

const STAGES = [
  { key: "mintInstallationToken", label: "Authenticating with GitHub", state: "done" as const },
  { key: "cloneToWorkspace", label: "Cloning repository", state: "running" as const },
  { key: "writeRemotionScaffold", label: "Scaffolding", state: "pending" as const },
];

describe("stagesToLogRows", () => {
  it("U-JL1: maps stage states → done→completed / running→active / pending→queued", () => {
    const rows = stagesToLogRows(STAGES);
    expect(rows).toEqual<LogRow[]>([
      { label: "Authenticating with GitHub", status: "completed" },
      { label: "Cloning repository", status: "active" },
      { label: "Scaffolding", status: "queued" },
    ]);
  });

  it("U-JL2: maps a failed stage → failed", () => {
    const rows = stagesToLogRows([
      { key: "verifySupaglooProject", label: "Verifying", state: "failed" },
    ]);
    expect(rows[0].status).toBe("failed");
  });

  it("U-JL3: an empty stage list yields no rows", () => {
    expect(stagesToLogRows([])).toEqual([]);
  });
});

describe("logSequenceToRows (mock-path adapter — preserves the ticker's rows)", () => {
  it("U-JL4: adapts a LogSequence to the same {label,status} rows the view renders", () => {
    const seq = advanceLog(initLog(["a", "b", "c"])); // cursor at index 1
    expect(logSequenceToRows(seq)).toEqual<LogRow[]>([
      { label: "a", status: "completed" },
      { label: "b", status: "active" },
      { label: "c", status: "queued" },
    ]);
  });
});

describe("job terminal helpers", () => {
  const succeeded = { status: "succeeded" as const, stages: STAGES };
  const running = { status: "running" as const, stages: STAGES };
  const failedJob = {
    status: "failed" as const,
    stages: [
      { key: "cloneRepo", label: "Cloning", state: "done" as const },
      { key: "verifySupaglooProject", label: "Verifying", state: "failed" as const },
    ],
  };

  it("U-JL5: jobSucceeded / jobFailed / jobIsTerminal reflect the job status", () => {
    expect(jobSucceeded(succeeded)).toBe(true);
    expect(jobSucceeded(running)).toBe(false);
    expect(jobFailed(failedJob)).toBe(true);
    expect(jobFailed(running)).toBe(false);
    expect(jobIsTerminal(running)).toBe(false);
    expect(jobIsTerminal(succeeded)).toBe(true);
    expect(jobIsTerminal(failedJob)).toBe(true);
  });

  it("U-JL6: failedStageKey returns the key of the failed stage (drives the import error card)", () => {
    expect(failedStageKey(failedJob)).toBe("verifySupaglooProject");
    expect(failedStageKey(succeeded)).toBeNull();
  });
});
