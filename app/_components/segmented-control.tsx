"use client";

/**
 * The shared segmented control (Row 41 — MOVED here from `project-wizard/` so the
 * gallery's sort control and the new-project wizard's repo tabs are one component
 * rather than two that drift). Top-level like `modal.tsx` / `profile-menu.tsx`.
 *
 * Active segment gets a raised chip + border; inactive is text-only dim.
 * `aria-pressed` marks the active segment — the E2E reads it, in both suites.
 *
 * It was already generic over `T extends string` and an arbitrary-length `segments`
 * array, so the gallery's three segments work unchanged. The ONLY difference between
 * the two call sites is container density (Turn 15 draws `gap:3 / padding:3` where the
 * wizard uses `8 / 4`), which is a `dense` prop rather than a fork.
 */
export default function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  dense = false,
  testId,
}: {
  segments: readonly { value: T; label: string; testId: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Turn 15's tighter metrics: a control sitting in a filter row, not a form. */
  dense?: boolean;
  /** Optional testid on the container (the filter row asserts against it). */
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        display: "flex",
        gap: dense ? 3 : 8,
        padding: dense ? 3 : 4,
        border: "1px solid var(--sg-line2)",
        borderRadius: dense ? 10 : 11,
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
              flex: dense ? "none" : 1,
              textAlign: "center",
              padding: dense ? "7px 13px" : 9,
              borderRadius: dense ? 7 : 8,
              border: active
                ? "1px solid var(--sg-line2)"
                : "1px solid transparent",
              background: active ? "var(--sg-bg)" : "transparent",
              fontWeight: 700,
              fontSize: dense ? 12.5 : 13,
              color: active ? "var(--sg-fg)" : "var(--sg-dim)",
              fontFamily: "var(--font-barlow), sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
