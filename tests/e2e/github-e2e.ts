import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Stagehand } from "@browserbasehq/stagehand";

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

/** The app's own origin (`next dev`). A legitimate coordinate, not a stub host — the
 *  no-stub seam guard is deliberately narrow enough to say so. */
const APP_BASE_URL = "http://localhost:3000";

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

/**
 * The name the create-new-repo driver types into the wizard.
 *
 * It goes through the SAME root-authored namer every fixture repo uses, for the same
 * reason: this is the one flow where the PRODUCT creates the repository, so if the
 * name did not carry the throwaway prefix the cleanup script could never reclaim it —
 * a repo stranded in a personal account that also holds the user's real ones. The
 * prefix itself is never re-typed in this repo (task-62 D1).
 */
export async function createNewRepoName(slug: string): Promise<string> {
  const naming = await namingModule();
  const { runId } = await resolveGithubE2eContext();
  return naming.buildE2eRepoName(slug, runId);
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
  /**
   * Classic PAT (`repo`), host-side only — NEVER passed into a container. Still true
   * after plan row 66, and true on purpose: row 66 needed a GitHub credential INSIDE
   * the api container, and rather than reverse this property it minted a SECOND,
   * deliberately narrower one (`GITHUB_E2E_EXCHANGE_TOKEN` — repository creation only,
   * no `delete_repo`) that the api reads and this harness never touches. Two
   * credentials with two different blast radii; do not collapse them.
   */
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
 * The repo is created with an initial commit on `main` (the shared harness's
 * `auto_init: true` DEFAULT). Every nextjs fixture uses that default, and it stays
 * load-bearing here: `scaffoldProjectWorkflow` opens its base PR with `base: "main"`,
 * and the picker's existing-empty flow expects a normal one-commit repo. Plan row 63
 * added an additive `autoInit: false` opt-out to the shared harness and taught the
 * workflow to bootstrap an unborn base ref, so a commit-less repo no longer 422s — but
 * that opt-out is used by ONE dbos spec only and is deliberately not used from nextjs.
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
 * Why this path and not "Create new repo" for the specs that only need A PROJECT
 * (task-62 D13/D14): the create-new tab runs GitHub's user-authorization consent
 * screen, a human clicking "Authorize" in a second tab, and everything downstream of
 * it is OAuth plumbing. The existing-empty tab is a fully shipped, DESIGNED product
 * path (wireframe 13a) whose `startRealExisting` POSTs straight to `/api/projects`
 * with no consent hop at all — so the eight specs that just need a scaffolded project
 * keep their failure modes about the thing they test.
 *
 * That is now a CHOICE rather than a limitation. It used to be a hard block: a
 * containerised api exposed no seam to intercept the code→token exchange, and the only
 * container-level seam, `GITHUB_OAUTH_BASE_URL`, was simultaneously the BROWSER's
 * authorize redirect target — so overriding it re-created row 62 item (e)'s
 * `DNS_PROBE_FINISHED_NXDOMAIN`. Plan row 66 split that variable in two, and
 * `createProjectViaCreateNewRepo` below now drives the full create-new round trip
 * against real GitHub. Use THIS helper unless the create-new path is the thing under
 * test; it is faster and has fewer moving parts.
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

// ── the create-NEW-repo acquisition helper (plan row 66) ────────────────────

export interface CreateNewRepoProjectOptions {
  /** Spec-scoped slug fragment; the throwaway prefix + run id are added by the
   *  root-authored namer, so the PRODUCT-created repo is reclaimable. */
  slug: string;
  /** The `?seed=…&nonce=…` workspace URL the calling spec already builds. */
  seedUrl: string;
  /** The Stagehand context — the callback runs in a SECOND page that must share this
   *  context's localStorage and httpOnly session cookie. */
  context: Stagehand["context"];
  /** Real exchange → create → clone → commit → push → PR → merge → branch. */
  projectReadyTimeoutMs?: number;
  /** Same contract as the existing-empty helper: invoked after the CTA click and
   *  before the wait for `project-ready-card`, while step 2's log is still on screen. */
  onScaffoldStarted?: () => Promise<void>;
}

/**
 * Acquire a real, scaffolded project through the wizard's **create-new-repo** tab —
 * the product's headline designed path (wireframe 12a) — and open its studio.
 *
 * ── WHAT IS REAL AND WHAT IS SIMULATED ───────────────────────────────────────
 * Everything is real except the ONE hop no headless spec can drive: a human clicking
 * "Authorize" on GitHub's hosted consent screen. That is the same §10.2-sanctioned
 * interactive-hop exception `completeGithubConnectViaCallback` and the OpenRouter PKCE
 * helper already use, and it is applied identically here — we navigate a second page
 * straight to the app's own callback URL, exactly as GitHub would redirect it.
 *
 * What makes this possible AT ALL (and what made it impossible until plan row 66) is
 * the api-side change, not anything here: `exchangeCode` now uses
 * `GITHUB_OAUTH_INTERNAL_BASE_URL`, distinct from the browser-facing
 * `GITHUB_OAUTH_BASE_URL`, so the containerised api completes the code→token hop
 * against ITSELF over the Compose network — where a double-gated, test-only route
 * answers with `GITHUB_E2E_EXCHANGE_TOKEN`. A synthetic `code` therefore no longer
 * reaches real github.com (which correctly answers `bad_verification_code`), while the
 * browser's authorize redirect still points at real github.com and resolves from the
 * user's machine. Before the split, one variable had to be both and could be neither.
 *
 * Everything downstream of the exchange is REAL: `POST /user/repos` creates a genuine
 * repository on github.com under a genuine credential, and the DBOS worker clones,
 * commits v0.0.0, pushes, opens+merges the base PR and cuts v0.0.1 against it.
 *
 * ── WHY IT LIVES HERE ────────────────────────────────────────────────────────
 * Same reason as `createProjectViaExistingEmptyRepo`: this file is the ONE exemption
 * in the `new-project-cta` acquisition guard, and it is where the repo-naming
 * discipline lives. A private copy in a spec would look fine and create a repo the
 * cleanup script cannot see. It is also deliberately NOT named
 * `completeCreateRepoViaCallback` — that identifier stays banned by
 * `tests/unit/e2e-real-github-seam.test.ts`, because it named a helper that fed a
 * synthetic code to REAL github.com and therefore could never pass.
 *
 * NO TEARDOWN, as everywhere else (task-62 D6): reclaim with the root repo's
 * interactive `npm run cleanup:github-e2e`, which archives and never deletes.
 */
export async function createProjectViaCreateNewRepo(
  page: StagehandPage,
  opts: CreateNewRepoProjectOptions,
): Promise<AcquiredProject> {
  const ctx = await resolveGithubE2eContext();
  const repoName = await createNewRepoName(opts.slug);
  const repoFullName = `${ctx.owner}/${repoName}`;

  await gotoWorkspace(page, opts.seedUrl);

  await waitForTestId(page, "workspace-new-project");
  await clickTestId(page, "workspace-new-project");
  await waitForTestId(page, "new-project-wizard");

  // First tab: "Create new repo" (12a). It is the default, but assert-then-click
  // rather than assume — a default flip would otherwise present as the repo-name
  // field simply never appearing.
  await waitForTestId(page, "tab-create-new");
  await clickTestId(page, "tab-create-new");
  await waitForTestId(page, "new-repo-name");
  await typeInto(page, "new-repo-name", repoName);

  // The CTA carries a native `disabled` until the name is non-empty, and a click on a
  // natively-disabled button is silently dropped — so a lost `input` event would look
  // like a wizard that simply never advanced.
  const ctaDisabled = await page.evaluate(
    () =>
      document.querySelector<HTMLButtonElement>('[data-testid="new-project-cta"]')
        ?.disabled ?? true,
  );
  if (ctaDisabled) {
    throw new Error(
      `[github-e2e] new-project-cta is still disabled after typing ${repoName} into ` +
        `new-repo-name — the React-controlled input did not receive the value.`,
    );
  }
  await clickTestId(page, "new-project-cta");

  // The wizard stashes its form params under a random `state` nonce and opens the
  // authorize popup. The nonce is generated in the browser, so the ONLY way to learn
  // it is to read it back out of localStorage — which is also a real assertion that
  // hop 4 of the round trip happened at all.
  const nonce = await waitForStashedCreateRepoNonce(page);

  // Close the consent popup. It navigated to real github.com's authorize screen (hop 6,
  // genuinely exercised: the BFF's 302 really is built from the PUBLIC base URL and
  // really does resolve). A human cannot be asked to click Authorize in CI, so we stop
  // there and simulate only the redirect BACK.
  await closeExtraPages(page, opts.context);

  await completeCreateRepoCallback(opts.context, nonce);

  // …and again, because `completeCreateRepoCallback` opens one of its own and the
  // callback page may self-close mid-flight. See `closeExtraPages` for why leaving one
  // behind is not cosmetic.
  await closeExtraPages(page, opts.context);

  if (opts.onScaffoldStarted) await opts.onScaffoldStarted();

  await waitForProjectReady(
    page,
    { owner: ctx.owner, name: repoName, fullName: repoFullName },
    opts.projectReadyTimeoutMs ?? 300_000,
  );

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
    repoFullName,
    repoShortName: repoName,
  };
}

