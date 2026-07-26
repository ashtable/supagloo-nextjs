"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The search control: Turn 15 draws a collapsed `🔍 Search` pill; the EXPANDED input is
 * invented (the design has no open state — flagged for the `/design` pass).
 *
 * Controlled by the browser, which debounces the value into the query state: a keystroke
 * must not become a request, but a search must not need a submit either.
 */
export default function GallerySearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        data-testid="gallery-search-toggle"
        onClick={() => setOpen(true)}
        className="flex items-center cursor-pointer"
        style={{
          gap: 7,
          padding: "8px 15px",
          borderRadius: 10,
          border: "1px solid var(--sg-line2)",
          background: "var(--sg-panel)",
          fontWeight: 600,
          fontSize: 12.5,
          color: "var(--sg-dim)",
          whiteSpace: "nowrap",
        }}
      >
        {"🔍 Search"}
      </button>
    );
  }

  return (
    <div
      className="flex items-center"
      style={{
        gap: 7,
        padding: "0 12px",
        borderRadius: 10,
        border: "1px solid var(--sg-line2)",
        background: "var(--sg-panel)",
      }}
    >
      <span aria-hidden style={{ fontSize: 12 }}>
        {"🔍"}
      </span>
      <input
        ref={inputRef}
        data-testid="gallery-search-input"
        type="search"
        value={value}
        aria-label="Search the gallery"
        placeholder="Title, description, reference"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          onChange("");
          setOpen(false);
        }}
        style={{
          width: 230,
          padding: "8px 0",
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: "var(--font-barlow)",
          fontWeight: 600,
          fontSize: 12.5,
          color: "var(--sg-fg)",
        }}
      />
    </div>
  );
}
