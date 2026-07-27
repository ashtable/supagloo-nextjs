"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../modal";
import { fetchMyProjects, fetchMyRenders, publishRenderToGallery } from "@/lib/gallery/gallery-data";
import { fetchManifest, fetchVersions } from "@/lib/studio/studio-data";
import {
  OTHER_TRANSLATION,
  buildProjectOptions,
  canSubmitPublish,
  manifestPrefill,
  translationOptions,
  type PublishProjectOption,
} from "@/lib/gallery/publish-options";
import type { GalleryItemDto, ProjectVersionDto } from "@/lib/api/contracts";

/**
 * Turn 16b — THE publish-to-gallery dialog (Step 4 §2; plan slice C8).
 *
 * ONE dialog, replacing TWO placeholders: `share-yours-dialog.tsx` (which apologised and
 * sent you to another page) and `your-videos-list.tsx`'s inline `PublishDialog`. The
 * PROJECT picker is precisely what removes that indirection — you can now publish from
 * the gallery header without first going somewhere else to pick a render.
 *
 * ── THE `key=` IS THE RESET, AND IT MOVED HERE ──────────────────────────────────
 * `<PublishBody>` below is keyed on the SELECTED RENDER. That is the same trick the
 * deleted `PublishDialog` used, generalised from "which render did the page open me
 * with" to "which render is chosen right now", because 16b lets the user change that
 * choice inside the dialog.
 *
 * It is not a micro-optimisation. Six `useState` initializers live in that component;
 * without the key they would survive a project switch, and the second render published
 * would carry the FIRST one's `scriptureReference` — the string the server derives
 * `scriptureBook` from AND the string that prints verbatim on a public card. The likely
 * accident is publishing B under A's passage. Keying makes React unmount the old
 * instance, so there is no field anyone can forget to add to a reset list; `"none"` is
 * the closed/unchosen state, which means closing the dialog is itself a reset.
 *
 * ── DIVERGENCES FROM THE DRAWING, EACH DELIBERATE ───────────────────────────────
 *  - **the consent box ships UNCHECKED and gates submit.** The design draws it ticked;
 *    a pre-ticked agreement records an agreement nobody made. The disabled-submit state
 *    is undrawn and is invented here (`canSubmitPublish`).
 *  - **`community guidelines` is bold text, not a link** — there is no such page, and a
 *    link to nothing is worse than no link.
 *  - **`Allow remixes`, `Show my GitHub repo` and `Change cover frame` ship visibly
 *    disabled, each with a tooltip.** None has a backing capability (D7/D9), and 16a
 *    draws no repo link at all. Never a control that silently does nothing — and never a
 *    control silently deleted either, which is why they are present rather than absent.
 *  - **no DESCRIPTION field** (D12 — the design drops it from both screens). The wire
 *    field stays, sent as `""`, exactly as it already defaults.
 *  - **no VISIBILITY control**; `"public"` is hard-coded, as it already was.
 *  - **the cover shows the render's REAL thumbnail** where the design draws art plus a
 *    burned-in caption. The caption is already burned into the frame by the renderer, so
 *    drawing a second one would print it twice.
 *
 * ── THE TERMINUS (invented; §2.6 draws no success and no failure) ───────────────
 * Publish is immediate and synchronous — `POST /v1/renders/:id/gallery` answers 201 with
 * the finished item and it is live at once. There is NO review queue (17b's `PENDING
 * REVIEW` card describes a moderation subsystem that does not exist), so this dialog does
 * not invent a pending state. Success closes and hands the item to `onPublished`; failure
 * keeps the dialog open and prints the api's own words.
 */
