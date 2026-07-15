/**
 * The tiny translucent "HOLY / BIBLE" tile that sits inside the YouVersion
 * sign-in / sign-out pills. Presentational Server Component; text scales with
 * `size`. Decorative (aria-hidden) — the pill's own label carries the meaning.
 */
export default function HolyBibleGlyph({ size = 28 }: { size?: number }) {
  const fontSize = size * 0.196;

  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        background: "rgba(255,255,255,.14)",
        border: "1px solid rgba(255,255,255,.35)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        flex: "none",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-zilla)",
          fontWeight: 700,
          fontSize,
          lineHeight: 1,
          color: "#fff",
        }}
      >
        HOLY
      </span>
      <span
        style={{
          fontFamily: "var(--font-zilla)",
          fontWeight: 700,
          fontSize,
          lineHeight: 1,
          color: "#fff",
        }}
      >
        BIBLE
      </span>
    </span>
  );
}
