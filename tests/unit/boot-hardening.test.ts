import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { register } from "@/instrumentation";
import { resolveGenerationTarget } from "@/lib/api/ai-config";
import { REDACTED } from "@/lib/logging/redact";

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
 * whatever `register()` throws. `next/dist/server/dev/next-dev-server.js:508-510` is the
 * same for `next dev`.
 *
 * A REJECTED `prepare()` IS NOT A REFUSAL, though, and that correction is why `exit` is a
 * parameter below. Also verified in 16.2.10: `next-server.js:493-496` (the `NextNodeServer`
 * constructor when `!options.dev`) and `:920-923` (`makeRequestHandler`) both
 * `.catch(err => console.error('Failed to prepare server', err))`, and
 * `lib/start-server.js:431` has already bound the listener — the container logs
 * `✓ Ready in …`, then the boot refusal, and is still `Up` 30 s later answering 500 on every
 * request. So the refusal has to be `process.exit(1)`; the rethrow alone is what row 43
 * shipped and it did not meet the row's own E2E word, "boot".
 *
 * That same file (`:52-56`) returns early when `NEXT_PHASE === 'phase-production-build'`, so
 * Next already excludes the build phase — this repo does not re-implement that guard, and
 * `exit(1)` therefore cannot fail a build. Measured after the change: `next build` with
 * `YV_APP_KEY` entirely unset exits 0 and emits no `boot refused` line at all.
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

  it("reaches process.exit indirectly, because Next compiles this file for EDGE too", () => {
    // Next builds `instrumentation.ts` for both runtimes. A literal `process.exit` in the
    // code (not the comments) makes its edge analyzer emit `A Node.js API is used
    // (process.exit …) which is not supported in the Edge Runtime` + `Ecmascript file had an
    // error` — measured at 1 occurrence per `next build` and 125 across one `next dev` e2e
    // run — about a line the edge runtime cannot reach (`register()` returns at the
    // NEXT_RUNTIME guard). The computed access keeps the log clean while `vi.spyOn(process,
    // "exit")` still observes the call, which is what the DEFAULT-exit case below relies on.
    const code = readFileSync(resolve(REPO_ROOT, "instrumentation.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(
      code,
      "a static `process.exit` here re-introduces the edge-runtime warning storm — read it " +
        'off `process` with a computed key, as `exitProcess` does',
    ).not.toMatch(/process\s*\.\s*exit/);
    expect(code).toContain('["exit"]');
  });
});

