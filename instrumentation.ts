import { loadNextjsServerEnv } from "@/lib/config/env";
import { serializeErrorForLog } from "@/lib/logging/redact";

/**
 * Task 43 (D43.2) — supagloo-nextjs REFUSES TO BOOT on a bad environment.
 *
 * Before this file, `app/layout.tsx` threw at module scope. That is a RENDER-time throw on
 * a server that started perfectly well: Next answers with a 500 `/_error` page and keeps
 * serving. `tests/e2e/global-setup.ts:24-29` documents exactly that, and has to gate
 * dev-server reuse on `response.ok` because of it. Row 43's acceptance criterion is
 * *boot*, so the check has to run before the server can serve anything.
 *
 * `instrumentation.ts` is that place, and the mechanism is load-bearing rather than
 * conventional. In the installed Next 16.2.10:
 *
 *   - `next/dist/server/next-server.js:568-573` — `prepareImpl()` **awaits**
 *     `runInstrumentationHookIfAvailable()` → `ensureInstrumentationRegistered()`.
 *     `next/dist/server/dev/next-dev-server.js:508-510` is the same for `next dev`.
 *   - `next/dist/server/lib/router-utils/instrumentation-globals.external.js:64-68`
 *     rethrows whatever `register()` throws, prefixed
 *     `An error occurred while loading instrumentation hook: `.
 *
 * ── WHY THE THROW ALONE IS NOT A REFUSAL (R4344-1) ──────────────────────────────────
 *
 * Row 43 shipped only the rethrow and claimed the process would exit instead of serving.
 * That is false, and it was measured: the container logs `✓ Ready in 67ms`, then the refusal
 * line, then Next's own `Failed to prepare server`, and is **still `Up` 30 s later answering
 * HTTP 500 on every request**. In the same Next 16.2.10:
 *
 *   - `next-server.js:493-496` — the `NextNodeServer` constructor, when `!options.dev`,
 *     fires `this.prepare().catch(err => console.error('Failed to prepare server', err))`.
 *     The rejection is SWALLOWED.
 *   - `next-server.js:920-923` — `makeRequestHandler()` does it again.
 *   - `lib/start-server.js:431` has already bound the listener, and `:318` already logged
 *     `Ready in X`, before `getRequestHandlers()`'s prepare settles either way.
 *
 * So `docker compose ps` reports the misconfigured service *running*, `depends_on:
 * condition: service_started` passes, nothing restarts or alerts, and the misconfiguration
 * is visible only to a human reading a log tail. A boot refusal has to be a **process
 * exit** — which is what makes root's Compose case (`docker compose run --rm --no-deps -e
 * YV_APP_KEY= nextjs` ⇒ non-zero exit) a real assertion rather than a page-content check.
 *
 * `exit` is a parameter purely so the unit tests can observe the refusal without killing the
 * vitest worker. Next calls `register()` with NO arguments, so the default — the real
 * `process.exit` — is what ships, and `tests/unit/boot-hardening.test.ts` pins that default
 * too; otherwise the seam could quietly become a no-op with every case still green.
 *
 * `instrumentation-globals.external.js` also returns early when `NEXT_PHASE ===
 * 'phase-production-build'` (`:52-56`), so Next ALREADY excludes the build phase: this file
 * does not re-implement that guard and cannot fail a `next build`. That is what lets D43.3
 * wire `YV_APP_KEY` as a runtime env rather than a build arg — see `app/layout.tsx`, which
 * (per RX-1) reads it per request rather than at module scope.
 *
 * NOTE (R12): there is deliberately no `app/error.tsx` / `app/global-error.tsx` and no
 * branded config-error screen. The design project contains no such screen, and the row
 * asks for a boot refusal, not a rendered error state.
 */

/**
 * The shipped `exit`. Reaches `process.exit` through a COMPUTED property on purpose.
 *
 * Next compiles this file for BOTH runtimes, and its edge analyzer rejects a *static*
 * `process.exit` reference: a literal `process.exit` here produced
 * `⚠ A Node.js API is used (process.exit …) which is not supported in the Edge Runtime` +
 * `Ecmascript file had an error` — once in `next build` and 125 times across a single
 * `next dev` e2e run. The warning is about a line the edge runtime can never reach
 * (`register()` returns at the `NEXT_RUNTIME === "edge"` guard before this is called), so the
 * choice is between a false alarm in every build log and this indirection. `vi.spyOn(process,
 * "exit")` still observes it, which is how the unit spec pins that the default is the real
 * exit and not a no-op.
 *
 * `exit` may be absent on a runtime that has no `process.exit`; there, the `throw` below is
 * the honest fallback rather than a silently ignored refusal.
 */
function exitProcess(code: number): never {
  const exit = (process as unknown as Record<string, unknown>)["exit"] as
    | ((code: number) => never)
    | undefined;
  if (typeof exit !== "function") {
    throw new Error(
      `[supagloo-nextjs] boot refused with code ${code}, and this runtime exposes no exit ` +
        `function to make the refusal terminal`,
    );
  }
  exit(code);
  // Reached only if `exit` returned, which the real `process.exit` never does — i.e. it was
  // stubbed by a test. Fall through so the caller's rethrow surfaces the actual
  // configuration error rather than a manufactured one.
  return undefined as never;
}

export async function register(
  exit: (code: number) => never = exitProcess,
): Promise<void> {
  // `register()` runs once per runtime. The edge runtime does not receive non-inlined
  // server env, so validating there would fail for a reason that is not a misconfiguration.
  if (process.env.NEXT_RUNTIME === "edge") return;

  try {
    loadNextjsServerEnv();
  } catch (err) {
    // ONE redacted line, because this is read out of a container log tail. The validator's
    // messages carry variable NAMES only — `serializeErrorForLog` is the second line of
    // defence, and `tests/unit/boot-hardening.test.ts` proves no key material survives it.
    // Emitted BEFORE the exit: on Linux, writes from `process.stderr` to a pipe are
    // synchronous, so the reason reaches `docker compose logs` ahead of the exit.
    console.error(`[supagloo-nextjs] boot refused — ${serializeErrorForLog(err)}`);
    exit(1);
    // Unreachable in production — `process.exit` does not return. Kept so that an `exit`
    // which DOES return still leaves `prepare()` rejected rather than letting the server
    // carry on with an invalid environment.
    throw err;
  }
}
