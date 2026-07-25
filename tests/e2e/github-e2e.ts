import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { StagehandPage } from "./helpers";

/**
 * task-62 D4 — the nextjs adapter over the SHARED real-GitHub e2e harness.
 *
 * Half (A) of task 62 retired the `github-stub` + `git-server` fixtures: every
 * real-stack e2e spec in root / api / dbos / nextjs now talks to real
 * `github.com` + `api.github.com`. (Unit suites keep every stub and mock — no
 * real egress ever enters a unit lane.)
 *
 * Two invariants shape this file:
 *
 *  1. **The throwaway-repo name prefix is authored EXACTLY ONCE, in the root
 *     repo** (`tests/support/e2e-github-naming.mjs`, task-62 D1). It is never
 *     re-typed here, because the cleanup script's hard gate matches on that same
 *     constant — if a spec's prefix could drift from the gate's, the script would
 *     either miss its own artifacts or, far worse, become able to match one of
 *     the user's REAL repos. So this module resolves the root checkout and
 *     dynamic-imports it. There is deliberately no local fallback.
 *
 *  2. **Nothing about the installation is hardcoded** (task-62 D5). Installation
 *     ids change on every reinstall, and the fabricated id these specs used to
 *     plant is precisely what plan row 62 item (d) was: real GitHub permanently
 *     404ing `POST /app/installations/<made-up>/access_tokens`. The id and the
 *     owner login are discovered at runtime from `GET /app/installations`, and
 *     every failure path THROWS with remediation text — never `console.warn` +
 *     skip, which vitest's default reporter swallows into a green lie (plan row
 *     56 item 2).
 *
 * The root modules are zero-dependency ESM with no build step, so they are safe
 * to import from a Vitest worker. Their runtime shape is described by the
 * interfaces below; every value that crosses the boundary is normalised through
 * `pick*` helpers so a harmless shape difference in the shared harness surfaces
 * as a named error here rather than an `undefined` propagating into a URL.
 */

// ── locating the root checkout ───────────────────────────────────────────────

/** The root supagloo checkout — the same seam api/dbos global-setups already use. */
export const ROOT_DIR =
  process.env.SUPAGLOO_ROOT_DIR ?? resolve(process.cwd(), "..", "supagloo");

const NAMING_MODULE_REL = "tests/support/e2e-github-naming.mjs";
const API_MODULE_REL = "tests/support/e2e-github-api.mjs";

function rootModulePath(relative: string): string {
  const abs = join(ROOT_DIR, relative);
  if (!existsSync(abs)) {
    throw new Error(
      `[github-e2e] the shared real-GitHub harness module is missing: ${abs}\n` +
        `  It lives in the ROOT supagloo repo and is the single authored source of the\n` +
        `  throwaway-repo name prefix + the GitHub network harness (task-62 D1/D3).\n` +
        `  Fix by either:\n` +
        `    • checking out the root repo as a sibling of this one (../supagloo), or\n` +
        `    • setting SUPAGLOO_ROOT_DIR=/path/to/supagloo before running the lane.\n` +
        `  Currently SUPAGLOO_ROOT_DIR=${process.env.SUPAGLOO_ROOT_DIR ?? "(unset)"}, ` +
        `resolved root=${ROOT_DIR}`,
    );
  }
  return abs;
}

async function importRootModule<T>(relative: string): Promise<T> {
  const href = pathToFileURL(rootModulePath(relative)).href;
  return (await import(href)) as T;
}

// ── the shared harness's surface, as this repo consumes it ───────────────────

interface NamingModule {
  E2E_RUN_ID: string;
  buildE2eRepoName(slug: string, runId: string): string;
  isE2eRepoName(name: string): boolean;
}

