import type { ConnectionsState } from "../connections/connections-model";

/**
 * R3 — the create/import connection guardrail, as a pure rule.
 *
 * ## The requirement
 *
 * Creating OR importing a project needs (a) a GitHub connection — it is where the project
 * LIVES — AND (b) at least ONE of the two model providers, because a project that can be
 * scaffolded but never generated into is not a project.
 *
 * ## Why a module rather than an inline `&&` at the launcher
 *
 * SIX entry points reach the two wizards: the two header buttons, the dashed grid card, the
 * import-error card's "Start new project", the landing "Blank canvas", and the
 * `/?newproject=blank` URL deep link that bypasses every click handler. A per-entry-point
 * check is how you end up guarding five of six. One rule, one module, applied where they
 * converge.
 *
 * ## What was there before
 *
 * Nothing. The only refusal was `GithubNotConnectedError` (409) raised inside
 * `RepoProvisioningService.createRepoAndProject` — i.e. AFTER the user had walked the whole
 * wizard, named a repo and chosen a passage. And nothing at all checked for a model
 * provider at create time.
 */

/** The profile section holding the three connection cards.
 *
 *  A STATIC route + fragment, deliberately. A prior run shipped an auto-redirect onto a
 *  client-GUESSED project slug and had to fix it: an automatic navigation turns a latent
 *  404 into an unavoidable one, because the user never chose to go there and cannot tell
 *  what went wrong. There is nothing to guess here. */
export const PROFILE_CONNECTIONS_URL = "/profile#connections";

/**
 * How long the modal stays up before taking the user there itself.
 *
 * The design owns exactly one auto-redirect vocabulary — 12a's static
 * "Redirecting automatically…" caption at `READY_REDIRECT_MS = 2500`, with no countdown
 * ring — and this reuses the idea rather than inventing a new control. It is deliberately
 * LONGER than the ready card's: that card says four words over a finished action, while
 * this one has three requirement rows and an info strip that the user has to actually read
 * for the destination to make sense.
 */
export const GUARDRAIL_REDIRECT_MS = 6000;

export interface GuardrailVerdict {
  kind: "allowed" | "blocked";
  /** LIVE per-provider state, so the modal can render one honest row each without
   *  re-deriving the rule in the view. */
  github: boolean;
  openrouter: boolean;
  gloo: boolean;
  /** Which half of the requirement is unmet. Both can be true. */
  needsGithub: boolean;
  needsModelProvider: boolean;
}

const isConnected = (
  connections: ConnectionsState | null,
  provider: "github" | "openrouter" | "gloo",
): boolean => connections?.[provider]?.status === "connected";

/**
 * May this user open a project wizard?
 *
 * ## `resolved === false` ⇒ ALLOWED, and that is the important half
 *
 * A `GET /api/connections` read that failed, or has not returned yet, is NOT an answer
 * about the user's data. `ConnectionsState` cannot tell the two apart on its own: it is
 * seeded not-linked, `applyConnectionsBase` never sets not-linked, and the hydrate effect
 * returns early on failure — so the seeded object is byte-identical to a genuine
 * zero-connection account. Reading it as "not connected" would fire this modal, AND its
 * involuntary redirect, at users who are already connected. That exact bug has shipped in
 * this codebase once.
 *
 * The cost of being wrong in the permissive direction is bounded and already covered: the
 * api still raises `GithubNotConnectedError` (409) on scaffold, and R5/R7's new
 * `provider_not_connected` (409) covers the model-provider half. An unnecessary
 * wizard-open is recoverable. An unnecessary redirect off the page is not.
 *
 * Derive this at RENDER time from the current state — never decide it inside a click
 * handler. The `/?newproject=blank` deep link opens on mount, BEFORE connections resolve;
 * a handler-time decision would answer with whatever was known at click time and never
 * revisit it.
 */
export function evaluateConnectionGuardrail(
  connections: ConnectionsState | null,
  resolved: boolean,
): GuardrailVerdict {
  const github = isConnected(connections, "github");
  const openrouter = isConnected(connections, "openrouter");
  const gloo = isConnected(connections, "gloo");

  if (!resolved || !connections) {
    return {
      kind: "allowed",
      github,
      openrouter,
      gloo,
      needsGithub: false,
      needsModelProvider: false,
    };
  }

  const needsGithub = !github;
  const needsModelProvider = !openrouter && !gloo;

  return {
    kind: needsGithub || needsModelProvider ? "blocked" : "allowed",
    github,
    openrouter,
    gloo,
    needsGithub,
    needsModelProvider,
  };
}
