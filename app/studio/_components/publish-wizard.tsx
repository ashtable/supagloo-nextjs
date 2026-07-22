"use client";

import { useEffect } from "react";
import styles from "../studio.module.css";
import { useStudio } from "./studio-context";
import StudioLog from "./studio-log";
import {
  PROVISION_ROW_DELAY_MS,
  isLogComplete,
} from "@/lib/project-wizard/provisioning-log";
import {
  nextVersion,
  postPublishBranch,
  publishLabel,
  publishedVersion,
} from "@/lib/studio/project";
import {
  publishReview,
  type DiffTone,
  type PublishReview,
} from "@/lib/studio/publish-review";

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";
const MONO = "ui-monospace, Menlo, monospace";
const ANTON = "var(--font-anton), sans-serif";
const ZILLA = "var(--font-zilla), 'Zilla Slab', Georgia, serif";

const CARD: React.CSSProperties = {
  width: 480,
  background: "#1b140d",
  color: "#f1e7d6",
  borderRadius: 16,
  border: "1px solid rgba(230,180,120,.18)",
  boxShadow: "0 30px 70px rgba(0,0,0,.55)",
  overflow: "hidden",
  fontFamily: "var(--font-barlow), sans-serif",
};
const TONE_COLOR: Record<DiffTone, string> = {
  code: "#2f8f4e",
  data: "#e6a43b",
};

/**
 * 14a — the warm, studio-scoped Publish wizard (D-SKIN). One backdrop-modal card
 * that renders three steps by `publishFlow`: review → publishing → published. It
 * owns the publishing-log auto-advance ticker (the reducer stays pure), firing
 * PUBLISH_DONE (the two-step bump) when the log completes. Dismissal is its OWN
 * (not the CLOSE_MENUS family): step 1 is ✕/Cancel/backdrop-dismissible, step 2
 * is non-dismissible (no ✕, can't abort a git op), step 3 has the ✕.
 *
 * The card is TOP-anchored (not vertically centered) so the full-frame backdrop's
 * geometric center stays exposed — the E2E's coordinate-based backdrop click must
 * land on the dimmer, not the card, to dismiss step 1.
 */
