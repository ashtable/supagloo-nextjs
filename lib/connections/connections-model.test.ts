import { describe, expect, it } from "vitest";

// `./connections-model` does not exist yet — RED until Step 9 creates
// `lib/connections/connections-model.ts`.
//
// This is the ONE connections domain that 10a's status strip, 10b's cards, AND
// the 11b/11c modals + wizard steps all read and dispatch (plan §1.2 "same state,
// different entry point"). Pure, immutable, studio-reducer style.
import {
  seedWireframe,
  seedNoneLinked,
  seedAllLinked,
  beginConnect,
  completeConnect,
  disconnect,
  stripItems,
  cardModel,
  MOCK_OAUTH_DELAY_MS,
  type ConnectionsState,
} from "./connections-model";

describe("seeds", () => {
  it("UC-1a: seedWireframe = github + openrouter connected (with detail), gloo not-linked", () => {
    const s = seedWireframe();

    expect(s.github.status).toBe("connected");
    expect(s.github.detail).toEqual({ username: "@ashsrinivas", repos: 12 });

    expect(s.openrouter.status).toBe("connected");
    expect(s.openrouter.detail).toEqual({
      maskedKey: "sk-or-••••••4f2a",
      credit: "$18.40 credit remaining",
    });

    expect(s.gloo.status).toBe("not-linked");
    expect(s.gloo.detail).toBeUndefined(); // detail present only when connected
  });

  it("UC-1b: seedNoneLinked = all three not-linked, no detail", () => {
    const s = seedNoneLinked();
    for (const p of ["github", "openrouter", "gloo"] as const) {
      expect(s[p].status).toBe("not-linked");
      expect(s[p].detail).toBeUndefined();
    }
  });

  it("UC-1c: seedAllLinked = all three connected, each with its detail", () => {
    const s = seedAllLinked();
    expect(s.github.status).toBe("connected");
    expect(s.openrouter.status).toBe("connected");
    expect(s.gloo.status).toBe("connected");
    expect(s.gloo.detail).toEqual({ method: "CLIENT CREDENTIALS" });
  });
});

describe("reducer — begin / complete / disconnect (immutable)", () => {
  it("UC-2a: beginConnect flips only the target to pending and does not mutate input", () => {
    const s = seedNoneLinked();
    const next = beginConnect(s, "github");

    expect(next.github.status).toBe("pending");
    // siblings untouched
    expect(next.openrouter.status).toBe("not-linked");
    expect(next.gloo.status).toBe("not-linked");
    // input not mutated (immutability)
    expect(s.github.status).toBe("not-linked");
    expect(next).not.toBe(s);
  });

  it("UC-2b: completeConnect marks connected and fills the provider-specific mock detail", () => {
    const gh = completeConnect(beginConnect(seedNoneLinked(), "github"), "github");
    expect(gh.github.status).toBe("connected");
    expect(gh.github.detail).toEqual({ username: "@ashsrinivas", repos: 12 });

    const or = completeConnect(seedNoneLinked(), "openrouter");
    expect(or.openrouter.status).toBe("connected");
    expect(or.openrouter.detail).toEqual({
      maskedKey: "sk-or-••••••4f2a",
      credit: "$18.40 credit remaining",
    });

    const gloo = completeConnect(seedNoneLinked(), "gloo");
    expect(gloo.gloo.status).toBe("connected");
    expect(gloo.gloo.detail).toEqual({ method: "CLIENT CREDENTIALS" });
  });

  it("UC-2c: disconnect returns to not-linked and clears the detail", () => {
    const s: ConnectionsState = seedWireframe();
    const next = disconnect(s, "github");
    expect(next.github.status).toBe("not-linked");
    expect(next.github.detail).toBeUndefined();
    // input untouched
    expect(s.github.status).toBe("connected");
  });

  it("UC-2d: MOCK_OAUTH_DELAY_MS is a small positive constant (the mocked OAuth flight time)", () => {
    expect(typeof MOCK_OAUTH_DELAY_MS).toBe("number");
    expect(MOCK_OAUTH_DELAY_MS).toBeGreaterThan(0);
    expect(MOCK_OAUTH_DELAY_MS).toBeLessThan(2000);
  });
});

describe("stripItems — 10a's compact provider status rows", () => {
  it("UC-3: renders connected rows with a green dot and the not-linked row with a Link affordance", () => {
    const items = stripItems(seedWireframe());
    const by = (provider: string) => items.find((i) => i.provider === provider)!;

    expect(by("github")).toMatchObject({
      label: "GitHub",
      sub: "@ashsrinivas · connected",
      dotColor: "#2f8f4e", // success green
      linkLabel: null,
    });
    expect(by("openrouter")).toMatchObject({
      label: "OpenRouter",
      sub: "Premium models · connected",
      dotColor: "#2f8f4e",
    });
    expect(by("gloo")).toMatchObject({
      label: "Gloo AI",
      sub: "Not linked — add credentials",
      dotColor: null,
      linkLabel: "Link ▸",
    });
  });
});

describe("cardModel — 10b's full card view-model (one renderer, all states)", () => {
  it("UC-4a: gloo not-linked → inline gloo-form body, CLIENT CREDENTIALS badge, Save & verify", () => {
    const m = cardModel(seedWireframe(), "gloo");
    expect(m.status).toBe("not-linked");
    expect(m.pillText).toBe("Not linked");
    expect(m.badge).toBe("CLIENT CREDENTIALS");
    expect(m.body).toBe("gloo-form");
    expect(m.actionLabel).toBe("Save & verify");
    expect(m.opensModal).toBeNull(); // gloo connects inline, no modal
  });

  it("UC-4b: gloo connected → detail body + Disconnect (inferred by symmetry, ambiguity #5)", () => {
    const connected = completeConnect(seedWireframe(), "gloo");
    const m = cardModel(connected, "gloo");
    expect(m.status).toBe("connected");
    expect(m.pillText).toBe("Connected");
    expect(m.body).toBe("detail");
    expect(m.actionLabel).toBe("Disconnect");
  });

  it("UC-4c: github not-linked → Connect button that opens the 11b modal", () => {
    const m = cardModel(seedNoneLinked(), "github");
    expect(m.status).toBe("not-linked");
    expect(m.pillText).toBe("Not linked");
    expect(m.actionLabel).toBe("Connect");
    expect(m.body).toBe("connect");
    expect(m.opensModal).toBe("github");
  });

  it("UC-4d: openrouter connected → detail body, Disconnect, PKCE OAUTH badge", () => {
    const m = cardModel(seedWireframe(), "openrouter");
    expect(m.status).toBe("connected");
    expect(m.title).toBe("OpenRouter.ai");
    expect(m.pillText).toBe("Connected");
    expect(m.badge).toBe("PKCE OAUTH");
    expect(m.body).toBe("detail");
    expect(m.actionLabel).toBe("Disconnect");
  });

  it("UC-4e: openrouter not-linked → Connect button that opens the 11c modal", () => {
    const m = cardModel(seedNoneLinked(), "openrouter");
    expect(m.actionLabel).toBe("Connect");
    expect(m.opensModal).toBe("openrouter");
  });
});