interface GithubApiModule {
  resolveGithubE2eSecrets(options?: { env?: NodeJS.ProcessEnv }): unknown;
  signAppJwtLocal(input: { appId: string; privateKey: string }): string;
  discoverInstallation(input: {
    appId: string;
    privateKey: string;
    ownerLogin?: string;
    signJwt?: (input: { appId: string; privateKey: string }) => string;
  }): Promise<unknown>;
  createFixtureRepo(input: {
    pat: string;
    slug: string;
    runId?: string;
    /** Stamped into the repo description so a human can attribute it later. */
    spec?: string;
  }): Promise<unknown>;
  waitForRepoReady(input: {
    pat: string;
    owner: string;
    repo: string;
    branch?: string;
  }): Promise<unknown>;
  waitForInstallationVisibility(input: {
    token: string;
    fullName: string;
    timeoutMs?: number;
  }): Promise<unknown>;
  /** Returns the `ghs_…` token string. Optional only to keep this adapter honest if
   *  the shared harness ever drops it — see `installationToken()` below. */
  mintInstallationTokenLocal?: (input: {
    appId: string;
    privateKey: string;
    installationId: string;
  }) => Promise<unknown>;
  githubFetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

let namingModulePromise: Promise<NamingModule> | undefined;
let apiModulePromise: Promise<GithubApiModule> | undefined;

export function namingModule(): Promise<NamingModule> {
  namingModulePromise ??= importRootModule<NamingModule>(NAMING_MODULE_REL);
  return namingModulePromise;
}

export function githubApiModule(): Promise<GithubApiModule> {
  apiModulePromise ??= importRootModule<GithubApiModule>(API_MODULE_REL);
  return apiModulePromise;
}

// ── shape normalisation across the module boundary ───────────────────────────

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error(
      `[github-e2e] the shared harness returned a non-object for ${what}: ${String(value)}`,
    );
  }
  return value as Record<string, unknown>;
}

function pickString(
  source: Record<string, unknown>,
  keys: readonly string[],
  what: string,
): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  throw new Error(
    `[github-e2e] could not read ${what} from the shared harness result ` +
      `(looked for ${keys.join("/")}, got keys: ${Object.keys(source).join(", ") || "none"}). ` +
      `Root harness: ${API_MODULE_REL}.`,
  );
}

// ── the discovered, credentialed context ────────────────────────────────────

export interface GithubE2eContext {
  appId: string;
  privateKey: string;
  /** Classic PAT (`repo`), host-side only — NEVER passed into a container. */
  pat: string;
  /** The installation account login, discovered — never a literal in a spec. */
  owner: string;
  /** The real installation id, discovered — never `"42"`. */
  installationId: string;
  /** One id per PROCESS, so every repo from one run shares a groupable suffix. */
  runId: string;
}

let contextPromise: Promise<GithubE2eContext> | undefined;

/**
 * Resolve + memoise the GitHub e2e context. Memoised per process because it costs
 * one RS256 signature and one `GET /app/installations` round-trip (~200 ms), and
 * because `beforeAll` in several specs plus the wizard helper all need it.
 *
 * Every failure below is a `throw` carrying its own remediation — a missing
 * variable names itself and the root `.env`; zero installations names
 * `https://github.com/apps/<slug>/installations/new`; an owner mismatch lists the
 * logins found. The shared harness owns those messages (task-62 D5); this adapter
 * only adds the nextjs-side context (which lane, which root dir).
 */