export default function PublishWizard() {
  const { state, dispatch, project, confirmPublish, closePublish, startRender } =
    useStudio();
  const {
    publishFlow,
    versionBranch,
    lastPublishedVersion,
    publishLog,
    publishStages,
    publishError,
  } = state;
  // Real mode (a source manifest present) drives the publishing step from the polled
  // ProjectJob stages (`publishStages`), not the mock `publishLog` ticker.
  const isReal = project.manifest !== undefined;

  // Publishing-log ticker: advance one row per tick, then fire the two-step
  // PUBLISH_DONE once complete. Tied to the mounted card, so a Cancel/unmount
  // cleanly stops it (step 2 is non-dismissible, so it always runs to done).
  useEffect(() => {
    if (publishFlow !== "publishing" || !publishLog) return;
    const complete = isLogComplete(publishLog);
    const t = setTimeout(() => {
      dispatch(complete ? { type: "PUBLISH_DONE" } : { type: "ADVANCE_PUBLISH_LOG" });
    }, PROVISION_ROW_DELAY_MS);
    return () => clearTimeout(t);
  }, [publishFlow, publishLog, dispatch]);

  const published = publishedVersion(versionBranch); // v0.0.1 → v0.0.2 (mock two-step)
  const nextBranch = postPublishBranch(versionBranch); // v0.0.1 → v0.0.3 (mock two-step)
  // Real Model-A one-step: publishing the CURRENT working v0.0.1 lands on v0.0.2.
  const realNextBranch = nextVersion(versionBranch); // v0.0.1 → v0.0.2
  const footnoteNextBranch = isReal ? realNextBranch : nextBranch;

  return (
    <>
      <div
        data-testid="publish-backdrop"
        onClick={() => {
          if (publishFlow === "review") closePublish();
        }}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 50,
          background: "rgba(6,4,2,.62)",
          backdropFilter: "blur(2px)",
        }}
      />
      <div
        data-testid="publish-wizard"
        style={{
          position: "absolute",
          top: 32,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 51,
          ...CARD,
        }}
      >
        {publishFlow === "review" ? (
          <ReviewStep
            versionBranch={versionBranch}
            published={published}
            onCancel={closePublish}
            onClose={closePublish}
            onConfirm={confirmPublish}
            review={publishReview(project)}
          />
        ) : null}

        {publishFlow === "publishing" && publishLog ? (
          <div>
            <StepHeader label={`PUBLISHING ${published}…`} />
            <div style={{ padding: 22 }}>
              <div
                data-testid="publishing-log"
                style={{
                  border: "1px solid rgba(230,180,120,.14)",
                  borderRadius: 12,
                  background: "#0f0b07",
                  padding: "6px 12px",
                }}
              >
                <StudioLog seq={publishLog} />
                <div
                  style={{
                    marginTop: 6,
                    paddingTop: 10,
                    borderTop: "1px solid rgba(230,180,120,.12)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "#a99b85",
                  }}
                >
                  <span style={{ color: "#e6a43b" }}>{"ⓘ"}</span>
                  {" Your next edits continue on a fresh "}
                  <b style={{ color: "#f1e7d6", fontFamily: MONO }}>{footnoteNextBranch}</b>
                  {" branch."}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* REAL publishing step (Task 28): the SAME `publishing-log` container, but
            fed by the polled ProjectJob's 7 stages (`publishStages`) instead of the
            mock ticker, plus a failure slot when the publish job errors — the git op
            can genuinely fail, so a failed publish stays visible + dismissible. */}
        {publishFlow === "publishing" && !publishLog ? (
          <div>
            <StepHeader label={`PUBLISHING ${versionBranch}…`} />
            <div style={{ padding: 22 }}>
              <div
                data-testid="publishing-log"
                style={{
                  border: "1px solid rgba(230,180,120,.14)",
                  borderRadius: 12,
                  background: "#0f0b07",
                  padding: "6px 12px",
                }}
              >
                <StudioLog rows={publishStages ?? []} />
                {publishError ? (
                  <div
                    style={{
                      marginTop: 6,
                      paddingTop: 10,
                      borderTop: "1px solid rgba(230,180,120,.12)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span
                      data-testid="publish-error"
                      title={publishError}
                      style={{ flex: 1, fontSize: 12.5, color: "#e0745a" }}
                    >
                      {"Publish failed — nothing was merged. Close and try again."}
                    </span>
                    <button
                      type="button"
                      data-testid="publish-error-close"
                      onClick={closePublish}
                      className={styles.hoverable}
                      style={{
                        padding: "7px 13px",
                        borderRadius: 9,
                        fontWeight: 700,
                        fontSize: 12.5,
                        color: "#f1e7d6",
                        background: "transparent",
                        border: "1px solid rgba(230,180,120,.24)",
                      }}
                    >
                      {"Close"}
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 6,
                      paddingTop: 10,
                      borderTop: "1px solid rgba(230,180,120,.12)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      color: "#a99b85",
                    }}
                  >
                    <span style={{ color: "#e6a43b" }}>{"ⓘ"}</span>
                    {" Your next edits continue on a fresh "}
                    <b style={{ color: "#f1e7d6", fontFamily: MONO }}>{footnoteNextBranch}</b>
                    {" branch."}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {publishFlow === "published" ? (
          <PublishedStep
            publishedTag={lastPublishedVersion ?? published}
            nextBranch={versionBranch}
            onClose={closePublish}
            onRender={startRender}
          />
        ) : null}
      </div>
    </>
  );
}

function StepHeader({ label, onClose }: { label: string; onClose?: () => void }) {
  return (
    <div
      style={{
        height: 46,
        display: "flex",
        alignItems: "center",
        padding: "0 16px 0 20px",
        borderBottom: "1px solid rgba(230,180,120,.12)",
      }}
    >
      <span
        style={{
          fontFamily: SEMI,
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: ".16em",
          color: "#a99b85",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1 }} />
      {onClose ? (
        <button
          type="button"
          data-testid="publish-close"
          aria-label="Close"
          onClick={onClose}
          className={styles.hoverable}
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: "1px solid rgba(230,180,120,.18)",
            background: "transparent",
            color: "#a99b85",
            display: "grid",
            placeItems: "center",
          }}
        >
          {"✕"}
        </button>
      ) : null}
    </div>
  );
}

function ReviewStep({
  versionBranch,
  published,
  onCancel,
  onClose,
  onConfirm,
  review,
}: {
  versionBranch: string;
  published: string;
  onCancel: () => void;
  onClose: () => void;
  onConfirm: () => void;
  review: PublishReview;
}) {
  return (
    <div data-testid="publish-review">
      <StepHeader label="PUBLISH · REVIEW & CONFIRM" onClose={onClose} />
      <div style={{ padding: 20 }}>
        {/* version transition */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: MONO,
            fontSize: 14,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              padding: "4px 10px",
              border: "1px solid rgba(230,180,120,.24)",
              borderRadius: 7,
              fontWeight: 700,
            }}
          >
            {versionBranch}
          </span>
          <span style={{ color: "#e6a43b" }}>{"→"}</span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 7,
              fontWeight: 700,
              color: "#fff",
              background: "linear-gradient(150deg,#d4a24c,#c0392b 55%,#6d3b26)",
            }}
          >
            {published}
          </span>
          <span style={{ fontFamily: "var(--font-barlow), sans-serif", fontSize: 12, color: "#a99b85" }}>
            {"merges to main"}
          </span>
        </div>

        {/* commit message */}
        <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: ".06em", color: "#a99b85", marginBottom: 6 }}>
          {"COMMIT MESSAGE"}
        </div>
        <div
          data-testid="publish-commit-message"
          style={{
            border: "1px solid rgba(230,180,120,.14)",
            borderRadius: 10,
            background: "#0f0b07",
            padding: "11px 13px",
            fontSize: 14,
            lineHeight: 1.4,
          }}
        >
          {review.title}
          <div style={{ fontSize: 12.5, color: "#a99b85", marginTop: 5 }}>
            {review.body}
          </div>
        </div>

        {/* changed files */}
        <div
          data-testid="publish-changes"
          style={{
            marginTop: 12,
            border: "1px solid rgba(230,180,120,.12)",
            borderRadius: 10,
            background: "#0f0b07",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "8px 13px",
              borderBottom: "1px solid rgba(230,180,120,.12)",
              fontFamily: SEMI,
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: ".14em",
              color: "#a99b85",
            }}
          >
            {`CHANGES · ${review.files.length} FILES`}
          </div>
          <div
            style={{
              padding: "6px 13px 10px",
              fontFamily: MONO,
              fontSize: 12,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {review.files.map((f) => (
              <div
                key={f.path}
                data-testid="publish-diff-row"
                data-tone={f.tone}
                style={{ display: "flex", gap: 8 }}
              >
                <span style={{ color: TONE_COLOR[f.tone] }}>{f.status}</span>
                <span style={{ color: "#a99b85" }}>{f.path}</span>
              </div>
            ))}
          </div>
        </div>

        {/* actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <button
            type="button"
            data-testid="publish-cancel"
            onClick={onCancel}
            className={styles.hoverable}
            style={{
              padding: "11px 16px",
              fontWeight: 700,
              fontSize: 14,
              color: "#a99b85",
              background: "transparent",
              border: "none",
            }}
          >
            {"Cancel"}
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            data-testid="publish-confirm"
            onClick={onConfirm}
            className={styles.hoverable}
            style={{
              padding: "11px 22px",
              borderRadius: 11,
              fontWeight: 700,
              fontSize: 14,
              color: "#fff",
              border: "1px solid #e69a5a",
              background: "linear-gradient(150deg,#d4a24c,#c0392b 55%,#6d3b26)",
              boxShadow: "inset 0 1px 0 rgba(255,235,205,.4),0 6px 16px rgba(192,57,43,.32)",
            }}
          >
            {publishLabel(versionBranch)}
          </button>
        </div>
      </div>
    </div>
  );
}

function PublishedStep({
  publishedTag,
  nextBranch,
  onClose,
  onRender,
}: {
  publishedTag: string;
  nextBranch: string;
  onClose: () => void;
  onRender: () => void;
}) {
  return (
    <div data-testid="publish-published-card">
      <div style={{ height: 6, background: "linear-gradient(90deg,#d4a24c,#c0392b)" }} />
      <div style={{ position: "relative", padding: "28px 26px", textAlign: "center" }}>
        <button
          type="button"
          data-testid="publish-close"
          aria-label="Close"
          onClick={onClose}
          className={styles.hoverable}
          style={{
            position: "absolute",
            top: 12,
            right: 14,
            width: 28,
            height: 28,
            borderRadius: 7,
            border: "1px solid rgba(230,180,120,.18)",
            background: "transparent",
            color: "#a99b85",
            display: "grid",
            placeItems: "center",
          }}
        >
          {"✕"}
        </button>
        <div
          style={{
            width: 70,
            height: 70,
            margin: "0 auto",
            borderRadius: "50%",
            background: "rgba(47,143,78,.14)",
            border: "2px solid #2f8f4e",
            display: "grid",
            placeItems: "center",
            color: "#2f8f4e",
            fontSize: 34,
          }}
        >
          {"✓"}
        </div>
        <div style={{ fontFamily: ANTON, fontSize: 28, lineHeight: 1.02, marginTop: 18 }}>
          {`${publishedTag} PUBLISHED.`}
        </div>
        <div
          style={{
            fontFamily: ZILLA,
            fontSize: 14,
            lineHeight: 1.5,
            color: "#a99b85",
            marginTop: 10,
            maxWidth: 360,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {"Merged to "}
          <b style={{ color: "#f1e7d6" }}>{"main"}</b>
          {" and tagged. You're now editing on "}
          <b style={{ color: "#f1e7d6", fontFamily: MONO }}>{nextBranch}</b>
          {"."}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button
            type="button"
            data-testid="publish-view-github"
            onClick={() => {}}
            className={styles.hoverable}
            style={{
              flex: 1,
              padding: 12,
              border: "1px solid rgba(230,180,120,.24)",
              borderRadius: 11,
              fontWeight: 700,
              fontSize: 14,
              color: "#f1e7d6",
              background: "transparent",
            }}
          >
            {"View on GitHub ↗"}
          </button>
          <button
            type="button"
            data-testid="publish-render-share"
            onClick={onRender}
            className={styles.hoverable}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 11,
              fontWeight: 700,
              fontSize: 14,
              color: "#fff",
              border: "1px solid #e69a5a",
              background: "linear-gradient(150deg,#d4a24c,#c0392b 55%,#6d3b26)",
              boxShadow: "0 6px 16px rgba(192,57,43,.3)",
            }}
          >
            {"Render & share ▸"}
          </button>
        </div>
      </div>
    </div>
  );
}
