import { AISdkClient, LLMClient } from "@browserbasehq/stagehand";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * Exchange the Gloo AI Studio OAuth2 client-credentials for a short-lived
 * (~1 hour) bearer token. See CLAUDE.md "LLM Provider: Gloo AI Studio".
 */
export async function getGlooAccessToken(): Promise<string> {
  const basic = Buffer.from(
    `${process.env.GLOO_CLIENT_ID}:${process.env.GLOO_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch("https://platform.ai.gloo.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "api/access",
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Gloo token request failed: ${res.status} ${await res.text()}`,
    );
  }
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token; // Bearer token, ~1 hour TTL
}

/**
 * Build a Stagehand `llmClient` backed by Gloo AI Studio's chat-completions
 * surface (`/ai/v2/chat/completions`).
 *
 * `createOpenAI(...).chat(id)` emits `response_format: { type: "json_schema" }`
 * — the structured-output shape Gloo honors. We do NOT use Stagehand's
 * `model: "openai/…"` path because that hits the Responses API, which Gloo
 * ignores for structured output (`extract`/`observe` then fail). See CLAUDE.md.
 *
 * Call with no args to use `GLOO_STAGEHAND_MODEL`, or pass an explicit Gloo id.
 */
export async function glooLlmClient(
  glooModelId = process.env.GLOO_STAGEHAND_MODEL!,
): Promise<LLMClient> {
  const gloo = createOpenAI({
    baseURL: "https://platform.ai.gloo.com/ai/v2", // chat-completions surface
    apiKey: await getGlooAccessToken(), // OAuth Bearer token
  });
  // .chat() => /chat/completions + json_schema structured outputs.
  return new AISdkClient({ model: gloo.chat(glooModelId) });
}
