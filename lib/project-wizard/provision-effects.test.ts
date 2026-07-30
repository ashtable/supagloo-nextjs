import { describe, expect, it, vi } from "vitest";

// RED until `lib/project-wizard/provision-effects.ts` ships. The real-mode wizard
// effect layer (Task #26 §5.3 rows 4): create/import → real endpoints, then poll the
// job stages (replacing the fake ticker). Plus the create-new-repo JIT hop's
// cross-tab handoff (§2.3/§6b): the wizard stashes params + polls a localStorage
// result key that the popup callback page writes after `POST /api/projects/create-repo`.
// Everything is pure + injectable (fetch / storage / sleep / now) → zero-network tests.
import {
  scaffoldExistingRepo,
  importRepo,
  fetchJob,
  fetchProjectSlug,
  pollJobUntilTerminal,
  stashCreateRepoParams,
  readCreateRepoParams,
  writeCreateRepoResult,
  readCreateRepoResult,
  completeCreateRepo,
  pollCreateRepoResult,
  type CreateRepoParams,
} from "./provision-effects";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  } as Storage;
}

function recordingFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: {
    url: string;
    method: string;
    /** The parsed JSON body. A record rather than `any` so a typo in a field name is a
     *  compile error, while an assertion on any field still typechecks. */
    body?: Record<string, unknown>;
  }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined,
    });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Feature 2's payload, shared by BOTH create paths.
 *
 * The two sites are genuinely independent: "use existing empty repo" POSTs
 * `/api/projects` straight from the wizard tab, while "create new repo" has to survive a
 * `localStorage` handoff across the GitHub OAuth round-trip into a different tab before
 * it POSTs `/api/projects/create-repo`. Deleting either conditional spread used to leave
 * this whole lane green.
 */
const SCRIPTURE = {
  reference: "Psalm 121",
  translation: "ASV",
  language: "en",
  passageId: "PSA.121",
} as const;

describe("scaffoldExistingRepo (use-existing-empty path — repo already exists, no JIT)", () => {
  it("U-PE1: POSTs /api/projects with createdFrom blank + returns { projectId, jobId }", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      json({ projectId: "p1", jobId: "j1" }, 201),
    );
    const res = await scaffoldExistingRepo(
      { repoOwner: "acme", repoName: "psalm-121", projectName: "Psalm 121" },
      { fetchImpl },
    );
    expect(calls[0].url).toBe("/api/projects");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toMatchObject({
      repoOwner: "acme",
      repoName: "psalm-121",
      visibility: "private",
      createdFrom: "blank",
      name: "Psalm 121",
    });
    expect(res).toEqual({ projectId: "p1", jobId: "j1" });
  });

  it("U-PE1a: a PICKED passage travels on the body as `passage` + the scripture block", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      json({ projectId: "p1", jobId: "j1" }, 201),
    );
    await scaffoldExistingRepo(
      {
        repoOwner: "acme",
        repoName: "psalm-121",
        projectName: "Psalm 121",
        scripture: { ...SCRIPTURE },
      },
      { fetchImpl },
    );
    expect(calls[0].body?.createdFrom).toBe("passage");
    expect(calls[0].body?.scripture).toEqual(SCRIPTURE);
  });

  it("U-PE1b: a SKIPPED passage sends `blank` and NO scripture key at all", async () => {
    // Reachable only because step 2 now has a skip control (`wizard-skip-scripture`);
    // before it, `canScaffold` gated the wizard's one forward control on a resolved
    // passage, so this branch could not be produced by any sequence of clicks.
    //
    // The key must be ABSENT, not `null` or `{}` — the api's create schema is what seeds
    // the scaffold manifest, and an empty block would seed an unusable `scripture` into
    // the user's repo.
    const { fetchImpl, calls } = recordingFetch(() =>
      json({ projectId: "p1", jobId: "j1" }, 201),
    );
    await scaffoldExistingRepo(
      {
        repoOwner: "acme",
        repoName: "psalm-121",
        projectName: "Psalm 121",
        scripture: null,
      },
      { fetchImpl },
    );
    expect(calls[0].body?.createdFrom).toBe("blank");
    expect("scripture" in (calls[0].body ?? {})).toBe(false);
  });

  it("U-PE2: returns null on a non-2xx (e.g. 409)", async () => {
    const { fetchImpl } = recordingFetch(() => json({ error: "project_exists" }, 409));
    expect(
      await scaffoldExistingRepo(
        { repoOwner: "a", repoName: "b", projectName: "b" },
        { fetchImpl },
      ),
    ).toBeNull();
  });
});