/**
 * The localStorage key PREFIX the wizard stashes its create-repo form params under.
 *
 * Deliberately derived from the app's own shape rather than re-typed as a full key:
 * the nonce half is random per click, so the spec has to discover it. Reading it back
 * is itself the assertion that the cross-tab handoff was set up.
 */
const CREATE_REPO_PARAMS_KEY_PREFIX = "sg_createrepo_params_";

async function waitForStashedCreateRepoNonce(
  page: StagehandPage,
  timeoutMs = 20_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await page.evaluate((prefix) => {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(prefix)) return key.slice(prefix.length);
      }
      return null;
    }, CREATE_REPO_PARAMS_KEY_PREFIX);
    if (found) return found;
    await page.waitForTimeout(200);
  }
  throw new Error(
    `[github-e2e] the wizard never stashed its create-repo params under a ` +
      `\`${CREATE_REPO_PARAMS_KEY_PREFIX}<nonce>\` localStorage key within ${timeoutMs}ms. ` +
      `That stash is written synchronously by the CTA handler, so its absence means ` +
      `the click never reached React (an unhydrated island) or the wizard is in mock ` +
      `mode — check the \`?seed=\` URL.`,
  );
}

/**
 * Close every page this driver caused to exist, leaving only the spec's own.
 *
 * NOT COSMETIC — this is the one thing about the create-new driver that a reader will
 * otherwise "simplify" away. The wizard's `window.open` produces a real popup WINDOW,
 * and while it is open it holds focus. A backgrounded Chrome tab defers the work React
 * needs to mount, so the spec's page stops producing mount-gated testids —
 * `workspace-home` is rendered only after `home-switch.tsx`'s `mounted` effect runs.
 * Measured symptom when this cleanup is missing or partial: E-RNP1b itself passes, and
 * then EVERY subsequent test in the file fails with "workspace-home never rendered" —
 * a failure that names the api and the seed gate and is about neither. Its real
 * signature is that the page loads (the api logs the requests) but nothing hydrates.
 *
 * Matching by URL is not enough: at the moment the nonce appears the popup is usually
 * still `about:blank` and has not reached the BFF's 302 yet. So this waits briefly for
 * a late-registering popup, then closes by POSITION — the spec's page is
 * `context.pages()[0]` (every spec here captures it that way in `beforeAll`), and pages
 * opened afterwards append. Finally it re-focuses the spec's page, because closing a
 * popup does not by itself hand focus back.
 */