export default function PublishToGalleryDialog({
  open,
  initialRenderId = null,
  onClose,
  onPublished,
}: {
  open: boolean;
  /** Preselect this render — how "Your videos" opens the same dialog on one row. */
  initialRenderId?: string | null;
  onClose: () => void;
  onPublished: (item: GalleryItemDto) => void;
}) {
  const [options, setOptions] = useState<PublishProjectOption[] | null>(null);
  const [selected, setSelected] = useState<string | null>(initialRenderId);

  // The three reads that make the D8 join, fired once per OPEN. No new API field: the
  // label is composed from endpoints that already exist.
  useEffect(() => {
    if (!open) return;
    let active = true;
    // Starting the join IS the external-system synchronization this effect exists for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptions(null);

    void (async () => {
      const [renders, projectList] = await Promise.all([fetchMyRenders(), fetchMyProjects()]);
      // One `/versions` call per DISTINCT project that owns a completed render — not one
      // per render, which for a project with a dozen renders would be a dozen identical
      // requests for one dropdown label.
      const projectIds = Array.from(new Set(renders.map((r) => r.projectId)));
      const versionLists = await Promise.all(
        projectIds.map(async (id) => [id, (await fetchVersions(id)) ?? []] as const),
      );
      if (!active) return;
      const versions = new Map<string, readonly ProjectVersionDto[]>(versionLists);
      setOptions(buildProjectOptions({ renders, projects: projectList, versions }));
    })();

    return () => {
      active = false;
    };
  }, [open]);

  // Settle on a selection once the options are known. Only ever fills a NULL selection,
  // so it can never overwrite a choice the user has made.
  useEffect(() => {
    if (!options || options.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected((current) => {
      if (current && options.some((o) => o.renderId === current)) return current;
      if (initialRenderId && options.some((o) => o.renderId === initialRenderId)) {
        return initialRenderId;
      }
      return options[0].renderId;
    });
  }, [options, initialRenderId]);

  const chosen = options?.find((o) => o.renderId === selected) ?? null;
  /**
   * The ref the prefill reads at is the chosen RENDER'S OWN version branch, never the
   * project's `currentBranch`. A render is a snapshot of one version; a project that
   * has since moved on describes a different video, and prefilling `PASSAGE` from it
   * would put another passage into the field the public card prints. `null` means "we
   * could not identify the version", and the prefill simply does not run — see
   * `PublishProjectOption.manifestRef`.
   */
  const manifestRef = chosen?.manifestRef ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="SHARE TO GALLERY"
      testId="publish-dialog"
      width={560}
    >
      <PublishBody
        key={selected ?? "none"}
        options={options}
        selected={selected}
        chosen={chosen}
        manifestRef={manifestRef}
        onSelect={setSelected}
        onClose={onClose}
        onPublished={onPublished}
      />
    </Modal>
  );
}

/**
 * Everything below the modal chrome. Mounted under `key={selectedRenderId}`, so a
 * project switch destroys and rebuilds every field in here — see the parent's docblock.
 */
