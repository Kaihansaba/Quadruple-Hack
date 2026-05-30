import { NextRequest, NextResponse } from "next/server";
import { structuredCall } from "@/lib/openrouter";
import { call1Prompt, type Call1Output } from "@/lib/prompts";
import { sanitizeCall1OutputForProfile } from "@/lib/criteria-sanitizer";
import { DEMO_PROFILE } from "@/lib/demo-profile";
import { parseProducts } from "@/lib/product-parser";
import type { StartResponse } from "@/lib/api-types";

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const products = parseProducts(query as string);
  if (products.length < 2) {
    return NextResponse.json({ error: "Please enter at least two products to compare." }, { status: 400 });
  }

  const profile = DEMO_PROFILE;
  const prompt = call1Prompt(products, profile);
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
    parsed = sanitizeCall1OutputForProfile(JSON.parse(raw) as Call1Output, profile);
  } catch {
    return NextResponse.json({ error: "LLM returned malformed JSON. Please try again." }, { status: 502 });
  }

  const comparisonId = `cmp_${Date.now()}`;

  const response: StartResponse = {
    comparisonId,
    products: products.map((name) => ({ name, url: null })),
    criteria: parsed.criteria,
    questions: parsed.questions
  };

  return NextResponse.json(response);
}
