@AGENTS.md

# Stagehand Project

This is a project that uses Stagehand V3, a browser automation framework with AI-powered `act`, `extract`, `observe`, and `agent` methods.

The main class can be imported as `Stagehand` from `@browserbasehq/stagehand`.

**Key Classes:**

- `Stagehand`: Main orchestrator class providing `act`, `extract`, `observe`, and `agent` methods
- `context`: A `V3Context` object that manages browser contexts and pages
- `page`: Individual page objects accessed via `stagehand.context.pages()[i]` or created with `stagehand.context.newPage()`

## Initialize

```typescript
import { Stagehand } from "@browserbasehq/stagehand";

const stagehand = new Stagehand({
  env: "LOCAL", // or "BROWSERBASE"
  verbose: 2, // 0, 1, or 2
  // All LLM calls route through Gloo AI Studio — see "LLM Provider: Gloo AI Studio"
  // below. Gloo is wired in via a custom `llmClient` (NOT the `model` field):
  // Stagehand's `openai/...` path uses the Responses API, which Gloo does not honor
  // for structured output, so we use its chat-completions endpoint instead.
  // glooLlmClient() defaults to the GLOO_STAGEHAND_MODEL env var (gloo-openai-gpt-5-mini).
  llmClient: await glooLlmClient(),
});

await stagehand.init();

// Access the browser context and pages
const page = stagehand.context.pages()[0];
const context = stagehand.context;

// Create new pages if needed
const page2 = await stagehand.context.newPage();
```

## LLM Provider: Gloo AI Studio

**Until OpenRouter support is added, ALL LLM calls (`act`, `extract`, `observe`) route through Gloo AI Studio via a custom `llmClient`.** Do not configure direct OpenAI/Anthropic/Google keys, and do **not** use the `model: "openai/…"` field — see "Why a custom `llmClient`" below.

Gloo authenticates via **OAuth2 client credentials** (exchange client id/secret → ~1h bearer token) and exposes an OpenAI-compatible **chat-completions** endpoint at `https://platform.ai.gloo.com/ai/v2`. We point the AI SDK OpenAI client's `.chat()` model at it and hand the result to Stagehand as `llmClient`.

### 1. Credentials (`.env.local`, already set — never commit)

```bash
GLOO_CLIENT_ID=...            # from Gloo AI Studio → Manage API Credentials
GLOO_CLIENT_SECRET=...
GLOO_STAGEHAND_MODEL=gloo-openai-gpt-5-mini   # Gloo model id
```

Full model catalog: `GET https://platform.ai.gloo.com/platform/v2/models` (or the Studio Model Explorer). Ids are namespaced, e.g. `gloo-openai-gpt-5-mini`, `gloo-anthropic-claude-sonnet-4.5`.

### 2. Fetch an OAuth access token (valid ~1 hour)

```typescript
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
    throw new Error(`Gloo token request failed: ${res.status} ${await res.text()}`);
  }
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token; // Bearer token, ~1 hour TTL
}
```

### 3. Build the Gloo `llmClient`

`createOpenAI(...).chat(id)` targets Gloo's `/ai/v2/chat/completions` and emits `response_format: { type: "json_schema" }` — the structured-output shape Gloo honors. Wrap it in Stagehand's `AISdkClient`.

```typescript
import { AISdkClient, LLMClient } from "@browserbasehq/stagehand";
import { createOpenAI } from "@ai-sdk/openai";

// Call with no args to use GLOO_STAGEHAND_MODEL, or pass an explicit Gloo model id.
export async function glooLlmClient(
  glooModelId = process.env.GLOO_STAGEHAND_MODEL!,
): Promise<LLMClient> {
  const gloo = createOpenAI({
    baseURL: "https://platform.ai.gloo.com/ai/v2", // chat-completions surface
    apiKey: await getGlooAccessToken(),            // OAuth Bearer token
  });
  // .chat() => /chat/completions + json_schema structured outputs (NOT the Responses API)
  return new AISdkClient({ model: gloo.chat(glooModelId) });
}
```

Wire it into Stagehand (as shown in **Initialize** above):

```typescript
const stagehand = new Stagehand({
  env: "LOCAL",
  verbose: 2,
  llmClient: await glooLlmClient(), // → gloo-openai-gpt-5-mini via GLOO_STAGEHAND_MODEL
});
await stagehand.init();
```

### Why a custom `llmClient` (not `model: "openai/…"`)

Stagehand's `openai/` model prefix uses the AI SDK's default OpenAI path, which is the **Responses API** (`POST {baseURL}/responses`). Gloo's Responses endpoint (`/ai/v1/responses`) **ignores structured-output formatting** — it returns plain prose where Stagehand expects schema-shaped JSON, so `extract`/`observe` fail (`AI_APICallError: Invalid JSON response`). Gloo's **chat-completions** endpoint (`/ai/v2/chat/completions`) does honor `response_format: json_schema`, and `.chat()` is the only AI SDK path that emits it (the `@ai-sdk/openai-compatible` provider emits `json_object`, which Gloo rejects unless the prompt literally contains "json"). The `llmClient` above is the verified working path (checked against the live Gloo API on 2026-07-15).

### Caveats

- **Token expiry (~1 hour):** `glooLlmClient()` fetches a fresh token at construction — fine for short runs. For long-running processes, rebuild the client/Stagehand instance before expiry, or pass a `fetch` wrapper to `createOpenAI` that injects a fresh Bearer token per request.
- **`agent()`:** takes its own model config via `stagehand.agent({ … })`, separate from the top-level `llmClient`; CUA mode needs a computer-use model — confirm Gloo exposes one before using `mode: "cua"`.
- Docs: https://docs.gloo.com/getting-started/overview