describe("importRepo (12b)", () => {
  it("U-PE3: POSTs /api/projects/import (no createdFrom) + returns { projectId, jobId }", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      json({ projectId: "p2", jobId: "j2" }, 201),
    );
    const res = await importRepo(
      { repoOwner: "acme", repoName: "exodus", projectName: "exodus" },
      { fetchImpl },
    );
    expect(calls[0].url).toBe("/api/projects/import");
    expect(calls[0].body).toMatchObject({
      repoOwner: "acme",
      repoName: "exodus",
      visibility: "private",
    });
    expect(calls[0].body?.createdFrom).toBeUndefined();
    expect(res).toEqual({ projectId: "p2", jobId: "j2" });
  });
});

const RUNNING_JOB = {
  id: "j1",
  projectId: "p1",
  kind: "scaffold",
  status: "running",
  stages: [{ key: "cloneToWorkspace", label: "Cloning", state: "running" }],
  error: null,
  createdAt: "2026-07-21T00:00:00.000Z",
  completedAt: null,
};
const DONE_JOB = { ...RUNNING_JOB, status: "succeeded", completedAt: "2026-07-21T00:01:00.000Z" };

describe("fetchJob + pollJobUntilTerminal", () => {
  it("U-PE4: fetchJob GETs the job route and unwraps the { job } envelope", async () => {
    const { fetchImpl, calls } = recordingFetch(() => json({ job: RUNNING_JOB }));
    const job = await fetchJob("p1", "j1", { fetchImpl });
    expect(calls[0].url).toBe("/api/projects/p1/jobs/j1");
    expect(job?.status).toBe("running");
  });

  it("U-PE5: pollJobUntilTerminal polls until succeeded, calling onUpdate each tick", async () => {
    let n = 0;
    const { fetchImpl } = recordingFetch(() => {
      n += 1;
      return json({ job: n >= 3 ? DONE_JOB : RUNNING_JOB });
    });
    const updates: string[] = [];
    const terminal = await pollJobUntilTerminal("p1", "j1", {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      onUpdate: (job) => updates.push(job.status),
    });
    expect(terminal?.status).toBe("succeeded");
    expect(updates[updates.length - 1]).toBe("succeeded");
    expect(updates).toContain("running");
  });
});

describe("create-new-repo JIT cross-tab handoff", () => {
  /** The wizard's real payload: a passage WAS picked, so `createdFrom` is `"passage"`.
   *  This carried no scripture, which is why the whole create-new lane was blind to it. */
  const PARAMS: CreateRepoParams = {
    repoName: "psalm-121",
    projectName: "Psalm 121",
    visibility: "private",
    createdFrom: "passage",
    scripture: { ...SCRIPTURE },
  };

  /** The skip path — `wizard-skip-scripture`. */
  const BLANK_PARAMS: CreateRepoParams = {
    repoName: "psalm-121",
    projectName: "Psalm 121",
    visibility: "private",
    createdFrom: "blank",
  };

  it("U-PE6: stash → read params round-trips under the state nonce", () => {
    const storage = memStorage();
    stashCreateRepoParams("nonce-1", PARAMS, storage);
    expect(readCreateRepoParams("nonce-1", storage)).toEqual(PARAMS);
    expect(readCreateRepoParams("other", storage)).toBeNull();
  });

  it("U-PE6a: THE HANDOFF — the passage survives localStorage across the OAuth round-trip", () => {
    // The main tab stashes, GitHub redirects the POPUP back, and the popup tab is what
    // POSTs. So the passage crosses a JSON serialization boundary between two different
    // documents; a field the stash drops is unrecoverable by the time anything notices.
    const storage = memStorage();
    stashCreateRepoParams("nonce-1", PARAMS, storage);
    const read = readCreateRepoParams("nonce-1", storage);
    expect(read?.scripture).toEqual(SCRIPTURE);
    expect(read?.createdFrom).toBe("passage");
    // And the skip path stays clean across the same boundary.
    stashCreateRepoParams("nonce-2", BLANK_PARAMS, storage);
    const blank = readCreateRepoParams("nonce-2", storage);
    expect(blank?.createdFrom).toBe("blank");
    expect(blank?.scripture).toBeUndefined();
  });

  it("U-PE7: write → read result round-trips under the state nonce", () => {
    const storage = memStorage();
    writeCreateRepoResult("nonce-1", { projectId: "p1", jobId: "j1", slug: "psalm-121" }, storage);
    expect(readCreateRepoResult("nonce-1", storage)).toEqual({
      projectId: "p1",
      jobId: "j1",
      slug: "psalm-121",
    });
    expect(readCreateRepoResult("nonce-1", memStorage())).toBeNull();
  });

  it("U-PE8: completeCreateRepo (callback tab) reads params, POSTs create-repo, writes the result", async () => {
    const storage = memStorage();
    stashCreateRepoParams("nonce-1", PARAMS, storage);
    const { fetchImpl, calls } = recordingFetch(() =>
      json({ projectId: "p9", jobId: "j9" }, 201),
    );
    const result = await completeCreateRepo("nonce-1", "gh-code", { fetchImpl, storage });

    expect(calls[0].url).toBe("/api/projects/create-repo");
    expect(calls[0].body).toMatchObject({
      code: "gh-code",
      repoName: "psalm-121",
      visibility: "private",
      createdFrom: "passage",
      name: "Psalm 121",
    });
    // THE SECOND payload site. `scaffoldExistingRepo` builds its own body from its own
    // argument; this one rebuilds it from the stashed params in a different tab.
    expect(calls[0].body?.scripture).toEqual(SCRIPTURE);
    expect(result).toMatchObject({ projectId: "p9", jobId: "j9" });
    // and the result is durably stashed for the main tab's poll to pick up.
    expect(readCreateRepoResult("nonce-1", storage)).toMatchObject({
      projectId: "p9",
      jobId: "j9",
    });
  });

  it("U-PE8a: the SKIPPED path POSTs `blank` with no scripture key", async () => {
    const storage = memStorage();
    stashCreateRepoParams("nonce-1", BLANK_PARAMS, storage);
    const { fetchImpl, calls } = recordingFetch(() =>
      json({ projectId: "p9", jobId: "j9" }, 201),
    );
    await completeCreateRepo("nonce-1", "gh-code", { fetchImpl, storage });
    expect(calls[0].body?.createdFrom).toBe("blank");
    expect("scripture" in (calls[0].body ?? {})).toBe(false);
  });

  it("U-PE9: pollCreateRepoResult (main tab) resolves once the callback writes the result", async () => {
    const storage = memStorage();
    // Simulate the callback tab writing the result after the 2nd poll.
    let ticks = 0;
    const sleep = vi.fn(async () => {
      ticks += 1;
      if (ticks === 2) {
        writeCreateRepoResult(
          "nonce-1",
          { projectId: "p1", jobId: "j1", slug: "psalm-121" },
          storage,
        );
      }
    });
    const result = await pollCreateRepoResult("nonce-1", {
      storage,
      sleep,
      now: () => 0,
      timeoutMs: 10_000,
    });
    expect(result).toMatchObject({ projectId: "p1", jobId: "j1", slug: "psalm-121" });
  });

  it("U-PE10: pollCreateRepoResult returns null on timeout", async () => {
    const storage = memStorage();
    let t = 0;
    const result = await pollCreateRepoResult("nonce-1", {
      storage,
      sleep: async () => {},
      now: () => (t += 5000),
      timeoutMs: 1000,
    });
    expect(result).toBeNull();
  });
});

