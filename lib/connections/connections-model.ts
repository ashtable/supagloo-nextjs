/**
 * The ONE connections domain (plan §1.2 "same state, different entry point").
 * 10a's provider status strip, 10b's connection cards, AND the 11b/11c connect
 * modals + wizard steps all read and dispatch this pure, immutable,
 * studio-reducer-style model. No React, no network — "connecting" is a mocked
 * OAuth transition (`beginConnect` → pending, then a caller-owned timer calls
 * `completeConnect` → connected).
 */

export type Provider = "github" | "openrouter" | "gloo";
export type ConnectionStatus = "connected" | "not-linked" | "pending";

export interface ProviderDetails {
  github: { username: string; repos: number };
  openrouter: { maskedKey: string; credit: string };
  // `clientId` is the real stored plaintext (Task #25); absent for the mock seed.
  gloo: { method: string; clientId?: string };
}

export interface ProviderConnection<P extends Provider = Provider> {
  provider: P;
  status: ConnectionStatus;
  /** Connected-state display data. Present only when `status === "connected"`. */
  detail?: ProviderDetails[P];
}

export type ConnectionsState = {
  [P in Provider]: ProviderConnection<P>;
};

// The mocked OAuth flight time — a small, exported constant so callers (the
// `SessionProvider`) can schedule the pending→connected transition, and E2E
// can assert the synchronous `pending` phase before polling past it.
export const MOCK_OAUTH_DELAY_MS = 350;

const GITHUB_DETAIL: ProviderDetails["github"] = {
  username: "@ashsrinivas",
  repos: 12,
};
const OPENROUTER_DETAIL: ProviderDetails["openrouter"] = {
  maskedKey: "sk-or-••••••4f2a",
  credit: "$18.40 credit remaining",
};
const GLOO_DETAIL: ProviderDetails["gloo"] = { method: "CLIENT CREDENTIALS" };

function notLinked<P extends Provider>(provider: P): ProviderConnection<P> {
  return { provider, status: "not-linked" };
}

export function seedNoneLinked(): ConnectionsState {
  return {
    github: notLinked("github"),
    openrouter: notLinked("openrouter"),
    gloo: notLinked("gloo"),
  };
}

export function seedWireframe(): ConnectionsState {
  return {
    github: { provider: "github", status: "connected", detail: GITHUB_DETAIL },
    openrouter: {
      provider: "openrouter",
      status: "connected",
      detail: OPENROUTER_DETAIL,
    },
    gloo: notLinked("gloo"),
  };
}

export function seedAllLinked(): ConnectionsState {
  return {
    github: { provider: "github", status: "connected", detail: GITHUB_DETAIL },
    openrouter: {
      provider: "openrouter",
      status: "connected",
      detail: OPENROUTER_DETAIL,
    },
    gloo: { provider: "gloo", status: "connected", detail: GLOO_DETAIL },
  };
}

/** Flip `provider` to `pending`. Immutable — siblings and the input untouched. */
export function beginConnect(
  state: ConnectionsState,
  provider: Provider,
): ConnectionsState {
  switch (provider) {
    case "github":
      return { ...state, github: { ...state.github, status: "pending" } };
    case "openrouter":
      return {
        ...state,
        openrouter: { ...state.openrouter, status: "pending" },
      };
    case "gloo":
      return { ...state, gloo: { ...state.gloo, status: "pending" } };
  }
}

/** Flip `provider` to `connected`, filling its mock detail. Immutable. */
export function completeConnect(
  state: ConnectionsState,
  provider: Provider,
): ConnectionsState {
  switch (provider) {
    case "github":
      return {
        ...state,
        github: { provider: "github", status: "connected", detail: GITHUB_DETAIL },
      };
    case "openrouter":
      return {
        ...state,
        openrouter: {
          provider: "openrouter",
          status: "connected",
          detail: OPENROUTER_DETAIL,
        },
      };
    case "gloo":
      return {
        ...state,
        gloo: { provider: "gloo", status: "connected", detail: GLOO_DETAIL },
      };
  }
}

/**
 * Flip github to `connected` with a REAL, caller-supplied detail (`@<githubLogin>`
 * + the live repo count the BFF resolved). Task #24's real-flow counterpart to
 * `completeConnect("github")`: the reducer is kept pure ("keep the reducer",
 * §5.3) — only the detail source changes from the hardcoded mock to real data.
 * `completeConnect` still serves the mocked openrouter/gloo. Immutable.
 */
export function connectGithub(
  state: ConnectionsState,
  detail: ProviderDetails["github"],
): ConnectionsState {
  return {
    ...state,
    github: { provider: "github", status: "connected", detail },
  };
}

