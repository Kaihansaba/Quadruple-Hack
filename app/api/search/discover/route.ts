import { NextRequest, NextResponse } from "next/server";
import { webExtractCall } from "@/lib/openrouter";
import { loadCompanyProfile } from "@/lib/server-profile";
import type { DiscoverProduct, DiscoverResponse } from "@/lib/api-types";
import type { CompanyProfile } from "@/lib/prompts";

const DISCOVER_TIMEOUT_MS = 120_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function profileContext(profile: CompanyProfile | null) {
  if (!profile) return { active: false };

  return {
    active: true,
    name: profile.name,
    industry: profile.industry,
    size: profile.size,
    budget_ceiling: profile.budget_ceiling,
    tech_stack: profile.tech_stack,
    compliance_reqs: profile.compliance_reqs,
    preferred_suppliers: profile.preferred_suppliers
  };
}

function discoverPrompt(need: string, profile: CompanyProfile | null) {
  return JSON.stringify({
    task: "Discover real products for a buyer need using web search evidence.",
    need,
    company_profile: profileContext(profile),
    instructions: [
      "Search the web for real, currently available software/products matching the buyer need.",
      "Return the top 4 credible product matches. If fewer than 4 credible matches exist, return fewer. Do NOT fabricate products.",
      "Every product must have a source_url from web evidence, preferably an official vendor page or credible product page.",
      "Use the active company profile only as optional context for fit. Work normally when no profile exists.",
      "reason must be one concise line explaining why the product fits the stated need.",
      "confidence must be a number from 0 to 1 based on source quality and fit.",
      "Return ONLY JSON with this exact shape: { \"products\": [ { \"name\": string, \"reason\": string, \"category\": string, \"source_url\": string, \"confidence\": number } ] }"
    ]
  });
}

function isDiscoverProduct(value: unknown): value is DiscoverProduct {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const product = value as Partial<DiscoverProduct>;
  return (
    typeof product.name === "string" &&
    product.name.trim().length > 0 &&
    typeof product.reason === "string" &&
    product.reason.trim().length > 0 &&
    typeof product.category === "string" &&
    product.category.trim().length > 0 &&
    typeof product.source_url === "string" &&
    /^https?:\/\//i.test(product.source_url) &&
    typeof product.confidence === "number" &&
    Number.isFinite(product.confidence)
  );
}

function normalizeProducts(value: unknown): DiscoverProduct[] {
  const rawProducts = Array.isArray(value)
    ? value
    : value !== null && typeof value === "object" && Array.isArray((value as { products?: unknown }).products)
      ? (value as { products: unknown[] }).products
      : [];

  const seen = new Set<string>();
  return rawProducts
    .filter(isDiscoverProduct)
    .map((product) => ({
      name: product.name.trim(),
      reason: product.reason.trim(),
      category: product.category.trim(),
      source_url: product.source_url.trim(),
      confidence: Math.max(0, Math.min(1, product.confidence))
    }))
    .filter((product) => {
      const key = product.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { need?: unknown; profile?: unknown };
  const need = typeof body.need === "string" ? body.need.trim() : "";

  if (!need) {
    return NextResponse.json({ error: "Describe what you need to search for.", products: [] }, { status: 400 });
  }

  const shouldLoadStoredProfile =
    body.profile !== undefined ||
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const profile = shouldLoadStoredProfile ? await loadCompanyProfile(body.profile) : null;

  try {
    const raw = await withTimeout(
      webExtractCall([
        {
          role: "system",
          content:
            "You are a B2B product discovery analyst with web search access. Return valid JSON only. Do not invent products or sources."
        },
        { role: "user", content: discoverPrompt(need, profile) }
      ]),
      DISCOVER_TIMEOUT_MS,
      "Product discovery"
    );
    const parsed = JSON.parse(raw) as unknown;
    const products = normalizeProducts(parsed);
    return NextResponse.json({ products } satisfies DiscoverResponse);
  } catch (error) {
    console.error("[Product discovery failed]", error);
    return NextResponse.json(
      {
        error: "Product discovery is unavailable right now. Check the search credentials or try again later.",
        products: []
      } satisfies DiscoverResponse,
      { status: 502 }
    );
  }
}