/**
 * The server-confirmed slug (2026-07-30, plan row 53 item 3).
 *
 * Both wizard tabs set the studio slug from the PRE-CREATION typed repo name:
 * `completeCreateRepo` returns `slug: params.repoName`, and `startRealExisting` uses the
 * picked repo's short name. The api assigns the real slug with `nextFreeSlug`, which
 * appends `-2`/`-3` on a same-owner collision, and `/studio/[slug]` resolves owner-scoped
 * — so the guess can route to a DIFFERENT project or to a 404.
 *
 * That was survivable while a human had to click "Open in studio →" and could re-navigate.
 * Making the redirect automatic converts a latent 404 into an unavoidable one, faster than
 * a person would hit it, so the wizard now ASKS the server. `GET /api/projects/:id`
 * already carries `ProjectDto.slug`, which is why this needed no wire-schema change and no
 * release chain.
 */
describe("fetchProjectSlug — the server's own slug for a just-created project", () => {
  it("U-PE11: reads ProjectDto.slug for the project id the create call returned", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      json({
        project: {
          id: "clx1",
          // The api DE-DUPLICATED the slug the wizard guessed.
          slug: "psalm-121-2",
          name: "psalm-121",
          repoOwner: "ashsrinivas",
          repoName: "psalm-121",
          repoVisibility: "private",
          createdFrom: "passage",
          currentBranch: "v0.0.1",
          thumbnailAssetKey: null,
          lastRenderJobId: null,
          lastOpenedAt: "2026-07-30T00:00:00.000Z",
          createdAt: "2026-07-30T00:00:00.000Z",
        },
      }),
    );
    expect(await fetchProjectSlug("clx1", { fetchImpl })).toBe("psalm-121-2");
    expect(calls[0].url).toBe("/api/projects/clx1");
  });

  it("U-PE12: null on any failure — a non-2xx, a body of the wrong shape, or a throw", async () => {
    const notFound = recordingFetch(() => new Response("", { status: 404 }));
    expect(await fetchProjectSlug("clx1", { fetchImpl: notFound.fetchImpl })).toBeNull();

    const garbage = recordingFetch(() => json({ nope: true }));
    expect(await fetchProjectSlug("clx1", { fetchImpl: garbage.fetchImpl })).toBeNull();

    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchProjectSlug("clx1", { fetchImpl: boom })).toBeNull();
  });
});