function PublishBody({
  options,
  selected,
  chosen,
  manifestRef,
  onSelect,
  onClose,
  onPublished,
}: {
  options: PublishProjectOption[] | null;
  selected: string | null;
  chosen: PublishProjectOption | null;
  manifestRef: string | null;
  onSelect: (renderId: string) => void;
  onClose: () => void;
  onPublished: (item: GalleryItemDto) => void;
}) {
  const [title, setTitle] = useState("");
  const [passage, setPassage] = useState("");
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION);
  const [usingOther, setUsingOther] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fields the user has typed in. A REF, not state: nothing renders from it, and it has
   * to be readable synchronously by the prefill — a prefill that arrived while a
   * `setState` was still queued would otherwise overwrite something a person had already
   * written, which is the one thing this flag exists to prevent.
   */
  const touched = useRef({ passage: false, translation: false });
  const [manifestTranslation, setManifestTranslation] = useState<string | null>(null);

  /**
   * The manifest prefill — NON-BLOCKING, on purpose.
   *
   * It is a GitHub round-trip through the api. Blocking the dialog on it would put an
   * egress in front of every open, on top of the one publish already makes to snapshot
   * the "how it was made" section. So the dialog is fully usable before this resolves,
   * it never gates submit, and a failure (no GitHub connection, a repo we cannot read)
   * is simply no prefill.
   */
  useEffect(() => {
    if (!chosen || !manifestRef) return;
    let active = true;
    void (async () => {
      const result = await fetchManifest(chosen.projectId, manifestRef);
      if (!active || !result.ok) return;
      const prefill = manifestPrefill(result.manifest);
      if (prefill.translation) setManifestTranslation(prefill.translation);
      if (!touched.current.passage && prefill.passage) setPassage(prefill.passage);
      if (!touched.current.translation && prefill.translation) {
        setTranslation(prefill.translation);
      }
    })();
    return () => {
      active = false;
    };
  }, [chosen, manifestRef]);

  const translations = useMemo(
    () =>
      translationOptions({
        current: usingOther ? null : translation,
        manifest: manifestTranslation,
      }),
    [usingOther, translation, manifestTranslation],
  );

  const ready = canSubmitPublish({
    renderId: selected,
    title,
    passage,
    translation,
    consent,
    busy,
  });

  const submit = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const outcome = await publishRenderToGallery(selected, {
      title: title.trim(),
      // D12: no input, but the wire field stays — it already defaults to "".
      description: "",
      scriptureReference: passage.trim(),
      translation: translation.trim(),
      // The design draws no visibility control, and neither did the screen this
      // replaces. `unlisted` stays unreachable from the publish side.
      visibility: "public",
    });
    setBusy(false);
    if (!outcome.ok) {
      // The api's own sentence. `already_published` and `scripture_book_underivable`
      // have completely different fixes, and only the api knows which happened.
      setError(outcome.message);
      return;
    }
    onPublished(outcome.item);
  }, [selected, title, passage, translation, onPublished]);

  return (
    <div style={{ padding: "24px 26px 26px" }}>
      <div className="flex flex-col sm:flex-row" style={{ gap: 18 }}>
        <CoverColumn option={chosen} />

        <div className="flex flex-col" style={{ flex: 1, minWidth: 0, gap: 14 }}>
          <FieldShell label="PROJECT">
            <select
              data-testid="publish-project"
              value={selected ?? ""}
              disabled={!options || options.length === 0}
              onChange={(e) => onSelect(e.target.value)}
              className="cursor-pointer"
              style={{ ...BOX, fontSize: 13.5, fontWeight: 600 }}
            >
              {options === null && <option value="">{"Loading your videos…"}</option>}
              {options?.length === 0 && (
                <option value="">{"No finished videos yet"}</option>
              )}
              {options?.map((option) => (
                <option key={option.renderId} value={option.renderId}>
                  {option.label}
                </option>
              ))}
            </select>
          </FieldShell>

          <FieldShell label="TITLE">
            <input
              data-testid="publish-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The Lord Is My Shepherd"
              style={{ ...BOX, fontSize: 14, fontWeight: 600 }}
            />
          </FieldShell>

          <div className="flex" style={{ gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <FieldShell label="PASSAGE">
                <input
                  data-testid="publish-passage"
                  value={passage}
                  onChange={(e) => {
                    setPassage(e.target.value);
                    touched.current.passage = true;
                  }}
                  placeholder="Psalm 23:1–6"
                  style={{ ...BOX, fontSize: 13.5 }}
                />
              </FieldShell>
            </div>
            <div style={{ width: 120, flex: "none" }}>
              <FieldShell label="TRANSLATION">
                <select
                  data-testid="publish-translation"
                  value={usingOther ? OTHER_TRANSLATION : translation}
                  onChange={(e) => {
                    touched.current.translation = true;
                    if (e.target.value === OTHER_TRANSLATION) {
                      setUsingOther(true);
                      setTranslation("");
                      return;
                    }
                    setUsingOther(false);
                    setTranslation(e.target.value);
                  }}
                  className="cursor-pointer"
                  style={{ ...BOX, fontSize: 13.5 }}
                >
                  {translations.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </FieldShell>
            </div>
          </div>

          {usingOther && (
            <input
              data-testid="publish-translation-other"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              placeholder="Abbreviation, e.g. NRSVUE"
              aria-label="Translation abbreviation"
              style={{ ...BOX, fontSize: 13.5 }}
            />
          )}
        </div>
      </div>

      {/* ── permission toggles (§2.3). Both drawn OFF; both inert, for now. ── */}
      <div className="flex flex-col" style={{ marginTop: 18, gap: 10 }}>
        <ToggleRow
          testId="publish-toggle-remixes"
          label="Allow remixes"
          sublabel="Coming soon"
          title="Remixing isn't built yet"
          dim
        />
        <ToggleRow
          testId="publish-toggle-repo"
          label="Show my GitHub repo"
          sublabel="Link your repo on the watch page"
          title="The watch page doesn't show repo links yet"
        />
      </div>

      {/* ── consent (§2.4) — unchecked, and it gates ── */}
      <label
        data-testid="publish-consent-row"
        className="flex cursor-pointer"
        style={{
          marginTop: 14,
          alignItems: "flex-start",
          gap: 9,
          padding: "12px 14px",
          border: "1px solid var(--sg-line)",
          borderRadius: 10,
          background: "var(--sg-panel)",
          fontSize: 12,
          color: "var(--sg-dim)",
          lineHeight: 1.5,
        }}
      >
        {/* A REAL checkbox, restyled — not a hidden input behind a div. It keeps the
            native focus ring, the native keyboard toggle and the accessible role; the
            ✓ rides on top of it, inert to pointer events. */}
        <span
          style={{
            position: "relative",
            width: 16,
            height: 16,
            flex: "none",
            marginTop: 1,
            display: "inline-block",
          }}
        >
          <input
            type="checkbox"
            data-testid="publish-consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="cursor-pointer"
            style={{
              appearance: "none",
              width: 16,
              height: 16,
              margin: 0,
              borderRadius: 4,
              border: consent ? "none" : "1px solid var(--sg-line2)",
              background: consent ? "var(--sg-red)" : "transparent",
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              fontSize: 10,
              lineHeight: 1,
              color: "#fff",
              pointerEvents: "none",
            }}
          >
            {consent ? "✓" : ""}
          </span>
        </span>
        <span>
          {"I confirm this video follows the "}
          {/* NOT a link: there is no community-guidelines page to point at. */}
          <b style={{ color: "var(--sg-fg)" }}>{"community guidelines"}</b>
          {/* R-U8: §2.4 bolds `community guidelines` and NOTHING else. Two emphases
              in one sentence is no emphasis — and the second one was ours, not the
              design's. */}
          {" and that I hold the rights to any material I added."}
        </span>
      </label>

      {error && (
        <p
          data-testid="publish-error"
          style={{ marginTop: 12, fontSize: 12.5, color: "var(--sg-red)" }}
        >
          {error}
        </p>
      )}

      {/* ── action row (§2.5) ── */}
      <div className="flex items-center" style={{ gap: 10, marginTop: 20 }}>
        <button
          type="button"
          data-testid="publish-cancel"
          onClick={onClose}
          className="cursor-pointer"
          style={{
            padding: "12px 16px",
            border: "none",
            background: "transparent",
            fontWeight: 700,
            fontSize: 14,
            color: "var(--sg-dim)",
          }}
        >
          {"Cancel"}
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          data-testid="publish-submit"
          disabled={!ready}
          onClick={() => void submit()}
          className="cursor-pointer"
          style={{
            padding: "13px 24px",
            borderRadius: 11,
            border: "none",
            background: "linear-gradient(150deg,#d4a24c,#c0392b 55%,#6d3b26)",
            boxShadow:
              "inset 0 1px 0 rgba(255,235,205,.4), 0 8px 20px rgba(192,57,43,.32)",
            fontWeight: 700,
            fontSize: 14.5,
            color: "#fff",
            opacity: ready ? 1 : 0.5,
          }}
        >
          {/* One vocabulary through the whole flow: the button that says Publish
              produces an item that is published. */}
          {busy ? "Publishing…" : "Publish to gallery ▸"}
        </button>
      </div>
    </div>
  );
}

/** The 118px cover column (§2.2 left). Real frame where we have one. */
function CoverColumn({ option }: { option: PublishProjectOption | null }) {
  /** The signed url TOGETHER WITH the key it was signed for. Carrying the key means a
   *  stale url is filtered out at render time instead of needing an effect to clear it —
   *  the cover can never show the previous render's frame for a frame or two. */
  const [signed, setSigned] = useState<{ key: string; url: string } | null>(null);
  const key = option?.thumbnailAssetKey ?? null;
  const url = signed && signed.key === key ? signed.url : null;

  useEffect(() => {
    if (!key) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/files/presign-download?key=${encodeURIComponent(key)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const body: unknown = await res.json().catch(() => null);
        const value =
          body && typeof body === "object" && typeof (body as { url?: unknown }).url === "string"
            ? (body as { url: string }).url
            : null;
        if (active && value) setSigned({ key, url: value });
      } catch {
        /* a cover we cannot sign falls back to the poster gradient — never an error */
      }
    })();
    return () => {
      active = false;
    };
  }, [key]);

  return (
    <div style={{ width: 118, flex: "none" }}>
      <div
        data-testid="publish-cover"
        style={{
          aspectRatio: "9 / 16",
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid var(--sg-line2)",
          background: url
            ? `center/cover no-repeat url("${url}")`
            : "radial-gradient(circle at 46% 40%,#3a5a7a,#1e3350 45%,#0a1220 92%)",
        }}
      />
      {/* Visibly disabled rather than absent: the design draws the affordance, and
          silently deleting a drawn control is its own kind of lie. There is no
          frame-selection endpoint — `thumbnailAssetKey` is server-recomputed and
          explicitly never client-supplied (D9). */}
      <div
        data-testid="publish-cover-change"
        role="button"
        aria-disabled="true"
        data-disabled="true"
        title="Cover frames are picked by the renderer"
        style={{
          marginTop: 8,
          textAlign: "center",
          fontSize: 11,
          color: "var(--sg-dim)",
          opacity: 0.45,
          cursor: "not-allowed",
        }}
      >
        {"Change cover frame"}
      </div>
    </div>
  );
}