async function closeExtraPages(
  main: StagehandPage,
  context: Stagehand["context"],
): Promise<void> {
  // A popup opened by `window.open` can register a tick or two after the click.
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline && context.pages().length < 2) {
    await main.waitForTimeout(200);
  }
  const [, ...extras] = context.pages();
  for (const p of extras) {
    await p.close().catch(() => {});
  }
  const focusable = main as unknown as { bringToFront?: () => Promise<unknown> };
  if (typeof focusable.bringToFront === "function") {
    await focusable.bringToFront().catch(() => {});
  }
  // A repaint tick after the focus change, so the first poll that follows is not
  // measuring a page that is still coming out of background throttling.
  await main.waitForTimeout(250);
}

/**
 * Simulate GitHub's redirect back to the create-repo callback page.
 *
 * The `code` is deliberately arbitrary: with the row-66 split the containerised api
 * exchanges it against ITSELF, not github.com, so its VALUE carries no meaning — what
 * is under test is that the api completes the exchange, creates a real repository with
 * the returned token and enqueues a real scaffold. (Against real github.com any code
 * we could manufacture answers `bad_verification_code`; that path is covered at unit
 * level in the api's `github-user-auth-client.test.ts`, deliberately.)
 *
 * The page runs in the SAME context, so it shares the localStorage the opener stashed
 * the params in and the httpOnly session cookie the BFF needs.
 */
