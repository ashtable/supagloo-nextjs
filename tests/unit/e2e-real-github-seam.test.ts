import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * task-62 half (A) — the nextjs-side NO-STUB / NO-FABRICATED-IDENTITY guard.
 *
 * Half (A) replaced the github-stub + local git-server with real
 * `github.com` / `api.github.com` for every real-stack e2e spec. Three of those
 * changes are invariants a future edit can silently undo, each with a failure mode
 * that looks like something else entirely:
 *
 *  1. **A fabricated `installationId`.** The literal these specs used to plant WAS
 *     plan row 62 item (d): real GitHub permanently 404s
 *     `POST /app/installations/<made-up>/access_tokens`, and the symptom surfaces
 *     minutes later inside a DBOS workflow, not at the spec. The id must always come
 *     from runtime discovery.
 *  2. **A resurrected stub host/port.** Reintroducing a stub is explicitly forbidden
 *     as a mitigation for anything, and dead stub wiring "invites quiet re-adoption"
 *     — three orphaned stub env vars outlived their stubs by a whole task, which is
 *     how that risk actually materialises.
 *  3. **A re-duplicated project-creation helper.** Six byte-similar private copies
 *     collapsed into one shared helper. Only the shared one carries the
 *     installation-visibility gate, the emptiness gate, the not-`data-disabled`
 *     assertion and the DBOS-worker-naming backstop, so a fresh private copy would
 *     look fine and fail opaquely.
 *
 * This is a pure filesystem read: zero network, zero Docker. It is the nextjs
 * counterpart of the root repo's inverted overlay guard and cross-checkout prefix
 * guard.
 *
 * NOTE ON THE PREFIX: the throwaway-repo name prefix is authored exactly once, in
 * the ROOT repo. It deliberately does NOT appear anywhere in this repo — not even in
 * a comment — so that the cleanup script's hard gate can never drift from what the
 * specs create. That single-source property is asserted by the root repo's own guard,
 * which greps all four checkouts.
 */

const E2E_DIR = resolve(process.cwd(), "tests/e2e");

function e2eFiles(): { name: string; text: string }[] {
  return readdirSync(E2E_DIR)
    .filter((f) => f.endsWith(".ts"))
    .sort()
    .map((name) => ({
      name,
      text: readFileSync(resolve(E2E_DIR, name), "utf8"),
    }));
}

/** The nine real-stack specs plus the render spec: the lanes that hit real GitHub. */
const REAL_LANE_SPECS = [
  "bff-session.e2e.ts",
  "github-connect.e2e.ts",
  "openrouter-gloo-connect.e2e.ts",
  "project-wizards-real.e2e.ts",
  "studio-ai-generation.e2e.ts",
  "studio-hydration.e2e.ts",
  "studio-publish-real.e2e.ts",
  "studio-render-real.e2e.ts",
  "studio-replan-scripture.e2e.ts",
  "studio-translation-widen.e2e.ts",
] as const;

