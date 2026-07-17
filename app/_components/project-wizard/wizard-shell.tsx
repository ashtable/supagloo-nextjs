"use client";

import type { CSSProperties, ReactNode } from "react";
import Modal from "../modal";

/**
 * Shared wizard chrome (D-WIZARD-SPLIT): wraps the `Modal` primitive
 * (`dismissible` — these are user-initiated & cancellable, unlike the 11a gate),
 * renders the 6px progress track + fill and the 52px step-chrome header (eyebrow
 * + its own 28×28 ✕). Passes NO Modal `title` (it draws its own chrome, exactly
 * like `setup-wizard.tsx`). A `tone` of "error" recolors the bar/eyebrow red for
 * the Import failure card; the terminal ready/error cards pass `eyebrow={null}`
 * to drop the step header and set their own centered padding via `contentStyle`.
 */
export default function WizardShell({
  testId,
  eyebrow,
  eyebrowTestId,
  closeTestId,
  progress,
  progressTestId,
  tone = "normal",
  onClose,
  contentStyle,
  children,
}: {
  testId: string;
  eyebrow: string | null;
  eyebrowTestId: string;
  closeTestId: string;
  progress: number;
  progressTestId: string;
  tone?: "normal" | "error";
  onClose: () => void;
  contentStyle?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      dismissible
      ariaLabel={eyebrow ?? "Project wizard"}
      testId={testId}
      width={520}
    >
      <div
        data-testid={progressTestId}
        style={{ height: 6, background: "var(--sg-line)", display: "flex" }}
      >
        <div
          data-testid={`${progressTestId}-fill`}
          style={{
            width: `${progress}%`,
            background:
              tone === "error"
                ? "var(--sg-red)"
                : "linear-gradient(90deg,#d4a24c,#c0392b)",
          }}
        />
      </div>

      {eyebrow !== null && (
        <div
          style={{
            height: 52,
            display: "flex",
            alignItems: "center",
            padding: "0 20px 0 26px",
            borderBottom: "1px solid var(--sg-line)",
          }}
        >
          <span
            data-testid={eyebrowTestId}
            style={{
              fontFamily:
                "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif",
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: ".16em",
              color: tone === "error" ? "var(--sg-red)" : "var(--sg-dim)",
            }}
          >
            {eyebrow}
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            data-testid={closeTestId}
            aria-label="Close"
            onClick={onClose}
            className="cursor-pointer"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "1px solid var(--sg-line2)",
              display: "grid",
              placeItems: "center",
              color: "var(--sg-dim)",
              background: "transparent",
            }}
          >
            {"✕"}
          </button>
        </div>
      )}

      <div style={contentStyle ?? { padding: "26px 28px 28px" }}>{children}</div>
    </Modal>
  );
}