async function completeCreateRepoCallback(
  context: Stagehand["context"],
  nonce: string,
  timeoutMs = 120_000,
): Promise<void> {
  const cb = await context.newPage();
  try {
    await cb.goto(
      `${APP_BASE_URL}/connect/github/create-repo/callback` +
        `?code=e2e-row66-exchange&state=${encodeURIComponent(nonce)}`,
      { waitUntil: "load" },
    );
    const deadline = Date.now() + timeoutMs;
    let state: string | null = null;
    while (Date.now() < deadline) {
      try {
        state = await cb.evaluate(
          () =>
            document
              .querySelector<HTMLElement>(
                '[data-testid="create-repo-callback-status"]',
              )
              ?.getAttribute("data-state") ?? null,
        );
      } catch {
        // The page best-effort `window.close()`s ITSELF, and only on success (the
        // error branch deliberately leaves the tab open so a human can read it). A
        // vanished tab is therefore a SUCCESS signal, not a lost evaluate.
        state = "done";
      }
      if (state === "done" || state === "error") break;
      await cb.waitForTimeout(250);
    }
    if (state === "error") {
      throw new Error(
        `[github-e2e] the create-repo callback page reported data-state="error". ` +
          `That is POST /api/projects/create-repo → POST /v1/projects/create-repo ` +
          `failing. The usual causes, in order:\n` +
          `  • the api container has no GITHUB_E2E_EXCHANGE_TOKEN, so the test-only ` +
          `exchange route refused to register (check \`docker compose logs api\` — it ` +
          `names the variable and refuses to boot);\n` +
          `  • GITHUB_OAUTH_INTERNAL_BASE_URL is not set on the api service, so ` +
          `\`exchangeCode\` posted the synthetic code to REAL github.com and got ` +
          `\`bad_verification_code\`;\n` +
          `  • the seeded user has no GitHub connection (409) — was ` +
          `completeGithubConnectViaCallback called first?\n` +
          `  • GitHub rejected the repo name (422) — a collision means the run id is ` +
          `not per-run.`,
      );
    }
    if (state !== "done") {
      throw new Error(
        `[github-e2e] the create-repo callback page never left data-state="working" ` +
          `within ${timeoutMs}ms (last: ${JSON.stringify(state)}).`,
      );
    }
  } finally {
    await cb.close().catch(() => {});
  }
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
