import { NextRequest, NextResponse } from "next/server";
import { structuredCall, perplexitySearchCall } from "@/lib/openrouter";
import { call1Prompt, searchPrompt, type Call1Output } from "@/lib/prompts";
import { sanitizeCall1OutputForProfile } from "@/lib/criteria-sanitizer";
import { DEMO_PROFILE } from "@/lib/demo-profile";
import { parseProducts } from "@/lib/product-parser";
import { buildStartResponse, type StartDocument } from "@/lib/start-response";

export async function POST(req: NextRequest) {
  const { query, documents = [] } = (await req.json()) as {
    query?: string;
    documents?: StartDocument[];
  };
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const products = parseProducts(query as string);
  if (products.length < 2) {
    return NextResponse.json({ error: "Please enter at least two products to compare." }, { status: 400 });
  }

  const profile = DEMO_PROFILE;

  let searchContext: string | undefined;
  try {
    searchContext = await perplexitySearchCall(searchPrompt(products));
    console.log("[Perplexity search result]\n", searchContext);
  } catch (err) {
    console.error("[Perplexity search failed]", err);
    // fall back to no search context — Call 1 proceeds with parametric knowledge
  }

  const prompt = call1Prompt(products, profile, searchContext);
  // let parsed: Call1Output;
  let parsed: any;
  try {
    const raw = await structuredCall([
      {
        role: "system",
        content:
          "You are a B2B procurement analyst. Always respond with valid JSON matching the schema requested. No prose outside JSON."
      },
      { role: "user", content: prompt }
    ]);
    const llmOut = JSON.parse(raw) as Call1Output;
    if ((llmOut as any).error) {
      return NextResponse.json({ error: (llmOut as any).error }, { status: 422 });
    }
    parsed =
      llmOut.comparability?.verdict === "incomparable"
        ? llmOut
        : sanitizeCall1OutputForProfile(llmOut, profile);
  } catch {
    return NextResponse.json({ error: "LLM returned malformed JSON. Please try again." }, { status: 502 });
  }

  const comparisonId = `cmp_${Date.now()}`;
  const response = buildStartResponse({
    comparisonId,
    products,
    parsed,
    documents
  });

  return NextResponse.json(response);
}
