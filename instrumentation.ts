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
 * So a throw here propagates out of `prepare()` and the process exits instead of serving.
 * That is what makes root's Compose e2e (`docker compose run --rm --no-deps -e YV_APP_KEY=
 * nextjs` ⇒ non-zero exit) a real assertion rather than a page-content check.
 *
 * The same file returns early when `NEXT_PHASE === 'phase-production-build'` (`:54`), so
 * Next ALREADY excludes the build phase and this file does not re-implement that guard —
 * which is what lets D43.3 wire `YV_APP_KEY` as a runtime env rather than a build arg.
 *
 * NOTE (R12): there is deliberately no `app/error.tsx` / `app/global-error.tsx` and no
 * branded config-error screen. The design project contains no such screen, and the row
 * asks for a boot refusal, not a rendered error state.
 */
export async function register(): Promise<void> {
  // `register()` runs once per runtime. The edge runtime does not receive non-inlined
  // server env, so validating there would fail for a reason that is not a misconfiguration.
  if (process.env.NEXT_RUNTIME === "edge") return;

  try {
    loadNextjsServerEnv();
  } catch (err) {
    // ONE redacted line, because this is read out of a container log tail. The validator's
    // messages carry variable NAMES only — `serializeErrorForLog` is the second line of
    // defence, and `tests/unit/boot-hardening.test.ts` proves no key material survives it.
    console.error(`[supagloo-nextjs] boot refused — ${serializeErrorForLog(err)}`);
    throw err;
  }
}
