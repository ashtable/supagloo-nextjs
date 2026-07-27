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
 *
 * ── THE PANEL IS BOUNDED BY THE VIEWPORT, AND ITS BODY SCROLLS ─────────────
 * Everything below the header lives in its own scroll region, and the panel is
 * capped at the viewport height minus the backdrop's own padding.
 *
 * That is not polish. Without the cap, a panel taller than the viewport simply
 * OVERFLOWS a `position: fixed` backdrop that nothing can scroll — the document
 * behind it is not what is overflowing, so the page scrollbar cannot reach it.
 * Whatever sits at the bottom of the panel is then unreachable on a phone: the
 * 16b publish dialog's entire Publish/Cancel row was off-screen at 375×667,
 * which means the dialog could be filled in and not submitted.
 *
 * Three pieces, each load-bearing:
 *   1. `maxHeight` on the panel, so it can never exceed the backdrop's content
 *      box, and `display: flex` + `flexDirection: column` so the cap is shared
 *      out between a fixed header and an elastic body;
 *   2. `minHeight: 0` on that body — a flex child's default `min-height: auto`
 *      refuses to shrink below its content, which silently defeats the cap;
 *   3. `overflowY: auto` on the BACKDROP plus `margin: auto` (rather than
 *      `alignItems: center`) on the panel. `100vh` is not always the visible
 *      height — mobile browser chrome makes it larger — so the cap alone can
 *      still leave a panel taller than what the viewer can see. A centered flex
 *      item overflows equally in both directions and puts its TOP out of reach;
 *      `margin: auto` centers when there is room and stays reachable when there
 *      is not, with the backdrop's own scroll as the way to it.
 *
 * The header is `flex: none`, so `modal-close` stays put while the body moves.
 * A modal that draws its OWN chrome inside `children` (the two wizards) scrolls
 * that chrome with the content; that is the deliberate trade for one rule here
 * rather than a header slot every consumer has to opt into.
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
        // NOT `alignItems: center` — see the docblock. `margin: auto` on the panel
        // centers it while leaving both edges reachable when it does not fit.
        justifyContent: "center",
        overflowY: "auto",
        overscrollBehavior: "contain",
        padding: BACKDROP_PADDING,
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
          // The cap + the centering, together. `margin: auto` is what replaces the
          // backdrop's old `alignItems: center`.
          maxHeight: `calc(100vh - ${BACKDROP_PADDING * 2}px)`,
          margin: "auto",
          display: "flex",
          flexDirection: "column",
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
              flex: "none",
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
        {/* The scroll region. `minHeight: 0` is what makes the panel's cap bite: a
            flex child defaults to `min-height: auto`, which refuses to shrink below
            its content and would push the action row straight back off-screen. */}
        <div
          data-testid={`${testId}-body`}
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The gutter between the panel and the viewport edge, on every side. Named because
 *  the panel's `maxHeight` has to subtract exactly twice it — a literal in two places
 *  is a literal that drifts. */
const BACKDROP_PADDING = 24;
