import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { register } from "@/instrumentation";
import { resolveGenerationTarget } from "@/lib/api/ai-config";

/**
 * Task 43 (D43.2) — nextjs "refuses to BOOT", not "renders a 500 page".
 *
 * Before this, `app/layout.tsx:47-48` threw at module scope in the root layout. That is a
 * RENDER-time throw on a server that started perfectly well: Next serves a 500 `/_error`
 * page and keeps answering. `tests/e2e/global-setup.ts:6-13,24-29` documents exactly that
 * behaviour and has to gate server reuse on `response.ok` because of it. Row 43's E2E
 * column says *boot*.
 *
 * The mechanism is `instrumentation.ts`. Verified in the installed Next 16.2.10:
 * `next/dist/server/next-server.js:568-573` — `prepareImpl()` AWAITS
 * `runInstrumentationHookIfAvailable()` → `ensureInstrumentationRegistered()`, and
 * `next/dist/server/lib/router-utils/instrumentation-globals.external.js:64-68` rethrows
 * whatever `register()` throws. So a throwing `register()` propagates out of `prepare()`
 * and the process never serves anything. `next/dist/server/dev/next-dev-server.js:508-510`
 * is the same for `next dev`.
 *
 * That same file (`:54`) returns early when `NEXT_PHASE === 'phase-production-build'`, so
 * Next already excludes the build phase — this repo does not re-implement that guard.
 *
 * R12 (no new screens) is why there is no `app/error.tsx` / `app/global-error.tsx` here:
 * the design project contains no config-error screen and the author's own try-next line
 * lists the nearest neighbour as undesigned.
 */

const REPO_ROOT = process.cwd();

/** Token-shaped sentinel — see lib/logging/redact.test.ts for the technique. */
const SENTINEL = "SUPAGLOO-SENTINEL-0123456789abcdef";
const VALID_LOOKING_KEY =
  "3f9a1c07be42d85af16c0b93e7d25481aa6f30c9d1b74e2568af0139c7b6e4d2";

/** Every `console.*` in product code must be here. Adding a log site is a DECISION. */
const CONSOLE_ALLOW_LIST = ["instrumentation.ts", "lib/api/ai-config.ts"] as const;

const SCAN_ROOTS = ["lib", "app"] as const;
const SCAN_EXTENSIONS = [".ts", ".tsx"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (!SCAN_EXTENSIONS.some((e) => abs.endsWith(e))) continue;
    if (/\.test\.tsx?$/.test(abs)) continue;
    out.push(relative(REPO_ROOT, abs));
  }
  return out;
}

describe("D43.2 — the boot hook exists where Next actually loads it from", () => {
  it("instrumentation.ts sits at the PROJECT ROOT", () => {
    // Next only picks `instrumentation` up from the project root or `src/`. This repo
    // has no `src/`, so anywhere else is a silently-inert file — a green lie.
    expect(existsSync(resolve(REPO_ROOT, "instrumentation.ts"))).toBe(true);
    expect(existsSync(resolve(REPO_ROOT, "src"))).toBe(false);
  });

  it("exports a `register` function", () => {
    expect(typeof register).toBe("function");
  });
});

