import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * task-62 D21 — the three-lane e2e split's COVERAGE GUARD.
 *
 * nextjs now has three e2e lanes, each a separate vitest config:
 *
 *   | lane        | config                      | needs                                  |
 *   |-------------|-----------------------------|----------------------------------------|
 *   | mock        | vitest.e2e.config.ts        | `next dev` only — no Docker, no secrets |
 *   | real        | vitest.e2e.real.config.ts   | Compose + DBOS worker + real GitHub     |
 *   | heavy render| vitest.e2e.render.config.ts | ditto, alone, minutes-long             |
 *
 * Lane membership is each config's explicit `include`/`exclude` — deliberately NOT the
 * filename (row 62's acceptance criterion names `tests/e2e/studio-render-real.e2e.ts`
 * verbatim, so that file keeps its name while living in the render lane).
 *
 * Without this guard the split is a green-lie generator: a newly-added spec that no
 * config's `include` matches (or that every config's `exclude` drops) belongs to NO
 * lane, is never executed by any script, and reports nothing at all. So this test
 * asserts the three configs PARTITION `tests/e2e/*.e2e.ts` — every spec claimed by
 * exactly one lane, never zero and never two (two lanes would double-run the heavy
 * render spec, or run a real-stack spec inside the Docker-free mock lane).
 *
 * Zero-network, zero-Docker: it reads the configs as data.
 */

const REPO_ROOT = process.cwd();
const E2E_DIR = resolve(REPO_ROOT, "tests/e2e");

const LANES = [
  { lane: "mock", config: "vitest.e2e.config.ts" },
  { lane: "real", config: "vitest.e2e.real.config.ts" },
  { lane: "render", config: "vitest.e2e.render.config.ts" },
] as const;

/** The render lane must contain exactly this spec — row 62's acceptance target. */
const RENDER_LANE_SPEC = "tests/e2e/studio-render-real.e2e.ts";

/**
 * The mock lane's membership is a HARD requirement of the combined task, not an
 * incidental list: half (A) replaces the GitHub stub with real egress everywhere, and
 * these are the specs that keep "unit/mock coverage survives" true. They must run with
 * no Compose stack, no root `.env` and no network egress.
 */
const MOCK_LANE_SPECS = [
  "tests/e2e/landing.e2e.ts",
  "tests/e2e/landing-start-cards.e2e.ts",
  "tests/e2e/onboarding-wizard.e2e.ts",
  "tests/e2e/project-wizards.e2e.ts",
  "tests/e2e/studio.e2e.ts",
  "tests/e2e/studio-project.e2e.ts",
  "tests/e2e/studio-publish.e2e.ts",
  "tests/e2e/workspace-profile.e2e.ts",
] as const;

/**
 * Minimal glob → RegExp for the only shapes a vitest `include`/`exclude` uses here:
 * `**` (any depth, may span `/`), `*` (no `/`), and literal segments. Deliberately
 * hand-rolled rather than pulling in a matcher dependency for a guard test.
 */
function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` swallows the slash so `a/**/b.ts` also matches `a/b.ts`
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
      continue;
    }
    out += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

function matchesAny(specPath: string, globs: readonly string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(specPath));
}

interface LaneConfig {
  include: string[];
  exclude: string[];
}

async function readLaneConfig(configFile: string): Promise<LaneConfig> {
  const abs = resolve(REPO_ROOT, configFile);
  const mod = (await import(pathToFileURL(abs).href)) as {
    default?: { test?: { include?: string[]; exclude?: string[] } };
  };
  const test = mod.default?.test ?? {};
  return {
    include: test.include ?? [],
    exclude: test.exclude ?? [],
  };
}

const specFiles = readdirSync(E2E_DIR)
  .filter((f) => f.endsWith(".e2e.ts"))
  .sort()
  .map((f) => `tests/e2e/${f}`);

describe("D21: the three e2e lane configs all exist", () => {
  for (const { lane, config } of LANES) {
    it(`the ${lane} lane's config ${config} is present`, () => {
      expect(
        existsSync(resolve(REPO_ROOT, config)),
        `${config} is missing — the ${lane} e2e lane has no config, so its specs can never run`,
      ).toBe(true);
    });
  }
});

