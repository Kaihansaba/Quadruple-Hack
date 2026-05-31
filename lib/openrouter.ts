const BASE = "https://openrouter.ai/api/v1";

// Call 1 & interpret: no web search needed — reliable JSON output
const MODEL_JSON = process.env.OPENROUTER_MODEL_JSON ?? "anthropic/claude-opus-4-5";
// Call 2: needs live web evidence — :online suffix enables OpenRouter web plugin
const MODEL_WEB = process.env.OPENROUTER_MODEL_EXTRACT ?? "anthropic/claude-opus-4-5:online";
// Call 3 narration: no JSON, no web
const MODEL_NARRATE = process.env.OPENROUTER_MODEL_NARRATE ?? "anthropic/claude-opus-4-5";
// Pre-search: grounded product research for Call 1 criteria/question setup
const MODEL_SEARCH = process.env.OPENROUTER_MODEL_SEARCH ?? "perplexity/sonar-pro-search";

type Message = { role: "system" | "user" | "assistant"; content: string };

type JsonRecoveryPath = "direct" | "fenced" | "balanced";

function parseJsonCandidate(candidate: string) {
  JSON.parse(candidate);
  return candidate.trim();
}

function fencedJsonCandidates(raw: string): string[] {
  return [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)].map((match) => match[1]);
}

function balancedJsonCandidates(raw: string): string[] {
  const candidates: string[] = [];

  for (let start = 0; start < raw.length; start += 1) {
    const opener = raw[start];
    if (opener !== "{" && opener !== "[") continue;

    const expectedClosers = opener === "{" ? ["}"] : ["]"];
    const stack = [...expectedClosers];
    let inString = false;
    let escaped = false;

    for (let index = start + 1; index < raw.length; index += 1) {
      const char = raw[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = inString;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === "{") {
        stack.push("}");
      } else if (char === "[") {
        stack.push("]");
      } else if (char === "}" || char === "]") {
        if (stack.at(-1) !== char) break;
        stack.pop();
        if (stack.length === 0) {
          candidates.push(raw.slice(start, index + 1));
          break;
        }
      }
    }
  }

  return candidates;
}

export function extractJsonFromModelResponse(raw: string): { json: string; path: JsonRecoveryPath } {
  try {
    return { json: parseJsonCandidate(raw), path: "direct" };
  } catch {
    // Continue through recovery paths.
  }

  for (const candidate of fencedJsonCandidates(raw)) {
    try {
      return { json: parseJsonCandidate(candidate), path: "fenced" };
    } catch {
      // Try the next fenced block, if any.
    }
  }

  for (const candidate of balancedJsonCandidates(raw)) {
    try {
      return { json: parseJsonCandidate(candidate), path: "balanced" };
    } catch {
      // Try the next balanced-looking object/array, if any.
    }
  }

  throw new Error("No valid JSON found in model response.");
}

function logJsonRecoveryPath(callName: string, path: JsonRecoveryPath, attempt: number) {
  console.warn(`[TEMP json-recovery] ${callName}: ${path} parse succeeded on attempt ${attempt}`);
}

async function jsonResponseCall(model: string, messages: Message[], json: boolean, callName: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = await chat(model, messages, json);
    try {
      const parsed = extractJsonFromModelResponse(raw);
      logJsonRecoveryPath(callName, parsed.path, attempt);
      return parsed.json;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to parse model JSON response.");
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
  return jsonResponseCall(MODEL_JSON, messages, true, "structuredCall");
}

export async function perplexitySearchCall(query: string): Promise<string> {
  const raw = await chat(MODEL_SEARCH, [{ role: "user", content: query }], false);
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

// Call 2: extraction — web search enabled; JSON mode off to avoid plugin conflict
export async function webExtractCall(messages: Message[]): Promise<string> {
  return jsonResponseCall(MODEL_WEB, messages, false, "webExtractCall");
}

// Call 3: verdict — plain prose, no JSON
export async function narrateCall(messages: Message[]): Promise<string> {
  return chat(MODEL_NARRATE, messages, false);
}

// Chat intent interpretation — JSON, no web
export async function jsonCall(messages: Message[]): Promise<string> {
  return jsonResponseCall(MODEL_JSON, messages, true, "jsonCall");
}
