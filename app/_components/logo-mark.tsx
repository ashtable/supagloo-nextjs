/**
 * The Supagloo brand mark: a gradient rounded square with a white cross/open-book
 * glyph. Presentational Server Component. Inner glyph scales with `size` so the
 * same mark serves the 34px nav and the 22px footer.
 */
export default function LogoMark({ size = 34 }: { size?: number }) {
  const radius = size * 0.265;
  const glyphW = size * 0.47;
  const glyphH = size * 0.5;
  const vBarW = size * 0.12;
  const hBarW = size * 0.35;
  const barH = size * 0.12;
  const barRadius = Math.max(0.5, size * 0.03);

  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundImage: "var(--sg-grad)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,.35), 0 2px 7px rgba(0,0,0,.28)",
        display: "grid",
        placeItems: "center",
        flex: "none",
      }}
    >
      <div style={{ width: glyphW, height: glyphH, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: (glyphW - vBarW) / 2,
            top: 0,
            width: vBarW,
            height: glyphH,
            background: "#fff",
            borderRadius: barRadius,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: glyphH * 0.18,
            left: (glyphW - hBarW) / 2,
            width: hBarW,
            height: barH,
            background: "#fff",
            borderRadius: barRadius,
          }}
        />
      </div>
    </div>
  );
}
