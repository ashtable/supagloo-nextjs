import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: every "mounted guard" ref must be re-armed on each effect RUN, not only
 * cleared in the effect's cleanup.
 *
 * ## Why this exists (found by task 62's render lane, the hard way)
 *
 * The idiom is a `useRef(true)` that async continuations check before they touch
 * state, so a response that lands after unmount cannot dispatch into a dead
 * component. The correct shape — already used by
 * `app/studio/_components/studio-context.tsx`, which names it "the task-26
 * `drivePolling` idiom" — sets the ref back to `true` in the effect BODY:
 *
 *     useEffect(() => {
 *       aliveRef.current = true;
 *       return () => { aliveRef.current = false; };
 *     }, []);
 *
 * The broken shape omits the re-arm and only registers the cleanup:
 *
 *     useEffect(() => () => void (aliveRef.current = false), []);   // ← BUG
 *
 * React StrictMode — **on by default in `next dev`** — mounts the component, runs
 * the effect, runs that effect's CLEANUP, then runs the effect again. With a
 * cleanup-only guard the ref is therefore left `false` for the entire life of the
 * component, and every `if (!aliveRef.current) return;` short-circuits forever.
 *
 * ## The failure mode this catches, and why nothing else caught it
 *
 * `new-project-wizard.tsx` and `import-wizard.tsx` both shipped the broken shape.
 * The symptom is maximally deceptive: `POST /api/projects` succeeds, the DBOS
 * git-ops worker really scaffolds a real GitHub repo in ~10s, the ProjectJob row
 * reaches `succeeded` with every stage `done` — and the wizard still sits on step 2
 * forever. It shows **neither** the ready card **nor** an error, because the early
 * return happens before either branch. So the server logs, the database and the
 * GitHub repo all look perfect while the UI is silently dead.
 *
 * That is why plan row 62's `studio-render-real.e2e.ts` had never once executed: it,
 * and every other real-stack spec that acquires a project through the wizard, hung
 * waiting for `project-ready-card` and then timed out pointing at the DBOS worker —
 * which was innocent.
 *
 * A source guard is still the proportionate fence, but the REASON changed on
 * 2026-07-26: unit-level component rendering IS now available (a `.test.tsx` opts into
 * jsdom with a `// @vitest-environment jsdom` docblock — see `gallery-browser.test.tsx`
 * and `support/render.tsx`). What that cannot do is prove the ABSENCE of the broken
 * shape across a growing tree — a rendered test asserts one component behaves, this
 * asserts no component in `app/` carries the idiom without the re-arm, including
 * components not yet written. That is the same reason `e2e-real-github-seam.test.ts`
 * and the root repo's overlay/prefix guards read source rather than behaviour. An e2e
 * reproduction would additionally cost a real GitHub scaffold and a 4-minute timeout.
 */

const APP_DIR = resolve(process.cwd(), "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (abs.endsWith(".tsx") || abs.endsWith(".ts")) out.push(abs);
  }
  return out;
}

/**
 * A ref whose name marks it as a mounted/liveness guard. Narrow on purpose: this
 * guard is about the mounted-guard idiom, not about every ref in the tree.
 */
const GUARD_REF = /\b([A-Za-z0-9_]*(?:alive|mounted))Ref\b/i;

interface Offender {
  file: string;
  line: number;
  ref: string;
  text: string;
}

/**
 * Find files that clear a guard ref in a cleanup but never re-arm it. The re-arm
 * check is deliberately whole-file rather than per-effect: any `<ref>.current = true`
 * assignment outside the declaration proves the author thought about re-arming, and
 * a false negative here is far better than a guard nobody can satisfy.
 */
function findOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const abs of walk(APP_DIR)) {
    const src = readFileSync(abs, "utf8");
    const lines = src.split("\n");
    lines.forEach((text, i) => {
      const clears = /\b([A-Za-z0-9_]+)\.current\s*=\s*false\b/.exec(text);
      if (!clears) return;
      const ref = clears[1];
      if (!GUARD_REF.test(ref)) return;
      // Re-armed anywhere in the file (excluding the `useRef(true)` declaration)?
      const rearmed = new RegExp(
        `\\b${ref}\\.current\\s*=\\s*true\\b`,
      ).test(src);
      if (!rearmed) {
        offenders.push({
          file: relative(process.cwd(), abs),
          line: i + 1,
          ref,
          text: text.trim(),
        });
      }
    });
  }
  return offenders;
}

describe("mounted-guard refs survive React StrictMode's double effect invocation", () => {
  it("re-arms every guard ref it clears (never cleanup-only)", () => {
    const offenders = findOffenders();
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These mounted-guard refs are cleared but never set back to true, so ` +
            `next dev's StrictMode leaves them false for the component's whole life ` +
            `and every guarded async continuation silently no-ops:\n` +
            offenders
              .map((o) => `  • ${o.file}:${o.line} (${o.ref}) — ${o.text}`)
              .join("\n") +
            `\nFix: set the ref to true in the effect BODY and clear it in the ` +
            `returned cleanup, as app/studio/_components/studio-context.tsx does.`,
    ).toEqual([]);
  });

  it("actually inspects the two wizards + the studio context (guard is not vacuous)", () => {
    // If these files stop containing a guard ref, the assertion above becomes
    // trivially true and this test says so loudly rather than passing in silence.
    const expected = [
      "app/_components/project-wizard/new-project-wizard.tsx",
      "app/_components/project-wizard/import-wizard.tsx",
      "app/studio/_components/studio-context.tsx",
    ];
    for (const rel of expected) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(GUARD_REF.test(src), `${rel} no longer declares a mounted-guard ref`).toBe(
        true,
      );
      expect(
        /\.current\s*=\s*true\b/.test(src),
        `${rel} does not re-arm its mounted-guard ref`,
      ).toBe(true);
      expect(
        /\.current\s*=\s*false\b/.test(src),
        `${rel} does not clear its mounted-guard ref on unmount`,
      ).toBe(true);
    }
  });
});
