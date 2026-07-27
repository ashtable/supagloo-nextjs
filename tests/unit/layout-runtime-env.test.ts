import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RX-1 / R4344-2 — `YV_APP_KEY` must be read PER REQUEST, never at build time.
 *
 * ## The regression this pins (measured, not inferred)
 *
 * Row 43 moved the app-key read into `lib/config/env.ts` and called it from `app/layout.tsx`
 * at **module scope**. Nothing in `app/` exports `dynamic`/`revalidate`, so `next build`
 * statically prerendered `/`, `/gallery`, `/profile`, `/studio`, `/your-videos` — evaluating
 * that module with the BUILD-time env — and because `appKey` crosses into
 * `app/providers.tsx` (`"use client"`), the value was frozen into the RSC payload and HTML:
 *
 *   docker run --rm --entrypoint sh supagloo-nextjs:latest \
 *     -c 'grep -rl "build-time-placeholder-not-a-real-key" /app/.next | wc -l'   → 33
 *
 *   docker run -d --rm -p 8123:3000 -e YV_APP_KEY=REAL_RUNTIME_KEY_ZZZ supagloo-nextjs:latest
 *   curl -s http://localhost:8123/ | grep -c build-time-placeholder-not-a-real-key → 1
 *   curl -s http://localhost:8123/ | grep -c REAL_RUNTIME_KEY_ZZZ                  → 0
 *
 * i.e. a container handed the REAL key served the placeholder to `<YouVersionProvider>`, so
 * YouVersion sign-in was broken on five routes while the page returned 200 and every nextjs
 * e2e lane stayed green (they drive `next dev`, where every route is dynamic).
 *
 * ## The fix, and why the test looks like this
 *
 * `await connection()` (from `next/server`) inside `RootLayout`, immediately before
 * `loadNextjsServerEnv()`. It marks the render as needing a real request, so the env read
 * cannot happen during `next build`. The user chose it over `export const dynamic =
 * "force-dynamic"` deliberately.
 *
 * Three properties, each red before the fix:
 *   1. importing the module does not read the env at all (no module-scope read);
 *   2. `connection()` is awaited BEFORE the read (otherwise a prerender reads the build env
 *      and only then bails, which is the defect with extra steps);
 *   3. the key handed to `Providers` is the one in the env AT RENDER TIME.
 *
 * `next/font/google` is mocked because the font loaders only exist inside Next's compiler;
 * that is a build-tool stub, not a stub of anything under test.
 */

vi.mock("next/font/google", () => {
  const loader = () => ({ variable: "--font-stub", className: "font-stub", style: {} });
  return {
    Anton: loader,
    Barlow: loader,
    Barlow_Semi_Condensed: loader,
    Zilla_Slab: loader,
  };
});

const connection = vi.fn<() => Promise<void>>(() => Promise.resolve());
vi.mock("next/server", () => ({ connection: () => connection() }));

const RUNTIME_KEY = "runtime-key-set-only-in-the-container-9f1c";

function setKey(value: string | undefined): void {
  if (value === undefined) delete process.env.YV_APP_KEY;
  else process.env.YV_APP_KEY = value;
}

/** Find the `appKey` prop anywhere in a returned element tree. */
function findAppKey(node: unknown): string | undefined {
  if (node === null || typeof node !== "object") return undefined;
  const element = node as { props?: Record<string, unknown> };
  const props = element.props;
  if (props) {
    if (typeof props.appKey === "string") return props.appKey;
    const children = props.children;
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      const found = findAppKey(child);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

describe("RX-1 — app/layout.tsx reads YV_APP_KEY per request, not at module load", () => {
  const saved = process.env.YV_APP_KEY;

  beforeEach(() => {
    connection.mockReset();
    connection.mockImplementation(() => Promise.resolve());
    setKey(saved);
  });

  it("importing the module with NO YV_APP_KEY does not throw", async () => {
    // The module-scope read threw here, which is precisely why `next build` had to be given
    // a placeholder value at all — and why the placeholder ended up in 33 build artifacts.
    setKey(undefined);
    const mod = await import("@/app/layout");
    expect(typeof mod.default).toBe("function");
    expect(connection).not.toHaveBeenCalled();
  });

  it("awaits connection() BEFORE reading the env", async () => {
    setKey(undefined);
    const { default: RootLayout } = await import("@/app/layout");
    connection.mockImplementation(() =>
      Promise.reject(new Error("connection() reached first")),
    );
    // Both failure modes are available: an invalid env AND a rejecting connection(). The
    // one that surfaces is the one that ran first.
    await expect(
      RootLayout({ children: "child" } as never) as Promise<unknown>,
    ).rejects.toThrow(/connection\(\) reached first/);
  });

  it("hands Providers the key that is in the env AT RENDER TIME", async () => {
    const { default: RootLayout } = await import("@/app/layout");
    setKey(RUNTIME_KEY);
    const tree = await (RootLayout({ children: "child" } as never) as Promise<unknown>);
    expect(connection).toHaveBeenCalledTimes(1);
    expect(findAppKey(tree)).toBe(RUNTIME_KEY);
  });

  it("re-reads the env on every render, so a rebuilt-free key change takes effect", async () => {
    const { default: RootLayout } = await import("@/app/layout");
    setKey("first-key-aaaaaaaaaaaa");
    const first = await (RootLayout({ children: "c" } as never) as Promise<unknown>);
    setKey("second-key-bbbbbbbbbbbb");
    const second = await (RootLayout({ children: "c" } as never) as Promise<unknown>);
    expect(findAppKey(first)).toBe("first-key-aaaaaaaaaaaa");
    expect(findAppKey(second)).toBe("second-key-bbbbbbbbbbbb");
  });

  it("still REFUSES to render a keyless request, naming the variable", async () => {
    // The validator stays load-bearing at render time: moving the read must not turn a
    // misconfiguration into an `appKey={undefined}` page. (`instrumentation.ts` is what
    // makes the container exit; this is the second line of defence.)
    const { default: RootLayout } = await import("@/app/layout");
    setKey(undefined);
    await expect(
      RootLayout({ children: "child" } as never) as Promise<unknown>,
    ).rejects.toThrow(/YV_APP_KEY/);
  });
});
