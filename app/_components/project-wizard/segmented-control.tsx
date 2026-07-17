"use client";

/**
 * Generic 2-segment tab pill (the "Create new repo" / "Use existing empty repo"
 * tabs). Active segment gets a raised chip + border; inactive is text-only dim.
 * `aria-pressed` marks the active segment (the E2E reads it).
 */
export default function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: {
  segments: readonly { value: T; label: string; testId: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: 4,
        border: "1px solid var(--sg-line2)",
        borderRadius: 11,
        background: "var(--sg-panel)",
      }}
    >
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <button
            key={s.value}
            type="button"
            data-testid={s.testId}
            aria-pressed={active}
            onClick={() => onChange(s.value)}
            className="cursor-pointer"
            style={{
              flex: 1,
              textAlign: "center",
              padding: 9,
              borderRadius: 8,
              border: active
                ? "1px solid var(--sg-line2)"
                : "1px solid transparent",
              background: active ? "var(--sg-bg)" : "transparent",
              fontWeight: 700,
              fontSize: 13,
              color: active ? "var(--sg-fg)" : "var(--sg-dim)",
              fontFamily: "var(--font-barlow), sans-serif",
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
