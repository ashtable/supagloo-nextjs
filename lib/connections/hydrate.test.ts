import { describe, expect, it } from "vitest";

import { applyConnectionsBase, readConnectionsBase } from "./hydrate";
import { beginConnect, seedNoneLinked } from "./connections-model";

const CHECKING = "Checking credits…";

/** A `GET /api/connections` body with every provider connected. */
const allConnected = {
  github: { githubLogin: "ashtable" },
  openrouter: { keyLast4: "77d7" },
  gloo: { clientId: "7qh77jbv2r46hmfi9ifslu2sbj" },
};

describe("readConnectionsBase", () => {
  it("answers all three providers from ONE body, with no network access", () => {
    // The property the whole fix rests on. Because connectedness for every provider is
    // already in this one response, no provider's answer has any reason to wait on
    // another provider's network call.
    expect(readConnectionsBase(allConnected)).toEqual({
      ghUsername: "@ashtable",
      orMaskedKey: "sk-or-••••••77d7",
      glClientId: "7qh77jbv2r46hmfi9ifslu2sbj",
    });
  });

  it("reports each provider independently", () => {
    expect(readConnectionsBase({ gloo: { clientId: "abc" } })).toEqual({
      ghUsername: null,
      orMaskedKey: null,
      glClientId: "abc",
    });
  });

  it("treats a missing/!junk body as nothing connected", () => {
    for (const body of [null, undefined, {}, "nope", 7]) {
      expect(readConnectionsBase(body)).toEqual({
        ghUsername: null,
        orMaskedKey: null,
        glClientId: null,
      });
    }
  });
});

describe("applyConnectionsBase", () => {
  it("connects ALL THREE in a single application", () => {
    // The regression. Gloo used to be applied only after `await fetchGithubRepoCount()`
    // and `await fetchOpenRouterCreditsLabel()` — and in production the repo-count call
    // measures 6.3–7.1s (847 repos), so a connected Gloo rendered as NOT CONNECTED for
    // ~7s after every reload and then flipped for no visible reason.
    const next = applyConnectionsBase(
      seedNoneLinked(),
      readConnectionsBase(allConnected),
      CHECKING,
    );
    expect(next.github.status).toBe("connected");
    expect(next.openrouter.status).toBe("connected");
    expect(next.gloo.status).toBe("connected");
  });

  it("connects Gloo even when GitHub and OpenRouter are absent from the body", () => {
    // Gloo carries no decoration of its own, so nothing about it can ever justify
    // deferring it behind another provider.
    const next = applyConnectionsBase(
      seedNoneLinked(),
      readConnectionsBase({ gloo: { clientId: "abc" } }),
      CHECKING,
    );
    expect(next.gloo.status).toBe("connected");
    expect(next.github.status).not.toBe("connected");
  });

  it("stamps the credit placeholder the live backfill later replaces", () => {
    const next = applyConnectionsBase(
      seedNoneLinked(),
      readConnectionsBase(allConnected),
      CHECKING,
    );
    expect(next.openrouter.detail?.credit).toBe(CHECKING);
  });

  it("never clobbers an in-flight pending connect", () => {
    // An optimistic connect the user just started outranks a read that began before it.
    const pendingGloo = beginConnect(seedNoneLinked(), "gloo");
    const next = applyConnectionsBase(
      pendingGloo,
      readConnectionsBase(allConnected),
      CHECKING,
    );
    expect(next.gloo.status).toBe("pending");
    // …and the others still hydrate; one pending provider does not stall the rest.
    expect(next.github.status).toBe("connected");
    expect(next.openrouter.status).toBe("connected");
  });

  it("never sets a provider to not-linked (it hydrates, it does not disconnect)", () => {
    const alreadyConnected = applyConnectionsBase(
      seedNoneLinked(),
      readConnectionsBase(allConnected),
      CHECKING,
    );
    // A later read that reports nothing must leave the connected cards alone.
    const next = applyConnectionsBase(
      alreadyConnected,
      readConnectionsBase({}),
      CHECKING,
    );
    expect(next.github.status).toBe("connected");
    expect(next.openrouter.status).toBe("connected");
    expect(next.gloo.status).toBe("connected");
  });

  it("returns the state unchanged when nothing is connected", () => {
    const seed = seedNoneLinked();
    expect(applyConnectionsBase(seed, readConnectionsBase({}), CHECKING)).toBe(seed);
  });
});