## Act

Actions are called on the `stagehand` instance (not the page). Use atomic, specific instructions:

```typescript
// Act on the current active page
await stagehand.act("click the sign in button");

// Act on a specific page (when you need to target a page that isn't currently active)
await stagehand.act("click the sign in button", { page: page2 });
```

**Important:** Act instructions should be atomic and specific:

- ✅ Good: "Click the sign in button" or "Type 'hello' into the search input"
- ❌ Bad: "Order me pizza" or "Type in the search bar and hit enter" (multi-step)

### Observe + Act Pattern (Recommended)

Cache the results of `observe` to avoid unexpected DOM changes:

```typescript
const instruction = "Click the sign in button";

// Get candidate actions
const actions = await stagehand.observe(instruction);

// Execute the first action
await stagehand.act(actions[0]);
```

To target a specific page:

```typescript
const actions = await stagehand.observe("select blue as the favorite color", {
  page: page2,
});
await stagehand.act(actions[0], { page: page2 });
```

## Extract

Extract data from pages using natural language instructions. The `extract` method is called on the `stagehand` instance.

### Basic Extraction (with schema)

```typescript
import { z } from "zod";

// Extract with explicit schema
const data = await stagehand.extract(
  "extract all apartment listings with prices and addresses",
  z.object({
    listings: z.array(
      z.object({
        price: z.string(),
        address: z.string(),
      }),
    ),
  }),
);

console.log(data.listings);
```

### Simple Extraction (without schema)

```typescript
// Extract returns a default object with 'extraction' field
const result = await stagehand.extract("extract the sign in button text");

console.log(result);
// Output: { extraction: "Sign in" }

// Or destructure directly
const { extraction } = await stagehand.extract(
  "extract the sign in button text",
);
console.log(extraction); // "Sign in"
```

### Targeted Extraction

Extract data from a specific element using a selector:

```typescript
const reason = await stagehand.extract(
  "extract the reason why script injection fails",
  z.string(),
  { selector: "/html/body/div[2]/div[3]/iframe/html/body/p[2]" },
);
```

### URL Extraction

When extracting links or URLs, use `z.string().url()`:

```typescript
const { links } = await stagehand.extract(
  "extract all navigation links",
  z.object({
    links: z.array(z.string().url()),
  }),
);
```

### Extracting from a Specific Page

```typescript
// Extract from a specific page (when you need to target a page that isn't currently active)
const data = await stagehand.extract(
  "extract the placeholder text on the name field",
  { page: page2 },
);
```

## Observe

Plan actions before executing them. Returns an array of candidate actions:

```typescript
// Get candidate actions on the current active page
const [action] = await stagehand.observe("Click the sign in button");

// Execute the action
await stagehand.act(action);
```

Observing on a specific page:

```typescript
// Target a specific page (when you need to target a page that isn't currently active)
const actions = await stagehand.observe("find the next page button", {
  page: page2,
});
await stagehand.act(actions[0], { page: page2 });
```

## Agent

Use the `agent` method to autonomously execute complex, multi-step tasks.

### Basic Agent Usage

```typescript
const page = stagehand.context.pages()[0];
await page.goto("https://www.google.com");

const agent = stagehand.agent({
  model: "google/gemini-2.0-flash",
  executionModel: "google/gemini-2.0-flash",
});

const result = await agent.execute({
  instruction: "Search for the stock price of NVDA",
  maxSteps: 20,
});

console.log(result.message);
```

### Computer Use Agent (CUA)

For more advanced scenarios using computer-use models:

```typescript
const agent = stagehand.agent({
  mode: "cua", // Enable Computer Use Agent mode
  model: "anthropic/claude-sonnet-4-6",
  // or "google/gemini-2.5-computer-use-preview-10-2025"
  systemPrompt: `You are a helpful assistant that can use a web browser.
    Do not ask follow up questions, the user will trust your judgement.`,
});

await agent.execute({
  instruction: "Apply for a library card at the San Francisco Public Library",
  maxSteps: 30,
});
```

### Agent with Custom Model Configuration

```typescript
const agent = stagehand.agent({
  mode: "cua",
  model: {
    modelName: "google/gemini-2.5-computer-use-preview-10-2025",
    apiKey: process.env.GEMINI_API_KEY,
  },
  systemPrompt: `You are a helpful assistant.`,
});
```

### Agent with Integrations (MCP/External Tools)

```typescript
const agent = stagehand.agent({
  integrations: [`https://mcp.exa.ai/mcp?exaApiKey=${process.env.EXA_API_KEY}`],
  systemPrompt: `You have access to the Exa search tool.`,
});
```

## Advanced Features

### DeepLocator (XPath Targeting)

Target specific elements across shadow DOM and iframes:

```typescript
await page
  .deepLocator("/html/body/div[2]/div[3]/iframe/html/body/p")
  .highlight({
    durationMs: 5000,
    contentColor: { r: 255, g: 0, b: 0 },
  });
```

### Multi-Page Workflows

```typescript
const page1 = stagehand.context.pages()[0];
await page1.goto("https://example.com");

const page2 = await stagehand.context.newPage();
await page2.goto("https://example2.com");

// Act/extract/observe operate on the current active page by default
// Pass { page } option to target a specific page
await stagehand.act("click button", { page: page1 });
await stagehand.extract("get title", { page: page2 });
```