export function resolveGithubE2eContext(): Promise<GithubE2eContext> {
  contextPromise ??= (async () => {
    const naming = await namingModule();
    const api = await githubApiModule();

    const secrets = asRecord(
      api.resolveGithubE2eSecrets({ env: process.env }),
      "resolveGithubE2eSecrets()",
    );
    const appId = pickString(secrets, ["appId", "GITHUB_APP_ID"], "the GitHub App id");
    const privateKey = pickString(
      secrets,
      ["privateKey", "GITHUB_APP_PRIVATE_KEY"],
      "the GitHub App private key",
    );
    const pat = pickString(
      secrets,
      ["pat", "GITHUB_E2E_PAT_TOKEN"],
      "the e2e PAT (GITHUB_E2E_PAT_TOKEN)",
    );

    // nextjs has no db-lib dependency (a deliberate decision recorded at
    // lib/api/contracts.ts), so it uses the harness's own `signAppJwtLocal`
    // rather than db-lib's product signer the way api/dbos do.
    const installation = asRecord(
      await api.discoverInstallation({
        appId,
        privateKey,
        ownerLogin: process.env.SUPAGLOO_E2E_GITHUB_OWNER,
        signJwt: api.signAppJwtLocal,
      }),
      "discoverInstallation()",
    );

    const account = installation["account"];
    const accountRecord =
      typeof account === "object" && account !== null
        ? (account as Record<string, unknown>)
        : {};
    const owner =
      typeof accountRecord["login"] === "string" && accountRecord["login"].length > 0
        ? (accountRecord["login"] as string)
        : pickString(
            installation,
            ["ownerLogin", "owner", "login"],
            "the installation account login",
          );

    const installationId = pickString(
      installation,
      ["installationId", "id"],
      "the installation id",
    );

    return { appId, privateKey, pat, owner, installationId, runId: naming.E2E_RUN_ID };
  })();
  return contextPromise;
}

/** The real installation id, for `completeGithubConnectViaCallback`. */
export async function resolveInstallationId(): Promise<string> {
  return (await resolveGithubE2eContext()).installationId;
}

/**
 * The real installation account login. Replaces the github-stub's fabricated
 * `"acme"` in every recap/profile assertion — asserted against THIS value rather
 * than a literal, so the specs stay true whoever the App is installed for.
 */
export async function resolveGithubLogin(): Promise<string> {
  return (await resolveGithubE2eContext()).owner;
}

// ── installation token (for the seeding + assertion reads) ───────────────────

let tokenPromise: Promise<string> | undefined;

/**
 * Mint ONE installation token per process (1 h TTL, ample for a lane).
 *
 * Reads and fixture-seeding deliberately use the INSTALLATION token, not the PAT:
 * a PAT is a strictly stronger credential than production ever holds, so a read
 * that only succeeds with a PAT would green-light a permission the product does
 * not have. A read that succeeds with the installation token is itself a scoping
 * proof (task-62 D6).
 */
export function installationToken(): Promise<string> {
  tokenPromise ??= (async () => {
    const { appId, privateKey, installationId } = await resolveGithubE2eContext();
    const api = await githubApiModule();

    if (typeof api.mintInstallationTokenLocal === "function") {
      const minted = await api.mintInstallationTokenLocal({
        appId,
        privateKey,
        installationId,
      });
      if (typeof minted === "string") return minted;
      return pickString(
        asRecord(minted, "mintInstallationTokenLocal()"),
        ["token", "access_token"],
        "the installation token",
      );
    }

    // The shared harness does not expose a minter (it is not in task-62 D3's list,
    // and nextjs has no db-lib `mintInstallationToken` to fall back on), so do the
    // one documented call here. PEM normalisation still lives ONLY in the harness's
    // `signAppJwtLocal` — this adds no second implementation of it.
    const jwt = api.signAppJwtLocal({ appId, privateKey });
    const doFetch = api.githubFetch ?? fetch;
    const res = await doFetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${jwt}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
      },
    );
    if (res.status !== 201) {
      throw new Error(
        `[github-e2e] POST /app/installations/${installationId}/access_tokens ` +
          `returned ${res.status} (expected 201). A 404 means the installation id is ` +
          `stale — reinstall at https://github.com/apps/${process.env.GITHUB_APP_SLUG ?? "<slug>"}/installations/new. ` +
          `A 401 means GITHUB_APP_ID does not match GITHUB_APP_PRIVATE_KEY in the root .env.`,
      );
    }
    const body = asRecord(await res.json(), "the access_tokens response");
    return pickString(body, ["token"], "the installation token");
  })();
  return tokenPromise;
}

// ── per-run fixture repos ────────────────────────────────────────────────────

export interface FixtureRepo {
  owner: string;
  /** The repo name alone — this is what `repo-row-<shortName>` is keyed on. */
  name: string;
  fullName: string;
}