/** A permission row (§2.3). Inert by construction — there is no `onClick` to forget to
 *  remove, and no native `disabled`, so an E2E click lands and provably does nothing. */
function ToggleRow({
  testId,
  label,
  sublabel,
  title,
  dim = false,
}: {
  testId: string;
  label: string;
  sublabel: string;
  title: string;
  dim?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      role="switch"
      aria-checked="false"
      aria-disabled="true"
      data-disabled="true"
      title={title}
      className="flex items-center"
      style={{
        justifyContent: "space-between",
        padding: "13px 15px",
        border: "1px solid var(--sg-line)",
        borderRadius: 11,
        background: "var(--sg-panel)",
        opacity: dim ? 0.45 : 0.6,
        cursor: "not-allowed",
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: "var(--sg-dim)", marginTop: 1 }}>
          {sublabel}
        </div>
      </div>
      <span
        aria-hidden
        style={{
          width: 40,
          height: 23,
          borderRadius: 20,
          background: "var(--sg-line2)",
          position: "relative",
          flex: "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            width: 19,
            height: 19,
            borderRadius: "50%",
            background: "var(--sg-bg)",
          }}
        />
      </span>
    </div>
  );
}

/** The house field recipe (§2.2): uppercase dim label over a 42px box. */
function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col">
      <span
        style={{
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: ".06em",
          color: "var(--sg-dim)",
          marginBottom: 5,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const BOX = {
  height: 42,
  width: "100%",
  border: "1px solid var(--sg-line2)",
  borderRadius: 9,
  background: "var(--sg-panel)",
  padding: "0 12px",
  color: "var(--sg-fg)",
  fontFamily: "var(--font-barlow)",
  outline: "none",
} as const;

/** The design draws `KJV` in the field. It is a DEFAULT, never a restriction — the
 *  select always carries an `Other…` escape (memory `kjv-bsb-generation-only`). */
const DEFAULT_TRANSLATION = "KJV";