describe("no spec may fabricate a GitHub installation id (task-62 D5)", () => {
  for (const { name, text } of e2eFiles()) {
    it(`${name} passes a discovered installationId, never a literal`, () => {
      // Matches `installationId: "…"` / `installationId = "…"` with any literal value.
      const literals = [...text.matchAll(/installationId\s*[:=]\s*["'`]([^"'`]*)["'`]/g)].map(
        (m) => m[0],
      );
      expect(
        literals,
        "installation ids must come from resolveInstallationId() — a hardcoded id is " +
          "wrong even when it currently works, because it changes on every reinstall",
      ).toEqual([]);
    });
  }

  it("every real-lane spec that connects GitHub resolves the id at runtime", () => {
    const offenders: string[] = [];
    for (const { name, text } of e2eFiles()) {
      if (!(REAL_LANE_SPECS as readonly string[]).includes(name)) continue;
      if (!text.includes("completeGithubConnectViaCallback(")) continue;
      if (!text.includes("resolveInstallationId")) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});

describe("the deleted create-repo callback shim stays deleted (task-62 D13 tier 2)", () => {
  it("nothing imports or calls completeCreateRepoViaCallback", () => {
    const offenders = e2eFiles()
      .filter(({ text }) => /completeCreateRepoViaCallback\s*[(,]/.test(text))
      .map(({ name }) => name);
    expect(
      offenders,
      "that helper drove a synthetic OAuth `code` which real GitHub rejects as " +
        "bad_verification_code — reviving it recreates a test that cannot pass",
    ).toEqual([]);
  });
});

describe("no stub host, port or base-URL override may creep back (task-62 D20)", () => {
  /**
   * These patterns match stub **WIRING**, not the words. A header that explains, in
   * the past tense, what the retired github-stub used to do is documentation we WANT
   * to keep — deleting the explanation is how the next reader re-derives the wrong
   * mental model. What must never reappear is a stub host in a URL, a stub port, an
   * env-var assignment redirecting a GitHub base URL, or a call to a stub-only route.
   *
   * Also deliberately narrow in the other direction: `http://localhost:3000`
   * (`next dev`), `:4000` (the real containerised api) and `:9000` (real MinIO) are
   * legitimate coordinates and must NOT trip this guard.
   */
  const FORBIDDEN: readonly [RegExp, string][] = [
    // Quote classes exclude backticks on purpose: a docblock explaining what the
    // retired stub used to do writes `github-stub` in backticks, and that prose is
    // exactly what we want kept. A stub used as a real HOST always appears either
    // after `//` in a URL or with a `:port` suffix, both of which are still caught.
    [/\/\/\s*github-stub|github-stub:\d|["']github-stub["']/, "the github-stub as a HOST"],
    [/\/\/\s*git-server|git-server:\d|["']git-server["']/, "the git-server as a HOST"],
    [/\/\/\s*openrouter-stub|openrouter-stub:\d/, "the openrouter-stub as a HOST"],
    [/\/\/\s*gloo-stub|gloo-stub:\d/, "the gloo-stub as a HOST"],
    [/\/\/\s*youversion-stub|youversion-stub:\d/, "the youversion-stub as a HOST"],
    [/localhost:480\d\b|127\.0\.0\.1:480\d\b/, "a stub host port (48xx)"],
    [
      /GITHUB_(API|OAUTH|GIT)_BASE_URL\s*[:=]\s*["'`]/,
      "an assignment to a GitHub base-URL override",
    ],
    [/["'`][^"'`]*__stub\//, "a stub introspection route"],
    [/["'`][^"'`]*__admin\//, "a stub admin fixture route"],
  ];

  for (const { name, text } of e2eFiles()) {
    it(`${name} names no stub coordinate`, () => {
      const hits = FORBIDDEN.filter(([re]) => re.test(text)).map(([, what]) => what);
      expect(
        hits,
        `${name} still references ${hits.join(", ")}. Every provider is exercised for ` +
          "real; reintroducing stub wiring (even in a comment) is how it quietly comes back.",
      ).toEqual([]);
    });
  }
});

describe("project acquisition is not re-duplicated (task-62 D14)", () => {
  it("the shared helper exists and is the only implementation", () => {
    const shared = readFileSync(resolve(E2E_DIR, "github-e2e.ts"), "utf8");
    expect(shared).toContain("export async function createProjectViaExistingEmptyRepo");

    // A private re-implementation is recognisable by driving the wizard's CTA itself.
    const offenders = e2eFiles()
      .filter(({ name }) => name !== "github-e2e.ts")
      .filter(({ text }) => text.includes('clickTestId("new-project-cta")'))
      // The mock lane legitimately drives the wizard directly: it never touches GitHub.
      .filter(({ name }) => (REAL_LANE_SPECS as readonly string[]).includes(name))
      .map(({ name }) => name);
    expect(
      offenders,
      "only the shared helper carries the installation-visibility gate, the emptiness " +
        "gate, the not-`data-disabled` assertion and the DBOS-worker-naming backstop",
    ).toEqual([]);
  });

  it("the shared helper keeps its safety assertions", () => {
    const shared = readFileSync(resolve(E2E_DIR, "github-e2e.ts"), "utf8");
    // Narrow the picker before clicking: the live account renders 100+ rows, so a
    // positional selector would land on one of the user's REAL repositories.
    expect(shared).toContain('typeInto(page, "repo-search"');
    // A disabled row's click is a silent no-op — assert selectability explicitly.
    expect(shared).toContain('"data-disabled"');
    // The emptiness gate against the real product route.
    expect(shared).toContain("assertFixtureRepoListedEmpty");
  });
});