/**
 * Repo creation is funnelled through one promise chain with ~1 s spacing: repo
 * create/archive fall under GitHub's *secondary* (abuse) limits, which are
 * account-scoped and far tighter than the core limit. The shared harness applies
 * the same discipline; this chain also keeps a `beforeAll` that provisions several
 * repos from firing them in parallel.
 */
let creationChain: Promise<unknown> = Promise.resolve();

/**
 * PAT-create one throwaway private repo for this run, then gate it.
 *
 * The PAT does the creating because the installation grants only
 * `contents:write` + `pull_requests:write` + `metadata:read` — **no
 * `administration`** — so an installation token structurally cannot create a
 * repo. Everything the product then does to the repo uses the installation token
 * minted by unchanged product code, which is the thing under test.
 *
 * Two bounded gates run before the caller may enqueue any workflow:
 *   • repo-ready — a just-created repo can 404 briefly on its first read;
 *   • installation-visibility — under `repository_selection: all` a new repo
 *     becomes visible to the installation quickly but not instantly, and the
 *     scaffold's `ensureRepoReachable` treats absence as a PERMANENT failure, so
 *     a missing gate turns a timing blip into a non-retryable scaffold error.
 *
 * The repo is created with an initial commit on `main` (the shared harness passes
 * `auto_init: true`). That is load-bearing, not cosmetic: `scaffoldProjectWorkflow`
 * opens its base PR with `base: "main"`, and real GitHub 422s that against a
 * commit-less repo.
 *
 * There is NO teardown here, on purpose (task-62 D6): fixture repos live in a
 * personal account that also holds the user's real repos, so the only path that
 * ends their life is a human running the root repo's interactive
 * `npm run cleanup:github-e2e`, which archives (never deletes) and re-checks the
 * name prefix at the mutation site. You will also usually want the repo intact to
 * debug a red run.
 */
export async function ensureFixtureRepo(slug: string): Promise<FixtureRepo> {
  const run = creationChain.then(async () => {
    const ctx = await resolveGithubE2eContext();
    const api = await githubApiModule();

    const created = asRecord(
      await api.createFixtureRepo({
        pat: ctx.pat,
        slug,
        runId: ctx.runId,
        // Stamped into the repo description by the shared harness, so a human running
        // the cleanup script can see which spec in which repo produced each artifact.
        spec: `nextjs/${slug}`,
      }),
      "createFixtureRepo()",
    );

    const name = pickString(created, ["name", "repo"], "the created repo name");
    const ownerValue = created["owner"];
    const owner =
      typeof ownerValue === "string" && ownerValue.length > 0
        ? ownerValue
        : typeof ownerValue === "object" && ownerValue !== null
          ? pickString(
              ownerValue as Record<string, unknown>,
              ["login"],
              "the created repo owner",
            )
          : ctx.owner;
    const fullName =
      typeof created["fullName"] === "string"
        ? (created["fullName"] as string)
        : typeof created["full_name"] === "string"
          ? (created["full_name"] as string)
          : `${owner}/${name}`;

    // A name collision (422) is FATAL and never retried: names carry a per-run id,
    // so a collision means a bug, and a retry loop would mask it. The shared
    // harness enforces that; we do not add a retry here.
    await api.waitForRepoReady({ pat: ctx.pat, owner, repo: name });
    await api.waitForInstallationVisibility({
      token: await installationToken(),
      fullName,
    });

    return { owner, name, fullName };
  });
  // Space the NEXT creation out regardless of this one's outcome.
  creationChain = run.then(
    () => new Promise((r) => setTimeout(r, 1000)),
    () => new Promise((r) => setTimeout(r, 1000)),
  );
  return run;
}

// ── page helpers (testid + evaluate only — no act/extract/observe) ───────────

function countTestId(page: StagehandPage, id: string): Promise<number> {
  return page.locator(`[data-testid="${id}"]`).count();
}

function clickTestId(page: StagehandPage, id: string): Promise<unknown> {
  return page.locator(`[data-testid="${id}"]`).click();
}

