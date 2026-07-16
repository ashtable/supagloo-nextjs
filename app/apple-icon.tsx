import { ImageResponse } from "next/og";

// Next 16 app-icon file convention: this route generates the apple-touch-icon
// (iOS home-screen), emitting `<link rel="apple-touch-icon" href="/apple-icon?…">`.
// See node_modules/next/dist/docs/.../metadata/app-icons.md. 180×180 is the
// canonical apple-touch size. Full-bleed (no rounding) because iOS masks/rounds
// the icon itself — this avoids white corners while staying the crisp brand mark.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The Supagloo mark reproduced from app/icon.svg (the design project's favicon),
// scaled 512 → 180 (×0.3516): gradient rounded-square + white cross.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background:
            "linear-gradient(135deg, #d4a24c 0%, #c0392b 55%, #6d3b26 100%)",
        }}
      >
        {/* vertical bar of the cross */}
        <div
          style={{
            position: "absolute",
            left: 80,
            top: 36,
            width: 21,
            height: 94,
            borderRadius: 4,
            background: "#fff",
          }}
        />
        {/* horizontal bar of the cross */}
        <div
          style={{
            position: "absolute",
            left: 59,
            top: 56,
            width: 61,
            height: 21,
            borderRadius: 4,
            background: "#fff",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
