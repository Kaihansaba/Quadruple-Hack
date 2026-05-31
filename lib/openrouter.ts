const BASE = "https://openrouter.ai/api/v1";

// Call 1 & interpret: no web search needed — reliable JSON output
const MODEL_JSON = process.env.OPENROUTER_MODEL_JSON ?? "anthropic/claude-sonnet-4-5";
// Call 2: needs live web evidence — :online suffix enables OpenRouter web plugin
const MODEL_WEB = process.env.OPENROUTER_MODEL_EXTRACT ?? "anthropic/claude-sonnet-4-5:online";
// Call 3 narration: no JSON, no web
const MODEL_NARRATE = process.env.OPENROUTER_MODEL_NARRATE ?? "anthropic/claude-haiku-4-5";
// Pre-search: grounded product research for Call 1 criteria/question setup
const MODEL_SEARCH = process.env.OPENROUTER_MODEL_SEARCH ?? "perplexity/sonar-pro";

type Message = { role: "system" | "user" | "assistant"; content: string };

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

async function chat(model: string, messages: Message[], json: boolean): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    ...(json ? { response_format: { type: "json_object" } } : {})
  };

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://verdict.app",
      "X-Title": "Verdict"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`Unexpected response shape: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return content;
}

// Call 1: criteria + questions — JSON, no web
export async function structuredCall(messages: Message[]): Promise<string> {
  const raw = await chat(MODEL_JSON, messages, true);
  return stripFences(raw);
}

export async function perplexitySearchCall(query: string): Promise<string> {
  const raw = await chat(MODEL_SEARCH, [{ role: "user", content: query }], false);
  return stripFences(raw);
}

// Call 2: extraction — web search enabled; JSON mode off to avoid plugin conflict
export async function webExtractCall(messages: Message[]): Promise<string> {
  const raw = await chat(MODEL_WEB, messages, false);
  const stripped = stripFences(raw);
  JSON.parse(stripped); // throws if malformed, caller handles
  return stripped;
}

// Call 3: verdict — plain prose, no JSON
export async function narrateCall(messages: Message[]): Promise<string> {
  return chat(MODEL_NARRATE, messages, false);
}

// Chat intent interpretation — JSON, no web
export async function jsonCall(messages: Message[]): Promise<string> {
  const raw = await chat(MODEL_JSON, messages, true);
  return stripFences(raw);
}
