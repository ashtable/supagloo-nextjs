import { describe, expect, it } from "vitest";

// RED until `lib/studio/version-history.ts` exists (Step 9 → GREEN). The pure
// version-row model behind the 14b version dropdown: derives the working /
// live-on-main / archived / template rows from the current working branch, the
// last-published tag, and the dirty flag. Missing module → clean
// "Cannot find module './version-history'" RED (this repo's convention — the
// value import forces module resolution).
import { versionHistory, type VersionRow } from "./version-history";

describe("versionHistory", () => {
  it("U-VH1: post-publish (working v0.0.3, live v0.0.2) → the drawn 4-row wireframe", () => {
    const rows = versionHistory("v0.0.3", "v0.0.2", false);
    expect(rows).toHaveLength(4);

    const [working, live, archived, template] = rows;

    // working branch — the branch you're editing on
    expect(working.branch).toBe("v0.0.3");
    expect(working.state).toBe("working");
    expect(working.showDot).toBe(false); // dirty=false → no unsaved dot

    // the tag that went live on main
    expect(live.branch).toBe("v0.0.2");
    expect(live.state).toBe("live");

    // the previously-live tag, now archived + restorable
    expect(archived.branch).toBe("v0.0.1");
    expect(archived.state).toBe("archived");
    expect(archived.canRestore).toBe(true);

    // the scaffold template floor
    expect(template.branch).toBe("v0.0.0");
    expect(template.state).toBe("template");

    // every row carries a non-empty display label
    for (const row of rows as VersionRow[]) {
      expect(typeof row.label).toBe("string");
      expect(row.label.length).toBeGreaterThan(0);
    }
  });

  it("U-VH2: a fresh project (nothing published) → only the working + template rows", () => {
    const rows = versionHistory("v0.0.1", null, false);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ branch: "v0.0.1", state: "working" });
    expect(rows[1]).toMatchObject({ branch: "v0.0.0", state: "template" });
    // nothing published yet → no live / archived rows
    expect(rows.some((r) => r.state === "live")).toBe(false);
    expect(rows.some((r) => r.state === "archived")).toBe(false);
  });

  it("U-VH3: showDot follows the dirty flag on the WORKING row only", () => {
    const clean = versionHistory("v0.0.3", "v0.0.2", false);
    expect(clean.find((r) => r.state === "working")!.showDot).toBe(false);

    const dirty = versionHistory("v0.0.3", "v0.0.2", true);
    expect(dirty.find((r) => r.state === "working")!.showDot).toBe(true);
    // no non-working row ever shows the unsaved dot
    expect(
      dirty.filter((r) => r.state !== "working").every((r) => r.showDot === false),
    ).toBe(true);
  });

  it("U-VH4: clamps at v0.0.0 — the archived row collapses when it would equal the template", () => {
    // Publishing the very first working branch lands live v0.0.1; the archived
    // row would be v0.0.0, which IS the template → collapse (no duplicate floor).
    const rows = versionHistory("v0.0.2", "v0.0.1", false);
    expect(rows.map((r) => r.state)).toEqual(["working", "live", "template"]);
    expect(rows.map((r) => r.branch)).toEqual(["v0.0.2", "v0.0.1", "v0.0.0"]);
    // never emits a negative / malformed patch
    expect(rows.every((r) => /^v\d+\.\d+\.\d+$/.test(r.branch))).toBe(true);
  });
});
