import { describe, expect, it } from "vitest";

// `./session-model` does not exist yet — this import fails (RED) until Step 9
// creates `lib/session/session-model.ts`. That missing-module failure is the
// point: it reds the whole suite until the pure session seam ships.
//
// This module is the flag-gated mock-session reachability seam (plan D-AUTH):
// pure parse + precedence so the demo `?mock=` override can force a
// deterministic signed-in session in E2E/demo, and is a hard no-op in prod.
import {
  parseMockSession,
  resolveSession,
  firstSignIn,
  hasOnboardedFromRaw,
  onboardingStorageKey,
  type Session,
} from "./session-model";

// A minimal stand-in for the `useYVAuth()` surface resolveSession consumes.
// (Real shape per memory `auth-integration`: `{ auth:{isAuthenticated,isLoading},
// userInfo:{name?,email?,userId?} }` — userId, NOT id.)
function authedYv(name: string, email: string, userId = "u_123") {
  return {
    auth: { isAuthenticated: true, isLoading: false },
    userInfo: { name, email, userId },
  };
}
function signedOutYv() {
  return {
    auth: { isAuthenticated: false, isLoading: false },
    userInfo: {},
  };
}

describe("parseMockSession — the demo reachability seam", () => {
  it("US-1: maps each scenario to its authed + onboarding + seed shape (demo on)", () => {
    const fresh = parseMockSession("?mock=authed-fresh", true);
    expect(fresh).toEqual({
      scenario: "authed-fresh",
      isAuthed: true,
      hasOnboarded: false, // fresh user → wizard overlays the workspace
      connectionsSeed: "none-linked", // nothing linked yet; the wizard links them
    });

    const returning = parseMockSession("?mock=authed-returning", true);
    expect(returning).toEqual({
      scenario: "authed-returning",
      isAuthed: true,
      hasOnboarded: true,
      connectionsSeed: "wireframe", // github + openrouter connected, gloo not-linked
    });

    const unlinked = parseMockSession("?mock=authed-unlinked", true);
    expect(unlinked).toEqual({
      scenario: "authed-unlinked",
      isAuthed: true,
      hasOnboarded: true,
      connectionsSeed: "none-linked", // all three not-linked → Connect buttons show
    });
  });

  it("US-2: precedence — with the demo flag OFF, any ?mock= is ignored (prod safety)", () => {
    // The whole point of R1: the override is a no-op unless NEXT_PUBLIC_SUPAGLOO_DEMO
    // is set. Prod passes demoFlag=false → real YV auth is the only path to authed.
    expect(parseMockSession("?mock=authed-returning", false)).toBeNull();
    expect(parseMockSession("?mock=authed-fresh", false)).toBeNull();
  });

  it("US-2b: unknown / absent scenario returns null even with the flag on", () => {
    expect(parseMockSession("?mock=bogus", true)).toBeNull();
    expect(parseMockSession("?mock=", true)).toBeNull();
    expect(parseMockSession("", true)).toBeNull();
    expect(parseMockSession("?other=1", true)).toBeNull();
  });
});

describe("onboarding localStorage stopgap (pure parts)", () => {
  it("US-3a: hasOnboardedFromRaw is true only for the exact '1' sentinel", () => {
    expect(hasOnboardedFromRaw("1")).toBe(true);
    expect(hasOnboardedFromRaw("0")).toBe(false);
    expect(hasOnboardedFromRaw("true")).toBe(false);
    expect(hasOnboardedFromRaw("")).toBe(false);
    expect(hasOnboardedFromRaw(null)).toBe(false);
  });

  it("US-3b: onboardingStorageKey is stable and scoped to the userId", () => {
    const a = onboardingStorageKey("u_123");
    expect(onboardingStorageKey("u_123")).toBe(a); // stable across calls
    expect(a).toContain("u_123"); // userId-scoped
    expect(onboardingStorageKey("u_999")).not.toBe(a); // different user → different key
  });
});

describe("resolveSession — final session (real auth vs demo override)", () => {
  it("US-4a: real authed + onboardedRaw '1' → onboarded, user from yvAuth", () => {
    const session: Session = resolveSession({
      yvAuth: authedYv("Ash Srinivas", "ash@example.com"),
      demoFlag: false,
      search: "",
      onboardedRaw: "1",
    });
    expect(session.isAuthed).toBe(true);
    expect(session.hasOnboarded).toBe(true);
    expect(session.user).toMatchObject({
      name: "Ash Srinivas",
      email: "ash@example.com",
    });
    expect(firstSignIn(session)).toBe(false);
  });

  it("US-4b: real authed with no onboarding record → firstSignIn is true", () => {
    const session = resolveSession({
      yvAuth: authedYv("Ash Srinivas", "ash@example.com"),
      demoFlag: false,
      search: "",
      onboardedRaw: null,
    });
    expect(session.isAuthed).toBe(true);
    expect(session.hasOnboarded).toBe(false);
    expect(firstSignIn(session)).toBe(true);
  });

  it("US-4c: the demo override wins over signed-out YV auth, but only when the flag is set", () => {
    // Flag ON: the ?mock= override forces an authed, onboarded session with the
    // seeded demo identity — even though YV auth is signed out.
    const overridden = resolveSession({
      yvAuth: signedOutYv(),
      demoFlag: true,
      search: "?mock=authed-returning",
      onboardedRaw: null,
    });
    expect(overridden.isAuthed).toBe(true);
    expect(overridden.hasOnboarded).toBe(true);
    expect(overridden.user).toMatchObject({
      name: "Ash Srinivas",
      email: "ash@supagloo.com", // the seeded demo identity (plan D-DATA)
    });

    // Flag OFF: same URL, but the override is inert → the signed-out YV state stands.
    const notOverridden = resolveSession({
      yvAuth: signedOutYv(),
      demoFlag: false,
      search: "?mock=authed-returning",
      onboardedRaw: null,
    });
    expect(notOverridden.isAuthed).toBe(false);
    expect(notOverridden.user).toBeNull();
    expect(firstSignIn(notOverridden)).toBe(false); // not authed → not a first sign-in
  });

  it("US-4d: a fresh demo scenario resolves to a first-sign-in session (wizard territory)", () => {
    const session = resolveSession({
      yvAuth: signedOutYv(),
      demoFlag: true,
      search: "?mock=authed-fresh",
      onboardedRaw: null,
    });
    expect(session.isAuthed).toBe(true);
    expect(session.hasOnboarded).toBe(false);
    expect(firstSignIn(session)).toBe(true);
  });
});
