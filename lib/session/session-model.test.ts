import { describe, expect, it } from "vitest";

// Task 23 rewires this pure seam from a localStorage onboarding stopgap to
// SERVER-DRIVEN state: `resolveSession` now takes a `serverUser` (the AuthUser
// from `GET /api/me` / the session exchange) whose `onboardingCompletedAt` decides
// `hasOnboarded`, replacing the retired `onboardedRaw` localStorage input. The
// `?mock=` reachability seam is UNCHANGED (pure client, zero network) so the
// existing pure-UI e2e specs keep passing; a NEW `?seed=` parser drives the
// extended real-cookie seam.
import {
  parseMockSession,
  parseSeedRequest,
  resolveSession,
  firstSignIn,
  hasOnboardedFromServer,
  type Session,
} from "./session-model";

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

function serverUser(onboardingCompletedAt: string | null) {
  return {
    displayName: "Grace Hopper",
    email: "grace@example.com",
    onboardingCompletedAt,
  };
}

describe("parseMockSession — the pure-client reachability seam (UNCHANGED)", () => {
  it("maps each scenario to its authed + onboarding + seed shape (demo on)", () => {
    expect(parseMockSession("?mock=authed-fresh", true)).toEqual({
      scenario: "authed-fresh",
      isAuthed: true,
      hasOnboarded: false,
      connectionsSeed: "none-linked",
    });
    expect(parseMockSession("?mock=authed-returning", true)).toEqual({
      scenario: "authed-returning",
      isAuthed: true,
      hasOnboarded: true,
      connectionsSeed: "wireframe",
    });
    expect(parseMockSession("?mock=authed-unlinked", true)).toEqual({
      scenario: "authed-unlinked",
      isAuthed: true,
      hasOnboarded: true,
      connectionsSeed: "none-linked",
    });
  });

  it("with the demo flag OFF, any ?mock= is ignored (prod safety)", () => {
    expect(parseMockSession("?mock=authed-returning", false)).toBeNull();
    expect(parseMockSession("?mock=authed-fresh", false)).toBeNull();
  });

  it("unknown / absent scenario returns null even with the flag on", () => {
    expect(parseMockSession("?mock=bogus", true)).toBeNull();
    expect(parseMockSession("?mock=", true)).toBeNull();
    expect(parseMockSession("", true)).toBeNull();
    expect(parseMockSession("?other=1", true)).toBeNull();
  });
});

describe("parseSeedRequest — the extended real-cookie seam (NEW)", () => {
  it("parses ?seed=<scenario> to its scenario + connections seed (demo on)", () => {
    expect(parseSeedRequest("?seed=authed-fresh", true)).toEqual({
      scenario: "authed-fresh",
      connectionsSeed: "none-linked",
    });
    expect(parseSeedRequest("?seed=authed-returning", true)).toEqual({
      scenario: "authed-returning",
      connectionsSeed: "wireframe",
    });
  });

  it("is a HARD no-op without the client demo flag", () => {
    expect(parseSeedRequest("?seed=authed-fresh", false)).toBeNull();
  });

  it("ignores an unknown/absent seed and never treats ?mock= as a seed", () => {
    expect(parseSeedRequest("?seed=bogus", true)).toBeNull();
    expect(parseSeedRequest("?seed=", true)).toBeNull();
    expect(parseSeedRequest("", true)).toBeNull();
    expect(parseSeedRequest("?mock=authed-fresh", true)).toBeNull();
  });
});

describe("hasOnboardedFromServer — server truth replaces localStorage", () => {
  it("is true only when the server user carries a non-null onboardingCompletedAt", () => {
    expect(hasOnboardedFromServer(serverUser("2026-07-20T00:00:00.000Z"))).toBe(true);
    expect(hasOnboardedFromServer(serverUser(null))).toBe(false);
    expect(hasOnboardedFromServer(null)).toBe(false);
  });
});

describe("resolveSession — final session (mock override, server state, YV auth)", () => {
  it("server user with onboardingCompletedAt set → onboarded, user from server fields", () => {
    const session: Session = resolveSession({
      yvAuth: authedYv("YV Name", "yv@example.com"),
      demoFlag: false,
      search: "",
      serverUser: serverUser("2026-07-20T00:00:00.000Z"),
    });
    expect(session.isAuthed).toBe(true);
    expect(session.hasOnboarded).toBe(true);
    // derived from the SERVER user (displayName/email), not the YV userInfo
    expect(session.user).toMatchObject({ name: "Grace Hopper", email: "grace@example.com" });
    expect(firstSignIn(session)).toBe(false);
  });

  it("server user with a null onboardingCompletedAt → firstSignIn (wizard territory)", () => {
    const session = resolveSession({
      yvAuth: authedYv("YV Name", "yv@example.com"),
      demoFlag: false,
      search: "",
      serverUser: serverUser(null),
    });
    expect(session.isAuthed).toBe(true);
    expect(session.hasOnboarded).toBe(false);
    expect(firstSignIn(session)).toBe(true);
  });

  it("YV authed but no server user yet (pre-exchange) → authed, not-yet-onboarded", () => {
    const session = resolveSession({
      yvAuth: authedYv("Ash Srinivas", "ash@example.com"),
      demoFlag: false,
      search: "",
      serverUser: null,
    });
    expect(session.isAuthed).toBe(true);
    expect(session.user).toMatchObject({ name: "Ash Srinivas", email: "ash@example.com" });
    expect(session.hasOnboarded).toBe(false);
  });

  it("signed out with no server user → signed out", () => {
    const session = resolveSession({
      yvAuth: signedOutYv(),
      demoFlag: false,
      search: "",
      serverUser: null,
    });
    expect(session.isAuthed).toBe(false);
    expect(session.user).toBeNull();
    expect(firstSignIn(session)).toBe(false);
  });

  it("the demo ?mock= override wins over server/YV state, but only with the flag set", () => {
    const overridden = resolveSession({
      yvAuth: signedOutYv(),
      demoFlag: true,
      search: "?mock=authed-returning",
      serverUser: null,
    });
    expect(overridden.isAuthed).toBe(true);
    expect(overridden.hasOnboarded).toBe(true);
    expect(overridden.user).toMatchObject({ name: "Ash Srinivas", email: "ash@supagloo.com" });

    const notOverridden = resolveSession({
      yvAuth: signedOutYv(),
      demoFlag: false,
      search: "?mock=authed-returning",
      serverUser: null,
    });
    expect(notOverridden.isAuthed).toBe(false);
    expect(notOverridden.user).toBeNull();
  });

  it("a fresh ?mock= demo scenario still resolves to a first-sign-in session", () => {
    const session = resolveSession({
      yvAuth: signedOutYv(),
      demoFlag: true,
      search: "?mock=authed-fresh",
      serverUser: null,
    });
    expect(session.isAuthed).toBe(true);
    expect(session.hasOnboarded).toBe(false);
    expect(firstSignIn(session)).toBe(true);
  });
});