function testidAttr(
  page: StagehandPage,
  id: string,
  attr: string,
): Promise<string | null> {
  return page.evaluate(
    ({ sel, a }) =>
      document.querySelector<HTMLElement>(`[data-testid="${sel}"]`)?.getAttribute(a) ??
      null,
    { sel: id, a: attr },
  );
}

async function waitForTestId(
  page: StagehandPage,
  id: string,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(page, id)) > 0) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`[data-testid="${id}"] never appeared within ${timeoutMs}ms`);
}

/** React-controlled input: native value setter + a bubbling `input` event. */
async function typeInto(
  page: StagehandPage,
  id: string,
  value: string,
): Promise<void> {
  await page.evaluate(
    ({ sel, v }) => {
      const el = document.querySelector<HTMLInputElement>(`[data-testid="${sel}"]`);
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { sel: id, v: value },
  );
}

async function gotoWorkspace(page: StagehandPage, seedUrl: string): Promise<void> {
  await page.goto(seedUrl, { waitUntil: "load" });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if ((await countTestId(page, "workspace-home")) > 0) return;
    await page.waitForTimeout(250);
  }
  throw new Error(
    "workspace-home never rendered. Check: the containerised api is up on :4000 " +
      "with SUPAGLOO_ENABLE_TEST_SEED=1 and NODE_ENV!=production, and `next dev` has " +
      "SUPAGLOO_API_URL + SUPAGLOO_ENABLE_TEST_SEED set.",
  );
}

// ── the real-product emptiness gate ─────────────────────────────────────────

/**
 * Poll the REAL product route until the fixture repo is listed as empty.
 *
 * This runs IN THE PAGE (`fetch` on the app's own origin, carrying the httpOnly
 * session cookie) because `GET /api/github/repos` → `GET /v1/github/repos` needs
 * an authenticated user with a stored GitHub connection — which only exists once
 * the seed + the connect callback have run. That is also why this gate cannot
 * live in globalSetup, where no session exists.
 *
 * Why it is a mandatory gate and not a nicety (task-62 D16): the api derives
 * `empty` from GitHub's `size` field, which is reported in KB and computed
 * ASYNCHRONOUSLY. If a freshly-`auto_init`ed repo ever reported a non-zero size,
 * the picker row would render disabled, its click would be a silent no-op, and
 * the whole wizard would fail four minutes later as an inexplicable timeout. A
 * live probe found small real repos genuinely reporting `size: 0`, so the
 * derivation is left unchanged — but the failure mode is silent, so we assert it
 * loudly HERE, naming the contingency.
 */
export async function assertFixtureRepoListedEmpty(
  page: StagehandPage,
  fullName: string,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastSeen: { present: boolean; empty: boolean | null; count: number } = {
    present: false,
    empty: null,
    count: -1,
  };
  while (Date.now() < deadline) {
    lastSeen = await page.evaluate(async (name) => {
      const res = await fetch("/api/github/repos?filter=all", { cache: "no-store" });
      if (!res.ok) return { present: false, empty: null, count: -1 };
      const body = (await res.json()) as {
        repositories?: { fullName: string; empty: boolean }[];
      };
      const repos = body.repositories ?? [];
      const hit = repos.find((r) => r.fullName === name);
      return {
        present: Boolean(hit),
        empty: hit ? hit.empty : null,
        count: repos.length,
      };
    }, fullName);
    if (lastSeen.present && lastSeen.empty === true) return;
    await page.waitForTimeout(1000);
  }
  throw new Error(
    `[github-e2e] ${fullName} never appeared as empty in GET /api/github/repos?filter=all ` +
      `within ${timeoutMs}ms (present=${lastSeen.present}, empty=${String(lastSeen.empty)}, ` +
      `repos listed=${lastSeen.count}).\n` +
      `  • present=false → the installation cannot see the repo yet (or the seeded user has ` +
      `no GitHub connection: was completeGithubConnectViaCallback called with the DISCOVERED ` +
      `installation id?).\n` +
      `  • present=true, empty=false → GitHub's async KB-rounded \`size\` is non-zero for an ` +
      `initialised repo, so the api's \`empty = size === 0\` derivation no longer holds. That is ` +
      `the known contingency: derive emptiness from a commits probe instead of \`size\` ` +
      `(a 409 "Git Repository is empty" or <=1 commit means empty). Do NOT work around it here.`,
  );
}

