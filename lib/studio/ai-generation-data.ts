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
import type { PresignedAsset } from "./presign-refresh";

export type { PresignedAsset };

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

/**
 * `GET /api/files/presign-download?key=` → a short-lived presigned GET url for the scene
 * preview, **with its expiry**. Null on a denied/unknown key (404) or any failure.
 *
 * Feature 6: this used to return `Promise<string | null>` and drop `expiresAt` on the
 * floor — `return parsed.success ? parsed.data.url : null;`. `expiresAt` has ridden this
 * wire end-to-end since task #13 (`FilePresignDownloadResponseSchema = {url, expiresAt}`,
 * serialized by files.ts / gallery.ts / renders.ts, passed verbatim by the BFF); the only
 * place it died was here. The signature is what mattered: with `string | null` there was
 * no way for any caller to even ASK when a URL stops working, so the studio's 300 s
 * presigns silently became broken media five minutes into every session.
 *
 * Returning the pair (rather than adding a second function) is deliberate — a parallel
 * `presignDownloadWithExpiry` would leave the lossy one in place for the next caller to
 * reach for.
 */
export async function presignDownload(
  key: string,
  deps: FetchDep = {},
): Promise<PresignedAsset | null> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(
      `/api/files/presign-download?key=${encodeURIComponent(key)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const parsed = FilePresignDownloadResponseSchema.safeParse(await res.json());
    return parsed.success
      ? { url: parsed.data.url, expiresAt: parsed.data.expiresAt }
      : null;
  } catch {
    return null;
  }
}

/**
 * `POST /api/ai/generations/:id/cancel` — figure 20a's Cancel.
 *
 * Three outcomes, and they are genuinely different:
 *   - `"canceled"` — the api flipped it; the lock comes down.
 *   - `"refused"` — 409 `generation_not_cancelable`. The generation is past the point of
 *     no return. The lock STAYS UP and says so: dropping it would let the result land
 *     into an editor the user had resumed editing, which is the race the lock exists to
 *     prevent.
 *   - `"failed"` — anything else (404, network, unparseable). Treated like a refusal for
 *     safety, and distinguished so the card can say something different.
 */
export type CancelGenerationOutcome = "canceled" | "refused" | "failed";

export async function cancelGeneration(
  id: string,
  deps: FetchDep = {},
): Promise<CancelGenerationOutcome> {
  const doFetch = doFetchOf(deps);
  try {
    const res = await doFetch(`/api/ai/generations/${id}/cancel`, {
      method: "POST",
    });
    if (res.ok) return "canceled";
    return res.status === 409 ? "refused" : "failed";
  } catch {
    return "failed";
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