describe("D43.2 — register() fails closed", () => {
  const saved = { ...process.env };
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  });

  function setEnv(vars: Record<string, string | undefined>): void {
    for (const key of Object.keys(process.env)) {
      if (
        key === "YV_APP_KEY" ||
        key === "SECRETS_ENCRYPTION_KEY" ||
        key === "NEXT_RUNTIME" ||
        key === "SUPAGLOO_API_URL" ||
        key === "SUPAGLOO_ENABLE_TEST_SEED"
      ) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  it("throws when YV_APP_KEY is absent, naming the variable", async () => {
    setEnv({});
    await expect(register()).rejects.toThrow(/YV_APP_KEY/);
  });

  it("throws when SECRETS_ENCRYPTION_KEY is present, naming the variable", async () => {
    setEnv({ YV_APP_KEY: "k", SECRETS_ENCRYPTION_KEY: VALID_LOOKING_KEY });
    await expect(register()).rejects.toThrow(/SECRETS_ENCRYPTION_KEY/);
  });

  it("resolves and logs nothing for a valid env", async () => {
    setEnv({ YV_APP_KEY: "k" });
    await expect(register()).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("is a no-op on the edge runtime", async () => {
    // `register()` runs once per runtime. The edge runtime does not receive
    // non-inlined server env, so validating there would be a false negative.
    setEnv({ NEXT_RUNTIME: "edge" });
    await expect(register()).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs exactly ONE redacted line, and neither it nor the throw carries key material", async () => {
    setEnv({ YV_APP_KEY: "k", SECRETS_ENCRYPTION_KEY: SENTINEL });
    process.env.GLOO_CLIENT_SECRET = SENTINEL;

    let thrownMessage = "";
    try {
      await register();
      throw new Error("register() should have refused to boot");
    } catch (err) {
      thrownMessage = `${(err as Error).message}\n${(err as Error).stack ?? ""}`;
    }

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0]!.join(" ");
    expect(logged).not.toContain(SENTINEL);
    expect(logged).toContain("SECRETS_ENCRYPTION_KEY");
    expect(logged).not.toContain("\n");
    expect(thrownMessage).not.toContain(SENTINEL);
  });
});

describe("D43.2 — lib/config/env.ts is the SINGLE authored home of the boot env read", () => {
  it("app/layout.tsx no longer reads YV_APP_KEY out of process.env itself", () => {
    const source = readFileSync(resolve(REPO_ROOT, "app/layout.tsx"), "utf8");
    expect(source).not.toContain("process.env.YV_APP_KEY");
    // The non-null assertion `appKey!` existed only because the ad-hoc read was
    // `string | undefined`. The validated config is `string`.
    expect(source).not.toContain("appKey!");
    expect(source).toContain("lib/config/env");
  });

  it("no product file outside lib/config reads YV_APP_KEY from process.env", () => {
    const offenders = SCAN_ROOTS.flatMap((root) => walk(resolve(REPO_ROOT, root)))
      .filter((file) => file !== "lib/config/env.ts")
      .filter((file) =>
        readFileSync(resolve(REPO_ROOT, file), "utf8").includes(
          "process.env.YV_APP_KEY",
        ),
      );
    expect(offenders).toEqual([]);
  });
});

describe("task 43 — local secrets never enter the image build", () => {
  it(".dockerignore excludes .env.local", () => {
    // The builder stage is a bare `COPY . .`, so an untracked .env.local was landing in a
    // build layer AND having its NEXT_PUBLIC_* values inlined into the shipped bundle by
    // `next build`. Nothing is lost by excluding it: YV_APP_KEY reaches the container as a
    // RUNTIME env (D43.3) and app/providers.tsx's `||` falls back to the runtime origin.
    const ignore = readFileSync(resolve(REPO_ROOT, ".dockerignore"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(ignore).toContain(".env.local");
  });
});

describe("task 43 — no secret material in any serialized log line", () => {
  it("the console.* call sites in product code are exactly the allow-list", () => {
    const withConsole = [
      ...SCAN_ROOTS.flatMap((root) => walk(resolve(REPO_ROOT, root))),
      "instrumentation.ts",
    ].filter((file) =>
      /\bconsole\.(log|info|warn|error|debug|trace)\s*\(/.test(
        readFileSync(resolve(REPO_ROOT, file), "utf8"),
      ),
    );
    expect(
      withConsole.sort(),
      "a new log site must be added to CONSOLE_ALLOW_LIST deliberately, with its output " +
        "proven free of secret material — that is the whole of row 43's redaction half in " +
        "a repo with no logger framework",
    ).toEqual([...CONSOLE_ALLOW_LIST].sort());
  });

  it("the ai-config resolution log never emits a secret-named env var's value", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      resolveGenerationTarget("script", {
        SUPAGLOO_AI_MODEL_SCRIPT: "openai/gpt-5",
        GLOO_CLIENT_SECRET: SENTINEL,
        SECRETS_ENCRYPTION_KEY: SENTINEL,
        GITHUB_E2E_PAT_TOKEN: SENTINEL,
      });
      const lines = infoSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(lines.length).toBeGreaterThan(0);
      expect(lines).not.toContain(SENTINEL);
      // It still says the useful thing.
      expect(lines).toContain("SUPAGLOO_AI_MODEL_SCRIPT");
    } finally {
      infoSpy.mockRestore();
    }
  });
});
