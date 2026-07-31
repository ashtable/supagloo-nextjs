import { describe, expect, it } from "vitest";

import {
  GUARDRAIL_REDIRECT_MS,
  PROFILE_CONNECTIONS_URL,
  evaluateConnectionGuardrail,
  type GuardrailVerdict,
} from "./connection-guardrail";
import {
  completeConnect,
  seedAllLinked,
  seedNoneLinked,
  type ConnectionsState,
} from "../connections/connections-model";

/**
 * R3 — the create/import connection guardrail, as a pure rule.
 *
 * ## The requirement
 *
 * Creating OR importing a project needs (a) GitHub — it is where the project LIVES — AND
 * (b) at least one of the two model providers, because a project with no model provider can
 * be scaffolded and then never generate anything.
 *
 * ## Why this is a module and not an inline `&&`
 *
 * Six entry points reach the two wizards (two header buttons, the dashed grid card, the
 * import-error card, the landing "Blank canvas", and the `/?newproject=blank` URL deep link
 * that bypasses every click handler). One rule, one module, applied at the single place they
 * converge — memory `one-rule-one-module-many-boundaries` is about exactly this shape, and
 * a per-entry-point check is how you end up guarding five of six.
 *
 * ## The trap this file exists to hold
 *
 * A connections read that FAILED or has not returned is not an answer about the user's data.
 * Reading it as "not connected" would fire R3's modal — and its automatic redirect — at
 * users who are already connected. That exact bug has shipped in this codebase once
 * (memory `a-failed-read-is-not-an-answer-about-the-user-s-data`), and R3's modal is the
 * worst possible place for it because the redirect is involuntary.
 */

const withGithubOnly = (): ConnectionsState =>
  completeConnect(seedNoneLinked(), "github");

const githubAnd = (provider: "openrouter" | "gloo"): ConnectionsState =>
  completeConnect(withGithubOnly(), provider);

/** `resolved: false` models both "the read has not answered yet" and "the read failed" —
 *  they are the same fact (we could not ask) and must produce the same verdict. */
const verdict = (
  connections: ConnectionsState | null,
  resolved: boolean,
): GuardrailVerdict => evaluateConnectionGuardrail(connections, resolved);

describe("evaluateConnectionGuardrail", () => {
  it("U-GR1: no GitHub → blocked, even with both model providers connected", () => {
    // GitHub is where the project lives. Without it, `createRepoAndProject` raises
    // `GithubNotConnectedError` (409) — but only AFTER the user has walked the whole wizard,
    // picked a repo name and chosen a passage. R3 exists to refuse before that walk.
    const noGithub = completeConnect(
      completeConnect(seedNoneLinked(), "openrouter"),
      "gloo",
    );
    const v = verdict(noGithub, true);
    expect(v.kind).toBe("blocked");
  });

  it("U-GR2: GitHub but NO model provider → blocked", () => {
    // Scaffolding would succeed and then the studio could never generate anything: the
    // storyboard button, every reroll, narration and music all need a provider. A project
    // you cannot generate into is not a project.
    expect(verdict(withGithubOnly(), true).kind).toBe("blocked");
  });

  it("U-GR3: GitHub + OpenRouter alone → allowed", () => {
    expect(verdict(githubAnd("openrouter"), true).kind).toBe("allowed");
  });

  it("U-GR4: GitHub + Gloo alone → allowed", () => {
    // "At least ONE of the two" is the requirement, not both. A Gloo-only user has image
    // and script generation (R7), which is enough to make a project worth creating.
    expect(verdict(githubAnd("gloo"), true).kind).toBe("allowed");
  });

  it("U-GR4b: everything connected → allowed", () => {
    expect(verdict(seedAllLinked(), true).kind).toBe("allowed");
  });

  it("U-GR5: an UNRESOLVED or FAILED read is ALLOWED, never blocked", () => {
    // The decisive case. `ConnectionsState` is seeded not-linked and only ever hydrated
    // UPWARDS (`applyConnectionsBase` never sets not-linked, and the hydrate effect returns
    // early on failure), so the seeded object is indistinguishable from a genuine
    // zero-connection account. Blocking on it would fire an involuntary redirect at a
    // connected user whose network blipped.
    //
    // The cost of being wrong the other way is bounded and already handled: the api still
    // raises `GithubNotConnectedError` (409), and R5/R7's new `provider_not_connected` (409)
    // covers the model-provider half. An unnecessary wizard-open is recoverable; an
    // unnecessary redirect off the page is not.
    expect(verdict(seedNoneLinked(), false).kind).toBe("allowed");
    expect(verdict(null, false).kind).toBe("allowed");
    // …and the same state, once RESOLVED, is blocked — otherwise this test would pass for a
    // guardrail that never blocks anything.
    expect(verdict(seedNoneLinked(), true).kind).toBe("blocked");
  });

  it("U-GR6: a blocked verdict names exactly which requirements are unmet", () => {
    // The modal lifts 11a's three requirement rows and shows LIVE state on each. It cannot
    // do that from a boolean, and re-deriving per row in the component would put a second
    // copy of the rule in the view.
    const onlyGithub = evaluateConnectionGuardrail(withGithubOnly(), true);
    expect(onlyGithub).toEqual({
      kind: "blocked",
      github: true,
      openrouter: false,
      gloo: false,
      needsGithub: false,
      needsModelProvider: true,
    });

    const nothing = evaluateConnectionGuardrail(seedNoneLinked(), true);
    expect(nothing).toEqual({
      kind: "blocked",
      github: false,
      openrouter: false,
      gloo: false,
      needsGithub: true,
      needsModelProvider: true,
    });
  });
});

describe("the redirect target", () => {
  it("U-GR7: is a STATIC route + fragment, never a guessed identifier", () => {
    // A prior run shipped an auto-redirect onto a client-GUESSED project slug and had to fix
    // it (memory `wizard-ready-card-redirect-needs-a-confirmed-slug`): an automatic
    // navigation turns a latent 404 into an unavoidable one. `/profile#connections` is a
    // fixed route this app owns, so there is nothing to guess.
    expect(PROFILE_CONNECTIONS_URL).toBe("/profile#connections");
  });

  it("U-GR8: the auto-redirect delay is a named constant, long enough to read the modal", () => {
    // The design's only auto-redirect vocabulary is 12a's static "Redirecting
    // automatically…" caption at `READY_REDIRECT_MS = 2500` — no countdown ring. This
    // reuses that idea, but the modal has three requirement rows and an info strip to read,
    // so it is deliberately longer than the ready card's.
    expect(GUARDRAIL_REDIRECT_MS).toBeGreaterThanOrEqual(2500);
    expect(GUARDRAIL_REDIRECT_MS).toBeLessThanOrEqual(15_000);
  });
});
