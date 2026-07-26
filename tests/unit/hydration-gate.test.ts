import { describe, expect, it } from "vitest";

import { isHydratedSnapshot, pollUntil } from "../e2e/helpers";

/**
 * Plan row 68 — the unit half of the hydration gate.
 *
 * The row's acceptance says "any new wait helper introduced should carry its own
 * unit test". `vitest.config.ts` is `environment: "node"` with
 * `include: ["lib/**\/*.test.ts", "tests/unit/**\/*.test.ts"]` — there is no jsdom
 * and no browser here, so the gate is deliberately split in two:
 *
 *   - `pollUntil`         — a PURE poll driver with injected `read`/`sleep`/`now`
 *                           (same shape as `lib/project-wizard/provision-effects.ts`'s
 *                           `pollJobUntilTerminal`). Everything about the timing
 *                           contract is testable here with zero I/O.
 *   - `isHydratedSnapshot` — a PURE predicate over a plain snapshot object, so the
 *                           browser-side measurement can be asserted without a DOM.
 *
 * Only the thin `page.evaluate` adapter (`waitForHydrated`) is untestable at unit
 * level, and it contains no logic beyond feeding one into the other.
 */

describe("pollUntil", () => {
  it("resolves as soon as read() returns true, without sleeping", async () => {
    const sleeps: number[] = [];
    let reads = 0;

    await pollUntil({
      label: 'testid "studio-frame"',
      read: async () => {
        reads += 1;
        return true;
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      now: () => 0,
      timeoutMs: 8000,
      intervalMs: 100,
      describe: () => "unused",
    });

    expect(reads).toBe(1);
    expect(sleeps, "a predicate that is already true must not cost a tick").toEqual([]);
  });

  it("polls at the given interval until the predicate goes true", async () => {
    const sleeps: number[] = [];
    const answers = [false, false, false, true];
    let reads = 0;

    await pollUntil({
      label: 'testid "studio-frame"',
      read: async () => answers[reads++]!,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      now: () => 0,
      timeoutMs: 8000,
      intervalMs: 100,
      describe: () => "unused",
    });

    expect(reads).toBe(4);
    expect(sleeps).toEqual([100, 100, 100]);
  });

  it("throws a message naming the target and the last observed state on timeout", async () => {
    // `now` jumps past the deadline after the first read, so exactly one read runs.
    const clock = [0, 0, 999_999];
    let tick = 0;

    await expect(
      pollUntil({
        label: 'testid "studio-frame"',
        read: async () => false,
        sleep: async () => {},
        now: () => clock[Math.min(tick++, clock.length - 1)]!,
        timeoutMs: 8000,
        intervalMs: 100,
        describe: () => "box 0x0, reactProps=false",
      }),
    ).rejects.toThrow(/studio-frame[\s\S]*box 0x0, reactProps=false/);
  });

  it("never calls read() after the deadline has passed", async () => {
    let reads = 0;
    const clock = [0, 999_999];
    let tick = 0;

    await expect(
      pollUntil({
        label: "target",
        read: async () => {
          reads += 1;
          return false;
        },
        sleep: async () => {},
        now: () => clock[Math.min(tick++, clock.length - 1)]!,
        timeoutMs: 8000,
        intervalMs: 100,
        describe: () => "last state",
      }),
    ).rejects.toThrow();

    expect(reads, "the deadline check must bound the reads, not just the sleeps").toBe(1);
  });
});

describe("isHydratedSnapshot", () => {
  it("rejects a node with a zero box even when React has attached props", () => {
    expect(isHydratedSnapshot({ width: 0, height: 0, hasReactProps: true })).toBe(false);
  });

  it("rejects a laid-out node that React has NOT attached props to", () => {
    // This is the exact 1/16 case `waitForSelector({ state: "visible" })` let
    // through: the node is on screen, but React has not hydrated it, so a
    // dispatched `input` event finds no fiber props and `onChange` never runs.
    expect(isHydratedSnapshot({ width: 800, height: 600, hasReactProps: false })).toBe(false);
  });

  it("accepts a laid-out node React has attached props to", () => {
    expect(isHydratedSnapshot({ width: 800, height: 600, hasReactProps: true })).toBe(true);
  });

  it("rejects a node collapsed on one axis", () => {
    expect(isHydratedSnapshot({ width: 0, height: 600, hasReactProps: true })).toBe(false);
  });
});
