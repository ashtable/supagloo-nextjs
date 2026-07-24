/**
 * Task #35 — the studio AI-generation data layer (design-delta §6b). Mirrors
 * `studio-data.ts`: injectable `fetch`, Zod-parse via the wire `*ResponseSchema`,
 * return null on any failure (never throws). Fully unit-tested with zero network.
 *
 * Flow (per design-delta §6b, sequence (b)): the studio posts a generation
 * (`POST /api/ai/generations` — the BFF injects provider/model), polls
 * `GET /api/ai/generations/:id` to a terminal status, then presigns the raw
 * `resultAssetKey` via `GET /api/files/presign-download?key=` for the scene preview.
 */
import {
  CreateAiGenerationResponseSchema,
  AiGenerationResponseSchema,
  FilePresignDownloadResponseSchema,
  type AiGenerationDto,
  type AiGenerationKind,
} from "../api/contracts";

interface FetchDep {
  fetchImpl?: typeof fetch;
}
const doFetchOf = (deps: FetchDep) => deps.fetchImpl ?? fetch;

/** The client-side create body. The BFF (`app/api/ai/generations/route.ts`) adds
 *  `{provider, model}` server-side, so the browser never chooses them. `input` is
 *  kind-specific (validated by the API's discriminated union). */
export interface CreateGenerationBody {
  kind: AiGenerationKind;
  projectId?: string;
  sceneId?: string;
  input: unknown;
}

/** `POST /api/ai/generations` → the new generation id. Null on any non-2xx (400
 *  structural / 422 kind_provider_incompatible / 404 / 501) or failure. */
export async function createGeneration(
  body: CreateGenerationBody,
  deps: FetchDep = {},
): Promise<string | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch("/api/ai/generations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const parsed = CreateAiGenerationResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.generationId : null;
  } catch {
    return null;
  }
}

/** `GET /api/ai/generations/:id` → the `AiGenerationDto` (unwraps `{ generation }`).
 *  Null on any non-2xx / parse failure / throw. */
export async function fetchGeneration(
  id: string,
  deps: FetchDep = {},
): Promise<AiGenerationDto | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/ai/generations/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = AiGenerationResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.generation : null;
  } catch {
    return null;
  }
}

/** `GET /api/files/presign-download?key=` → a short-lived presigned GET url for the
 *  scene preview. Null on a denied/unknown key (404) or any failure. */
export async function presignDownload(
  key: string,
  deps: FetchDep = {},
): Promise<string | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(
      `/api/files/presign-download?key=${encodeURIComponent(key)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const parsed = FilePresignDownloadResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.url : null;
  } catch {
    return null;
  }
}

export interface PollGenerationDeps extends FetchDep {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  timeoutMs?: number;
  /** Called with every successfully-read generation (drives any progress UI). */
  onUpdate?: (gen: AiGenerationDto) => void;
}

const DEFAULT_GEN_POLL_INTERVAL_MS = 1500;
const DEFAULT_GEN_POLL_TIMEOUT_MS = 300_000;

const generationTerminal = (gen: AiGenerationDto) =>
  gen.status === "succeeded" ||
  gen.status === "failed" ||
  gen.status === "canceled";

/** Poll a generation until it reaches a terminal status (or the deadline). Calls
 *  `onUpdate` on every read. Returns the terminal generation, or null on timeout.
 *  Mirrors `pollJobUntilTerminal` (provision-effects) but on the AiGeneration
 *  lifecycle. Longer defaults — real media generation is slower than git-ops. */
export async function pollGenerationUntilTerminal(
  id: string,
  deps: PollGenerationDeps = {},
): Promise<AiGenerationDto | null> {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const interval = deps.intervalMs ?? DEFAULT_GEN_POLL_INTERVAL_MS;
  const timeout = deps.timeoutMs ?? DEFAULT_GEN_POLL_TIMEOUT_MS;
  const deadline = now() + timeout;

  for (;;) {
    const gen = await fetchGeneration(id, deps);
    if (gen) {
      deps.onUpdate?.(gen);
      if (generationTerminal(gen)) return gen;
    }
    if (now() >= deadline) return gen && generationTerminal(gen) ? gen : null;
    await sleep(interval);
  }
}
