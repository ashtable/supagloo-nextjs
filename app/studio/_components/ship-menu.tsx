"use client";

import styles from "../studio.module.css";

const SEMI = "var(--font-barlow-semi), 'Barlow Semi Condensed', sans-serif";

function CheckRow({
  testid,
  checked,
  label,
  sublabel,
  title,
  disabled,
  onToggle,
}: {
  testid?: string;
  checked: boolean;
  label: string;
  sublabel?: string;
  title?: string;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      data-checked={checked ? "true" : "false"}
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      title={title}
      onClick={onToggle}
      className={disabled ? undefined : styles.hoverable}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 11,
        background: "none",
        border: "none",
        padding: 0,
        textAlign: "left",
        color: "#f1e7d6",
        // 16b's `Allow remixes` recipe (whole row dimmed) + 16a's `cursor:not-allowed`.
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        aria-hidden
        style={{
          // 5a geometry, kept so the row matches the popover it lives in.
          width: 18,
          height: 18,
          flex: "none",
          marginTop: 1,
          borderRadius: 5,
          display: "grid",
          placeItems: "center",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          background: checked ? "#c6552b" : "transparent",
          border: checked ? "none" : "1.5px solid rgba(230,180,120,.35)",
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span>
        <span style={{ display: "block", fontWeight: 600, fontSize: 13.5 }}>{label}</span>
        {sublabel ? (
          <span style={{ display: "block", fontSize: 11.5, color: "#a99b85", marginTop: 2 }}>
            {sublabel}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** The three platform chips. All disabled: nothing in this system posts to a social
 *  platform, and plan row 71's honesty rule says a control with no backing capability
 *  ships **visibly disabled with a tooltip — never invisible, never a silent no-op**.
 *  The `✓` that used to sit inside each label is dropped, because a tick on a dead
 *  control reads as "selected". */
function PlatformChip({ testid, label }: { testid: string; label: string }) {
  return (
    <button
      type="button"
      data-testid={testid}
      disabled
      aria-disabled
      title="Posting to social platforms isn't wired up yet."
      style={{
        padding: "6px 12px",
        borderRadius: 20,
        fontWeight: 600,
        fontSize: 12,
        border: "1px solid rgba(230,180,120,.24)",
        background: "transparent",
        color: "#a99b85",
        opacity: 0.5,
        cursor: "not-allowed",
      }}
    >
      {label}
    </button>
  );
}

/**
 * The SHARE popover (opened by `Share ▸` in the top bar) — task items 3, 4 and 5.
 *
 * ── Where this surface came from, and why it is being pruned ─────────────────────────
 * `SHIP IT`, the platform chips and the "Make this a daily recurring post" block are
 * Turn-5 "Wilderness Studio" artefacts: a design direction superseded by Turn 7's brand
 * skin. Turns 7-17 never re-introduce scheduling, auto-posting or social distribution
 * anywhere — the current design's whole sharing story is 15a → 16b → 16a — and no
 * scheduler exists at any layer of the system. So item 4's deletion CONVERGES on the live
 * design rather than departing from it, and item 3 disables what is left instead of
 * hiding it.
 *
 * The `SHIP IT` title was Anton 19px, unique in the whole design document; every other
 * popover and panel in the current skin (`REGENERATE`, `COMPOSITION`, `VERSIONS`,
 * `SCENE NN · INSPECTOR`) uses a Barlow Semi Condensed eyebrow. `SHARE` adopts that.
 *
 * ── The gallery row (item 5 / USER DECISION D2) ──────────────────────────────────────
 * Ships DISABLED and UNCHECKED. The item text justified a checked box with "we
 * immediately share all videos today", and that premise is false:
 * `POST /v1/renders/:id/gallery` is opt-in and owner-only, and 16b gates it behind a
 * consent checkbox that deliberately ships unchecked. A pre-ticked box here would assert
 * a behaviour the system does not have — and it is not wired to the publish endpoint.
 *
 * Still a popover, not a `<Modal>`; dismissal is the document listener in `StudioFrame`,
 * which skips `[data-menu-panel]` / `[data-menu-trigger]`.
 */
export default function ShipMenu() {
  return (
    <div
      data-testid="ship-menu"
      data-menu-panel
      role="menu"
      aria-label="Share"
      style={{
        position: "absolute",
        top: 88,
        right: 30,
        zIndex: 31,
        width: 340,
        background: "#1b140d",
        border: "1px solid rgba(230,180,120,.18)",
        borderRadius: 14,
        boxShadow: "0 20px 50px rgba(0,0,0,.4)",
        padding: 18,
        color: "#f1e7d6",
      }}
    >
      <div
        style={{
          fontFamily: SEMI,
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: ".2em",
          color: "#e6a43b",
          marginBottom: 14,
        }}
      >
        {"SHARE"}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <PlatformChip testid="share-tiktok" label="TikTok" />
        <PlatformChip testid="share-yt-shorts" label="YT Shorts" />
        <PlatformChip testid="share-add-platform" label="＋ add" />
      </div>
      <div style={{ fontSize: 11.5, color: "#8a7358", marginBottom: 16 }}>
        {"Coming soon"}
      </div>

      <div
        style={{
          borderTop: "1px solid rgba(230,180,120,.14)",
          paddingTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 11,
        }}
      >
        <CheckRow
          testid="share-gallery"
          checked={false}
          disabled
          label="Share to the gallery"
          sublabel="Coming soon — publish from Your videos"
          title="Gallery publishing is done per video from Your videos, not from here."
        />
      </div>
    </div>
  );
}
