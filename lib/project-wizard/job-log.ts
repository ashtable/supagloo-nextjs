/**
 * The provisioning-log DATA-SOURCE adapter (Task #26 §5.3 row 4). Replaces the fake
 * ticker's timer as the source of the log rows: the log is now driven by the polled
 * `ProjectJob.stages` JSON (`GET /api/projects/:id/jobs/:jobId`). The
 * `ProvisioningLog` VIEW contract is preserved — it renders `{ label, status }` rows
 * with `data-status` ∈ completed|active|queued|failed — so only the source changes.
 *
 * Pure — no React/DOM. Structural input types so this module never has to import the
 * wire contracts (the mock path and the real path both feed it).
 */
import { logRowStatus, type LogSequence } from "./provisioning-log";

export type LogRowStatus = "completed" | "active" | "queued" | "failed";

export interface LogRow {
  label: string;
  status: LogRowStatus;
}

/** A single polled stage (structural mirror of db-lib `JobStage`). */
export interface StageLike {
  key: string;
  label: string;
  state: "pending" | "running" | "done" | "failed";
}

/** A polled job (structural mirror of the `ProjectJobDto` fields the log reads). */
export interface JobLike {
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  stages: readonly StageLike[];
}

const STAGE_STATE_TO_STATUS: Record<StageLike["state"], LogRowStatus> = {
  done: "completed",
  running: "active",
  pending: "queued",
  failed: "failed",
};

/** Map a polled job's `stages` → the view's `{ label, status }` rows. */
export function stagesToLogRows(stages: readonly StageLike[]): LogRow[] {
  return stages.map((s) => ({
    label: s.label,
    status: STAGE_STATE_TO_STATUS[s.state],
  }));
}

/** Adapt the MOCK path's `LogSequence` (the retained fake ticker) into the same
 *  `{ label, status }` rows the view renders — so mock mode is byte-for-byte
 *  unchanged from the view's perspective. */
export function logSequenceToRows(seq: LogSequence): LogRow[] {
  return seq.rows.map((label, i) => ({
    label,
    status: logRowStatus(seq, i) as LogRowStatus,
  }));
}

/** A terminal job status (nothing more will change). */
export function jobIsTerminal(job: JobLike): boolean {
  return (
    job.status === "succeeded" ||
    job.status === "failed" ||
    job.status === "canceled"
  );
}

export function jobSucceeded(job: JobLike): boolean {
  return job.status === "succeeded";
}

export function jobFailed(job: JobLike): boolean {
  return job.status === "failed" || job.status === "canceled";
}

/** The key of the first failed stage — drives the import "NOT A SUPAGLOO PROJECT"
 *  branch (`verifySupaglooProject`). Null when no stage failed. */
export function failedStageKey(job: JobLike): string | null {
  return job.stages.find((s) => s.state === "failed")?.key ?? null;
}