// ── the ONE shared project-acquisition helper ───────────────────────────────

export interface ExistingEmptyRepoProjectOptions {
  /** Spec-scoped slug fragment; the run id is appended by the shared namer. */
  slug: string;
  /** The `?seed=…&nonce=…` workspace URL the calling spec already builds. */
  seedUrl: string;
  /** Real clone→commit→push→PR→merge→branch against github.com. */
  projectReadyTimeoutMs?: number;
  /**
   * Invoked immediately after the "Scaffold into this repo →" click and BEFORE the
   * wait for `project-ready-card`, so a caller can assert on the in-flight step-2
   * provisioning log (which is gone once the wizard advances). Exists so specs that
   * need that observation do not have to keep a private copy of this whole flow.
   */
  onScaffoldStarted?: () => Promise<void>;
}

export interface AcquiredProject {
  /** The `/studio/<projectId>` path segment. */
  projectId: string;
  repoFullName: string;
  repoShortName: string;
}

/**
 * Acquire a real, scaffolded project through the wizard's **existing-empty-repo**
 * tab, and open its studio. ONE implementation, shared by every real-stack spec
 * that used to carry a byte-similar private copy.
 *
 * Why this path and not "Create new repo" (task-62 D13/D14): the create-new tab
 * runs GitHub's user-authorization consent screen, which is a human clicking
 * "Authorize" in a second tab. Against the retired stub any non-empty `code` was
 * accepted; real GitHub answers `bad_verification_code`, and a containerised api
 * exposes no client-side seam to intercept the exchange (the only container-level
 * seam, `GITHUB_OAUTH_BASE_URL`, is simultaneously the BROWSER's authorize
 * redirect target — overriding it re-creates the `DNS_PROBE_FINISHED_NXDOMAIN`
 * this task deletes). The existing-empty tab is a fully shipped, DESIGNED product
 * path (wireframe 13a) whose `startRealExisting` POSTs straight to
 * `/api/projects` with no consent hop at all — so the specs that use it keep
 * their failure modes about the thing they test instead of about OAuth plumbing.
 * The create-new path's server half stays covered by the api repo's
 * `repo-provisioning.e2e.ts`, its client half by the mock lane's
 * `project-wizards.e2e.ts`, and restoring browser-level coverage is its own plan
 * row.
 */
