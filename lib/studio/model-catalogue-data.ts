import {
  AiModelCatalogueResponseSchema,
  type AiModelCatalogueResponse,
} from "../api/contracts";

/**
 * `GET /api/ai/models` — the live provider/model catalogue behind the Inspector's model
 * selectors and its cost estimate (genesis-1 items 1 and 3).
 *
 * Same contract as every other reader in `lib/studio/`: injectable `fetch`, Zod-parse
 * against the wire schema, and **null on any failure — never a throw**. These run inside
 * client components, so a throw takes the whole editor down, and a model picker is not
 * worth the editor.
 *
 * `null` (could not ask) is kept distinct from `{models: []}` (asked; there genuinely are
 * none), exactly as the scripture picker keeps them distinct. Collapsing them would make
 * a momentary network blip render as a confident "no models available".
 */

interface FetchDep {
  fetchImpl?: typeof fetch;
}

export async function fetchModelCatalogue(
  deps: FetchDep = {},
): Promise<AiModelCatalogueResponse | null> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch("/api/ai/models", { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = AiModelCatalogueResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
