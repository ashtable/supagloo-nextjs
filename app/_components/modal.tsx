"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The shared modal primitive (plan D-MODAL) — none existed in the repo before
 * Turn 10/11. Portal to `document.body`, a dimmed backdrop, a centered
 * `role="dialog"` panel, a focus trap + focus restore, and Escape/backdrop
 * dismissal — the a11y discipline lifted from `nav-auth.tsx`'s dropdown.
 *
 * `dismissible` gates Escape/backdrop-click/✕: true for the standalone 11b/11c
 * connect modals, false for the first-time wizard overlay (11a) — you complete
 * it or the GitHub gate holds, there's no dismissing it.
 *
 * When `title` is given, this renders the 56px "CONNECT ACCOUNT"-style header
 * chrome (+ the ✕ close button, only when dismissible) — that's modal chrome,
 * shared by every standalone connect modal. The wizard passes no `title`; its
 * own 6px progress bar is wizard-specific chrome rendered by its children.
 */
export default function Modal({
  open,
  onClose,
  dismissible = true,
  title,
  ariaLabel,
  testId,
  width = 520,
  children,
}: {
  open: boolean;
  onClose: () => void;
  dismissible?: boolean;
  title?: string;
  ariaLabel?: string;
  testId: string;
  width?: number;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = `${testId}-title`;

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dismissible) onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ??
          [],
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      data-testid="modal-backdrop"
      onClick={() => dismissible && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 100,
      }}
    >
      <div
        ref={panelRef}
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : (ariaLabel ?? "Dialog")}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: "100%",
          background: "var(--sg-bg)",
          color: "var(--sg-fg)",
          borderRadius: 18,
          border: "1px solid var(--sg-line2)",
          boxShadow: "0 30px 70px rgba(0,0,0,.4)",
          overflow: "hidden",
          fontFamily: "var(--font-barlow)",
          outline: "none",
        }}
      >
        {title && (
          <div
            style={{
              height: 56,
              display: "flex",
              alignItems: "center",
              padding: "0 22px 0 26px",
              borderBottom: "1px solid var(--sg-line)",
            }}
          >
            <span
              id={titleId}
              style={{
                fontFamily: "var(--font-barlow-semi)",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: ".14em",
                color: "var(--sg-dim)",
              }}
            >
              {title}
            </span>
            <div style={{ flex: 1 }} />
            {dismissible && (
              <button
                type="button"
                data-testid="modal-close"
                aria-label="Close"
                onClick={onClose}
                className="cursor-pointer"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "1px solid var(--sg-line2)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--sg-dim)",
                  background: "transparent",
                }}
              >
                {"✕"}
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