export async function createProjectViaExistingEmptyRepo(
  page: StagehandPage,
  opts: ExistingEmptyRepoProjectOptions,
): Promise<AcquiredProject> {
  const repo = await ensureFixtureRepo(opts.slug);

  await gotoWorkspace(page, opts.seedUrl);

  // The real-product gate for GitHub's asynchronous `size` field.
  await assertFixtureRepoListedEmpty(page, repo.fullName);

  await waitForTestId(page, "workspace-new-project");
  await clickTestId(page, "workspace-new-project");
  await waitForTestId(page, "new-project-wizard");

  // Second tab: "Use existing empty repo" (13a).
  await waitForTestId(page, "tab-existing-empty");
  await clickTestId(page, "tab-existing-empty");
  await waitForTestId(page, "repo-search");

  // MANDATORY, not tidiness: the live account this App is installed on holds 100+
  // repos, so the picker renders 100+ rows. Narrowing by the fixture's own name is
  // what keeps the click deterministic AND is the safety property that stops a
  // positional selector from ever landing on one of the user's real repositories.
  await typeInto(page, "repo-search", repo.name);

  const rowId = `repo-row-${repo.name}`;
  await waitForTestId(page, rowId, 30_000);

  // A disabled row's click is a deliberate no-op (no native `disabled`, so the CDP
  // understudy's click resolves instead of timing out). Without this assertion a
  // bad `empty` derivation surfaces minutes later as an unexplained wizard
  // timeout instead of an attributable failure right here.
  const disabled = await testidAttr(page, rowId, "data-disabled");
  if (disabled !== null) {
    throw new Error(
      `[github-e2e] ${rowId} is rendered DISABLED (data-disabled=${JSON.stringify(disabled)}), ` +
        `so clicking it is a no-op. The picker disables non-empty repos, which means ` +
        `GET /api/github/repos reported \`empty: false\` for the freshly-created fixture ` +
        `${repo.fullName}. See assertFixtureRepoListedEmpty above for the contingency.`,
    );
  }

  await clickTestId(page, rowId);
  const selected = await testidAttr(page, rowId, "data-selected");
  if (selected !== "true") {
    throw new Error(
      `[github-e2e] clicking ${rowId} did not select it (data-selected=${JSON.stringify(selected)})`,
    );
  }

  // `new-project-cta` carries a native `disabled` until a repo is selected, and a
  // click on a natively-disabled button is silently dropped.
  const ctaDisabled = await page.evaluate(
    () =>
      document.querySelector<HTMLButtonElement>('[data-testid="new-project-cta"]')
        ?.disabled ?? true,
  );
  if (ctaDisabled) {
    throw new Error(
      "[github-e2e] new-project-cta is still disabled after selecting the fixture repo",
    );
  }
  await clickTestId(page, "new-project-cta");

  if (opts.onScaffoldStarted) await opts.onScaffoldStarted();

  await waitForProjectReady(page, repo, opts.projectReadyTimeoutMs ?? 240_000);

  await waitForTestId(page, "open-in-studio");
  await clickTestId(page, "open-in-studio");

  const deadline = Date.now() + 45_000;
  let url = page.url();
  while (Date.now() < deadline && !url.includes("/studio/")) {
    await page.waitForTimeout(200);
    url = page.url();
  }
  if (!url.includes("/studio/")) {
    throw new Error(`URL never included "/studio/" (last: ${url})`);
  }
  return {
    projectId: url.split("/studio/")[1]?.split(/[?#]/)[0] ?? "",
    repoFullName: repo.fullName,
    repoShortName: repo.name,
  };
}

/**
 * Wait for the terminal ready card, with a SEMANTIC BACKSTOP.
 *
 * The render lane's globalSetup gates that the `dbos` container is running and
 * not crash-looping, but a running-but-wedged worker passes that gate and then
 * fails here, minutes later. So this error names the worker and the exact command
 * to inspect it — otherwise the most common real failure in this lane presents as
 * an anonymous timeout on a testid.
 */
async function waitForProjectReady(
  page: StagehandPage,
  repo: FixtureRepo,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countTestId(page, "project-ready-card")) > 0) return;
    if ((await countTestId(page, "new-project-error")) > 0) {
      const message = await page.evaluate(
        () =>
          document
            .querySelector<HTMLElement>('[data-testid="new-project-error"]')
            ?.textContent?.trim() ?? "",
      );
      throw new Error(
        `[github-e2e] the wizard surfaced a scaffold failure for ${repo.fullName}: ` +
          `${JSON.stringify(message)}. Inspect the worker's own error with:\n` +
          `  docker compose -f docker-compose.yml -f docker-compose.override.yml ` +
          `-f docker-compose.test.yml logs --tail=200 dbos`,
      );
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `[github-e2e] project-ready-card never appeared within ${timeoutMs}ms for ` +
      `${repo.fullName}. The scaffold job (clone → commit v0.0.0 → push → open+merge ` +
      `base PR → cut v0.0.1, all against real github.com) never reached a terminal ` +
      `status. The usual cause is the DBOS git-ops worker: running but wedged, or ` +
      `never picking up the queue. Check it with:\n` +
      `  docker compose -f docker-compose.yml -f docker-compose.override.yml ` +
      `-f docker-compose.test.yml logs --tail=200 dbos\n` +
      `The fixture repo is deliberately NOT deleted — inspect it at ` +
      `https://github.com/${repo.fullName}`,
  );
}
