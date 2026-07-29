/**
 * Turning ONE `GET /api/connections` read into every provider's connected state.
 *
 * Extracted from `SessionProvider`'s hydration effect because the ordering here is
 * load-bearing and was previously only implied by the order of `await`s. The effect
 * used to run github → await repo count → openrouter → await credits → gloo, so a
 * provider's answer waited on network calls belonging to OTHER providers. In production
 * `GET /v1/github/repos?filter=all` measures 6.3–7.1s (847 repos, ~9 pages) while every
 * other endpoint is single- or double-digit ms — so a returning user with Gloo connected
 * watched its card render NOT CONNECTED for ~7 seconds after every hard reload, then saw
 * it flip with no visible cause. Nothing was wrong with Gloo; it was last in a queue
 * behind a repo count nobody was waiting on.
 *
 * The rule this module encodes: **the read answers connectedness for all three, so all
 * three are applied together, before any decoration is fetched.** Repo count and credit
 * label are labels on an already-correct card and belong strictly after this.
 */
import {
  connectGithub,
  connectGloo,
  connectOpenRouter,
  type ConnectionsState,
} from "./connections-model";
import { githubSnapshotFromConnections, githubUsername } from "./github-connect";
import {
  maskOpenRouterKey,
  openrouterSnapshotFromConnections,
} from "./openrouter-connect";
import { glooSnapshotFromConnections } from "./gloo-connect";

/**
 * The display-ready identity each connected provider contributes, or null where the
 * body says "not connected". Derived with no network access whatsoever — that is the
 * property that makes applying all three together possible.
 */
export interface ConnectionsBase {
  ghUsername: string | null;
  orMaskedKey: string | null;
  glClientId: string | null;
}

/** Read all three providers out of one `/api/connections` body. */
export function readConnectionsBase(body: unknown): ConnectionsBase {
  const gh = githubSnapshotFromConnections(body);
  const or = openrouterSnapshotFromConnections(body);
  const gl = glooSnapshotFromConnections(body);
  return {
    ghUsername: gh.connected && gh.login ? githubUsername(gh.login) : null,
    orMaskedKey: or.connected && or.keyLast4 ? maskOpenRouterKey(or.keyLast4) : null,
    glClientId: gl.connected && gl.clientId ? gl.clientId : null,
  };
}

/**
 * Apply the base state for every provider the read reported as connected.
 *
 * Two invariants, both pre-existing and both preserved:
 *  - an in-flight `pending` is never clobbered (an optimistic connect outranks a read
 *    that started before it), and
 *  - nothing is ever set to NOT-linked here; this hydrates, it does not disconnect.
 *
 * `creditPlaceholder` is the "checking…" label the live-credits backfill replaces.
 */
export function applyConnectionsBase(
  state: ConnectionsState,
  base: ConnectionsBase,
  creditPlaceholder: string,
): ConnectionsState {
  let next = state;
  if (base.ghUsername && next.github.status !== "pending") {
    next = connectGithub(next, { username: base.ghUsername, repos: 0 });
  }
  if (base.orMaskedKey && next.openrouter.status !== "pending") {
    next = connectOpenRouter(next, {
      maskedKey: base.orMaskedKey,
      credit: creditPlaceholder,
    });
  }
  if (base.glClientId && next.gloo.status !== "pending") {
    next = connectGloo(next, {
      method: "CLIENT CREDENTIALS",
      clientId: base.glClientId,
    });
  }
  return next;
}
