"use client";

/**
 * The full-width gradient primary pill shared by every wizard's terminal action
 * ("Create & scaffold →", "Scaffold into this repo →", "Import & verify →",
 * "Open in studio →"). A thin wrapper over the repeated `--sg-grad` button.
 */
export default function WizardCta({
  label,
  testId,
  onClick,
  disabled = false,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer"
      style={{
        display: "block",
        width: "100%",
        marginTop: 22,
        padding: 14,
        borderRadius: 12,
        backgroundImage: "var(--sg-grad)",
        boxShadow:
          "inset 0 1px 0 rgba(255,235,205,.4), 0 8px 20px rgba(192,57,43,.32)",
        color: "#fff",
        fontWeight: 700,
        fontSize: 15,
        border: "none",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