describe("D21: the three lanes PARTITION tests/e2e/*.e2e.ts (exactly once each)", () => {
  it("there is at least one spec to partition", () => {
    expect(specFiles.length).toBeGreaterThan(0);
  });

  it("every spec belongs to exactly one lane", async () => {
    for (const { config } of LANES) {
      expect(
        existsSync(resolve(REPO_ROOT, config)),
        `${config} is missing — cannot compute lane membership`,
      ).toBe(true);
    }

    const configs = await Promise.all(
      LANES.map(async ({ lane, config }) => ({
        lane,
        ...(await readLaneConfig(config)),
      })),
    );

    const membership = new Map<string, string[]>();
    for (const spec of specFiles) {
      const lanes = configs
        .filter((c) => matchesAny(spec, c.include) && !matchesAny(spec, c.exclude))
        .map((c) => c.lane);
      membership.set(spec, lanes);
    }

    const orphans = [...membership.entries()]
      .filter(([, lanes]) => lanes.length === 0)
      .map(([spec]) => spec);
    expect(
      orphans,
      "these specs belong to NO lane — no npm script would ever execute them (a green lie)",
    ).toEqual([]);

    const doubles = [...membership.entries()]
      .filter(([, lanes]) => lanes.length > 1)
      .map(([spec, lanes]) => `${spec} → ${lanes.join("+")}`);
    expect(
      doubles,
      "these specs belong to MORE THAN ONE lane — they would run twice (and a real-stack spec inside the Docker-free mock lane fails for the wrong reason)",
    ).toEqual([]);
  });

  it("the render lane holds exactly row 62's acceptance target", async () => {
    expect(existsSync(resolve(REPO_ROOT, "vitest.e2e.render.config.ts"))).toBe(true);
    const cfg = await readLaneConfig("vitest.e2e.render.config.ts");
    const claimed = specFiles.filter(
      (s) => matchesAny(s, cfg.include) && !matchesAny(s, cfg.exclude),
    );
    expect(claimed).toEqual([RENDER_LANE_SPEC]);
  });

  it("the mock lane holds exactly the Docker-free specs that must stay green", async () => {
    expect(existsSync(resolve(REPO_ROOT, "vitest.e2e.config.ts"))).toBe(true);
    const cfg = await readLaneConfig("vitest.e2e.config.ts");
    const claimed = specFiles.filter(
      (s) => matchesAny(s, cfg.include) && !matchesAny(s, cfg.exclude),
    );
    expect(claimed.sort()).toEqual([...MOCK_LANE_SPECS].sort());
  });
});

describe("D21/D24: only the real + render lanes load the root .env", () => {
  it("the mock lane does NOT list load-root-env (it must not require root creds)", async () => {
    const cfg = (await import(
      pathToFileURL(resolve(REPO_ROOT, "vitest.e2e.config.ts")).href
    )) as { default?: { test?: { setupFiles?: string[] } } };
    const setupFiles = cfg.default?.test?.setupFiles ?? [];
    expect(setupFiles.join(",")).not.toContain("load-root-env");
  });

  for (const config of ["vitest.e2e.real.config.ts", "vitest.e2e.render.config.ts"]) {
    it(`${config} loads the root .env into its workers`, async () => {
      expect(existsSync(resolve(REPO_ROOT, config))).toBe(true);
      const cfg = (await import(
        pathToFileURL(resolve(REPO_ROOT, config)).href
      )) as { default?: { test?: { setupFiles?: string[] } } };
      const setupFiles = cfg.default?.test?.setupFiles ?? [];
      expect(setupFiles.join(",")).toContain("load-root-env");
    });
  }
});