describe("D43.2 — register() fails closed", () => {
  const saved = { ...process.env };
  let errorSpy: ReturnType<typeof vi.spyOn>;
  /**
   * The `exit` seam. Every failure case MUST pass it: the shipped default is the real
   * `process.exit`, so a failure case that omitted it would kill the vitest worker.
   */
  let exitSpy: Mock<(code: number) => never>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.fn<(code: number) => never>();
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
    await expect(register(exitSpy)).rejects.toThrow(/YV_APP_KEY/);
  });

  it("throws when SECRETS_ENCRYPTION_KEY is present, naming the variable", async () => {
    setEnv({ YV_APP_KEY: "k", SECRETS_ENCRYPTION_KEY: VALID_LOOKING_KEY });
    await expect(register(exitSpy)).rejects.toThrow(/SECRETS_ENCRYPTION_KEY/);
  });

  it("EXITS the process on a bad env — a rethrow alone leaves the container Up", async () => {
    // The whole of R4344-1. Next `.catch()`es the rejected `prepare()` in both the
    // `NextNodeServer` constructor and `makeRequestHandler` and the listener is already
    // bound, so without this the misconfigured service answers 500 forever while
    // `docker compose ps` reports it running and `depends_on: service_started` passes.
    setEnv({});
    await expect(register(exitSpy)).rejects.toThrow(/YV_APP_KEY/);
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits AFTER the refusal line, so the log tail explains the exit", async () => {
    // Ordering matters for the operator: `docker compose logs nextjs` has to carry the
    // reason. On Linux, writes to a pipe from process.stderr are synchronous, so the line
    // is flushed before the exit — but only if it is emitted first.
    setEnv({});
    const order: string[] = [];
    errorSpy.mockImplementation(() => {
      order.push("error");
    });
    const orderedExit = vi.fn<(code: number) => never>(() => {
      order.push("exit");
      return undefined as never;
    });
    await expect(register(orderedExit)).rejects.toThrow(/YV_APP_KEY/);
    expect(order).toEqual(["error", "exit"]);
  });

  it("the DEFAULT exit is the real process.exit — the seam is not a test-only fiction", async () => {
    // Without this, `exit` could default to a no-op and every case above would still pass
    // while the shipped container kept serving 500s. Next calls `register()` with NO
    // arguments (`instrumentation-globals.external.js`), so the default is what ships.
    setEnv({});
    const processExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    try {
      await expect(register()).rejects.toThrow(/YV_APP_KEY/);
      expect(processExit).toHaveBeenCalledWith(1);
    } finally {
      processExit.mockRestore();
    }
  });

  it("resolves, logs nothing and does NOT exit for a valid env", async () => {
    setEnv({ YV_APP_KEY: "k" });
    await expect(register(exitSpy)).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("is a no-op on the edge runtime", async () => {
    // `register()` runs once per runtime. The edge runtime does not receive
    // non-inlined server env, so validating there would be a false negative.
    setEnv({ NEXT_RUNTIME: "edge" });
    await expect(register(exitSpy)).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("logs exactly ONE redacted line, and neither it nor the throw carries key material", async () => {
    setEnv({ YV_APP_KEY: "k", SECRETS_ENCRYPTION_KEY: SENTINEL });
    process.env.GLOO_CLIENT_SECRET = SENTINEL;

    let thrownMessage = "";
    try {
      await register(exitSpy);
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

  /**
   * R4344-9 (D4). The previous shape of this case set `SUPAGLOO_AI_MODEL_SCRIPT` to a
   * harmless `"openai/gpt-5"` and asserted the SENTINEL held by `GLOO_CLIENT_SECRET` was
   * absent from the log. `logResolution` interpolates only the kind, the env var NAME and
   * the resolved value — the sentinel was never in scope for the string, so the assertion
   * passed on what the code never did and would have passed with `lib/logging/redact.ts`
   * deleted.
   *
   * The discriminating shape is to make the LOGGED VALUE itself be the secret's value: the
   * `SUPAGLOO_AI_MODEL_SCRIPT_OPENROUTER` override carries exactly what `GLOO_CLIENT_SECRET`
   * carries, so the model `console.info` line would print it verbatim unless it goes through
   * `redactSecrets`. Remove that `redactSecrets(...)` call in `lib/api/ai-config.ts` and this
   * case goes red.
   *
   * ── Why the MODEL line, and only the model line (2026-07-31, revision R2) ────────────
   *
   * This case used to smuggle the sentinel into the PROVIDER line too, via
   * `SUPAGLOO_AI_PROVIDER_SCRIPT`, and asserted two redaction markers. `repairProvider` now
   * CLAMPS an unrecognised provider override to the kind's matrix default, so the provider
   * slot is a closed vocabulary — `openrouter` or `gloo` — and can no longer echo arbitrary
   * operator input into a log at all. That is a strictly stronger position for the property
   * this case is about, not a weakening of it, and it cannot be re-created: `redactSecrets`
   * only masks values of 8+ characters, so no valid provider name could ever be a needle.
   * The provider half is therefore asserted STRUCTURALLY below (the line prints the clamped
   * provider, never the input) and the redaction half rides on the model line.
   */
  it("the ai-config resolution log REDACTS a value that is also a secret's value", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      resolveGenerationTarget("script", {
        // Not secret-named (no SECRET/TOKEN/…, no trailing _KEY/_PAT segment), so these are
        // needles only because GLOO_CLIENT_SECRET below holds the same value. The SLOT form
        // is used because it binds regardless of which provider the repair settles on.
        SUPAGLOO_AI_PROVIDER_SCRIPT: SENTINEL,
        SUPAGLOO_AI_MODEL_SCRIPT_OPENROUTER: SENTINEL,
        GLOO_CLIENT_SECRET: SENTINEL,
        SECRETS_ENCRYPTION_KEY: SENTINEL,
        GITHUB_E2E_PAT_TOKEN: SENTINEL,
      });
      const lines = infoSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(infoSpy).toHaveBeenCalledTimes(2); // one provider line, one model line
      expect(lines).not.toContain(SENTINEL);
      // Positively: the redactor is what removed it from the model line. (Which secret NAME
      // labels the mask depends on needle order among equal-length values, so match the
      // marker rather than one name.)
      expect(lines.match(/\[redacted:[A-Z0-9_]+\]/g)).toHaveLength(1);
      // The provider line never had to be redacted, because the clamp meant it never held
      // the value: it names the closed-vocabulary provider that was actually resolved.
      expect(lines).toMatch(/provider .*-> openrouter\b/);
      // It still says the useful thing.
      expect(lines).toContain("SUPAGLOO_AI_MODEL_SCRIPT");
      expect(lines).toContain("SUPAGLOO_AI_PROVIDER_SCRIPT");
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("the ai-config resolution log still reads correctly for a NON-secret value", () => {
    // Anti-corruption half: redaction must not mangle an ordinary model id (a slash and a
    // `:free` suffix must survive — `redactSecrets`'s URL-credential rule wants `://`).
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      resolveGenerationTarget("script", {
        SUPAGLOO_AI_MODEL_SCRIPT: "google/gemma-4-26b-a4b-it:free",
        GLOO_CLIENT_SECRET: SENTINEL,
      });
      const lines = infoSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(lines).toContain("google/gemma-4-26b-a4b-it:free");
      expect(lines).not.toContain(REDACTED);
    } finally {
      infoSpy.mockRestore();
    }
  });
});