/**
 * Flip openrouter to `connected` with a REAL detail (Task #25, §5.3/§9-Q5): the
 * masked key (`sk-or-••••••{keyLast4}`) + the LIVE credit label (§2.4, fetched, not
 * stored). Real-flow counterpart to `completeConnect("openrouter")`, which still
 * serves the mock seed. Immutable.
 */
export function connectOpenRouter(
  state: ConnectionsState,
  detail: ProviderDetails["openrouter"],
): ConnectionsState {
  return {
    ...state,
    openrouter: { provider: "openrouter", status: "connected", detail },
  };
}

/**
 * Flip gloo to `connected` with a REAL detail (Task #25, §2.5): the plaintext
 * `clientId` the API stored (the secret is never exposed). Real-flow counterpart to
 * `completeConnect("gloo")`. Immutable.
 */
export function connectGloo(
  state: ConnectionsState,
  detail: ProviderDetails["gloo"],
): ConnectionsState {
  return {
    ...state,
    gloo: { provider: "gloo", status: "connected", detail },
  };
}

/** Flip `provider` back to `not-linked`, clearing its detail. Immutable. */
export function disconnect(
  state: ConnectionsState,
  provider: Provider,
): ConnectionsState {
  switch (provider) {
    case "github":
      return { ...state, github: notLinked("github") };
    case "openrouter":
      return { ...state, openrouter: notLinked("openrouter") };
    case "gloo":
      return { ...state, gloo: notLinked("gloo") };
  }
}

// ── Derivations — one place decides connected/not-linked/pending presentation ──

export interface StripItem {
  provider: Provider;
  label: string;
  sub: string;
  dotColor: string | null;
  linkLabel: string | null;
}

const SUCCESS_GREEN = "#2f8f4e";
const STRIP_LABELS: Record<Provider, string> = {
  github: "GitHub",
  openrouter: "OpenRouter",
  gloo: "Gloo AI",
};
const STRIP_ORDER: readonly Provider[] = ["github", "openrouter", "gloo"];

/** 10a's three compact provider status rows. */
export function stripItems(state: ConnectionsState): StripItem[] {
  return STRIP_ORDER.map((provider) => {
    const conn = state[provider];
    const label = STRIP_LABELS[provider];

    if (conn.status === "connected") {
      const sub =
        provider === "github"
          ? `${(conn.detail as ProviderDetails["github"]).username} · connected`
          : provider === "openrouter"
            ? "Premium models · connected"
            : "Connected";
      return { provider, label, sub, dotColor: SUCCESS_GREEN, linkLabel: null };
    }

    if (conn.status === "pending") {
      return { provider, label, sub: "Connecting…", dotColor: null, linkLabel: null };
    }

    // not-linked
    const sub =
      provider === "gloo" ? "Not linked — add credentials" : "Not linked";
    return { provider, label, sub, dotColor: null, linkLabel: "Link ▸" };
  });
}

export type CardBody = "detail" | "connect" | "gloo-form";

export interface CardModel {
  provider: Provider;
  title: string;
  status: ConnectionStatus;
  pillText: string;
  badge: string | null;
  body: CardBody;
  actionLabel: string;
  /** Which standalone connect modal (11b/11c) a not-linked Connect opens, if any. */
  opensModal: "github" | "openrouter" | null;
}

const CARD_TITLES: Record<Provider, string> = {
  github: "GitHub",
  openrouter: "OpenRouter.ai",
  gloo: "Gloo AI",
};
const CARD_BADGES: Record<Provider, string | null> = {
  github: null,
  openrouter: "PKCE OAUTH",
  gloo: "CLIENT CREDENTIALS",
};

/** 10b's full card view-model — one renderer, all states. */
export function cardModel(state: ConnectionsState, provider: Provider): CardModel {
  const conn = state[provider];
  const title = CARD_TITLES[provider];
  const badge = CARD_BADGES[provider];

  if (conn.status === "connected") {
    return {
      provider,
      title,
      status: "connected",
      pillText: "Connected",
      badge,
      body: "detail",
      actionLabel: "Disconnect",
      opensModal: null,
    };
  }

  if (conn.status === "pending") {
    return {
      provider,
      title,
      status: "pending",
      pillText: "Connecting…",
      badge,
      body: provider === "gloo" ? "gloo-form" : "connect",
      actionLabel: "Connecting…",
      opensModal: null,
    };
  }

  // not-linked
  if (provider === "gloo") {
    return {
      provider,
      title,
      status: "not-linked",
      pillText: "Not linked",
      badge,
      body: "gloo-form",
      actionLabel: "Save & verify",
      opensModal: null,
    };
  }
  return {
    provider,
    title,
    status: "not-linked",
    pillText: "Not linked",
    badge,
    body: "connect",
    actionLabel: "Connect",
    opensModal: provider,
  };
}
