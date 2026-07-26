"use client";

/**
 * Turn 15's gallery header: eyebrow, Anton headline, Zilla lede, and the
 * `＋ Share yours` CTA.
 *
 * A client component only because of the CTA's `onClick` — Next still server-renders
 * its HTML, so the copy is in the first byte for crawlers and first paint (D14: only
 * the GRID is mount-gated).
 *
 * Every string is a single JSX literal so an E2E `textContent` anchor matches verbatim
 * (the fullwidth plus is U+FF0B).
 */
export default function GalleryHeader({
  onShareYours,
}: {
  onShareYours: () => void;
}) {
  return (
    <header
      data-testid="gallery-header"
      className="flex flex-col md:flex-row md:items-end px-4 sm:px-[34px]"
      style={{ gap: 18, paddingTop: 46, paddingBottom: 26 }}
    >
      <div style={{ maxWidth: 640 }}>
        <div
          style={{
            fontFamily: "var(--font-barlow-semi)",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: ".26em",
            color: "var(--sg-dim)",
            marginBottom: 14,
          }}
        >
          {"COMMUNITY GALLERY"}
        </div>
        <h1
          style={{
            fontFamily: "var(--font-anton)",
            fontSize: "clamp(2rem, 6vw, 46px)",
            lineHeight: 0.98,
            letterSpacing: ".005em",
          }}
        >
          {"SCRIPTURE, SHARED."}
        </h1>
        <p
          style={{
            fontFamily: "var(--font-zilla)",
            fontSize: 17,
            lineHeight: 1.55,
            color: "var(--sg-dim)",
            marginTop: 16,
          }}
        >
          {"Every video here started as a verse. Watch what the community has made, upvote what moves you, and publish your own."}
        </p>
      </div>

      <div className="hidden md:block" style={{ flex: 1 }} />

      <button
        type="button"
        data-testid="gallery-share-yours"
        onClick={onShareYours}
        className="flex items-center justify-center cursor-pointer"
        style={{
          gap: 9,
          padding: "13px 22px",
          borderRadius: 13,
          backgroundImage: "var(--sg-grad)",
          boxShadow:
            "inset 0 1px 0 rgba(255,235,205,.4), 0 10px 24px rgba(192,57,43,.34)",
          fontWeight: 700,
          fontSize: 15,
          color: "#fff",
          border: "none",
          whiteSpace: "nowrap",
        }}
      >
        {"＋ Share yours"}
      </button>
    </header>
  );
}
