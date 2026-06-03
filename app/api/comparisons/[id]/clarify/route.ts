import { NextRequest, NextResponse } from "next/server";
import { webExtractCall, narrateCall } from "@/lib/openrouter";
import { call2Prompt, call3Prompt, type Call1Output, type Call2Output, type PricingModel } from "@/lib/prompts";
import { sanitizeCall1OutputForProfile } from "@/lib/criteria-sanitizer";
import { runDecisionEngine } from "@/lib/engine/decision-engine";
import { computeRobustness } from "@/lib/engine/robustness";
import { saveStoredComparison } from "@/lib/server-comparison-store";
import { loadCompanyProfile } from "@/lib/server-profile";
import type { DecisionEngineInput, ExtractedValue, Criterion } from "@/lib/engine/types";
import type { ClarifyBody, ClarifyResponse, DocumentPage, StartProduct } from "@/lib/api-types";

// Fuzzy-match a model-generated criterion ID to the nearest canonical ID.
// Handles cases where the LLM invents slight variations (e.g. "soc2_type2" → "soc2_type_ii").
function normalizeCriterionId(raw: string, canonicalIds: string[]): string {
  if (canonicalIds.includes(raw)) return raw;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedRaw = normalize(raw);

  // Exact match after stripping punctuation
  const stripped = canonicalIds.find((id) => normalize(id) === normalizedRaw);
  if (stripped) return stripped;

  // Word-overlap score
  const rawWords = normalizedRaw.split(/(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])/);
  let best = canonicalIds[0];
  let bestScore = -1;
  for (const id of canonicalIds) {
    const idNorm = normalize(id);
    const overlap = rawWords.filter((w) => idNorm.includes(w) || w.includes(idNorm)).length;
    const score = overlap / Math.max(rawWords.length, 1) + (idNorm.includes(normalizedRaw) || normalizedRaw.includes(idNorm) ? 0.5 : 0);
    if (score > bestScore) { bestScore = score; best = id; }
  }

  return best;
}

function robustnessIterations() {
  const parsed = Number.parseInt(process.env.ROBUSTNESS_ITERATIONS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
}

function weightsFromCriteria(criteria: Criterion[]) {
  return Object.fromEntries(
    criteria
      .filter((criterion) => criterion.type === "soft")
      .map((criterion) => [criterion.id, criterion.weight ?? 0])
  );
}

function productDocuments(products: StartProduct[]) {
  return products
    .filter((product) => product.documentText?.trim())
    .map((product) => ({
      productName: product.name,
      text: product.documentText ?? "",
      perPage: product.perPage as DocumentPage[] | undefined
    }));
}

function pricingModelFor(
  productName: string,
  call2: Call2Output,
  criteria: Call1Output["criteria"]
): PricingModel | undefined {
  const target = normalizeProductName(productName);
  return (
    call2.pricing_models?.find((entry) => normalizeProductName(entry.product_name) === target)?.pricing_model ??
    derivePricingModelFromExtractedValue(productName, call2, criteria)
  );
}

function normalizeProductName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function findEngineProduct(products: Array<{ id: string; name: string }>, productName: string) {
  const target = normalizeProductName(productName);
  return products.find((product) => normalizeProductName(product.name) === target);
}

function isPriceCriterion(criterion: Call1Output["criteria"][number]) {
  return /\b(price|pricing|cost|subscription|license|annual)\b/i.test(
    `${criterion.id} ${criterion.name} ${criterion.unit}`
  ) || /\b(usd|eur|gbp)\b|\$/i.test(criterion.unit);
}

function parsePriceAmount(rawValue: string) {
  const match = rawValue.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function derivePricingModelFromExtractedValue(
  productName: string,
  call2: Call2Output,
  criteria: Call1Output["criteria"]
): PricingModel | undefined {
  const target = normalizeProductName(productName);
  const priceCriterionIds = new Set(criteria.filter(isPriceCriterion).map((criterion) => criterion.id));
  if (priceCriterionIds.size === 0) return undefined;

  const priceEvidence = call2.extracted_values
    .filter(
      (value) =>
        normalizeProductName(value.product_name) === target &&
        priceCriterionIds.has(value.criterion_id)
    )
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (!priceEvidence) return undefined;

  const rawValue = String(priceEvidence.raw_value);
  const amount = parsePriceAmount(rawValue);
  if (amount === null) return undefined;

  const period = /\b(month|monthly|mo)\b|\/mo\b/i.test(rawValue) ? "month" : "year";
  const unitMatch = rawValue.match(/\b(seat|user|license)\b/i);
  const unit = unitMatch?.[1].toLowerCase() ?? null;
  const isPerUnit = Boolean(unit && /\b(per|\/)\s*(seat|user|license)\b|\/(seat|user|license)\b/i.test(rawValue));

  return {
    type: isPerUnit ? "per_seat" : "flat",
    currency: /\bEUR\b|€/i.test(rawValue) ? "EUR" : /\bGBP\b|£/i.test(rawValue) ? "GBP" : "USD",
    base_price: isPerUnit ? 0 : amount,
    per_unit_price: isPerUnit ? amount : null,
    unit,
    period,
    tiers: null,
    minimum: null,
    notes: `Derived from extracted ${priceEvidence.criterion_id} evidence: ${rawValue}`,
    source_url: priceEvidence.source_url,
    confidence: Math.min(priceEvidence.confidence, 0.7)
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: comparisonId } = await params;

  const body: ClarifyBody & {
    products: StartProduct[];
    criteria: Call1Output["criteria"];
  } = await req.json();

  const { products, answers } = body;
  const documents = productDocuments(products);
  if (documents.length > 0) {
    console.log(
      "[TEMP document-plumbing] clarify received document text",
      documents.map((document) => ({
        productName: document.productName,
        textLength: document.text.length,
        pageCount: document.perPage?.length ?? 0
      }))
    );
  }
  const profile = await loadCompanyProfile(body.profile);
  const criteria = sanitizeCall1OutputForProfile(
    {
      comparability: {
        verdict: "comparable",
        category: null,
        reason: "Products already passed the start-step comparability check."
      },
      criteria: body.criteria,
      questions: []
    },
    profile
  ).criteria;
  const canonicalIds = criteria.map((c) => c.id);

  // Call 2: extraction + web search + weight proposal
  const prompt = call2Prompt(
    products.map((p) => p.name),
    criteria,
    answers.map((a) => ({ question: a.question, answer: a.answer })),
    profile,
    documents.length > 0 ? documents : undefined
  );

  let call2: Call2Output;
  try {
    const raw = await webExtractCall([
      {
        role: "system",
        content:
          "You are a B2B procurement research assistant with web search access. Extract evidence for each product and criterion. Return valid JSON only. Use criterion_id values EXACTLY as given in valid_criterion_ids."
      },
      { role: "user", content: prompt }
    ]);
    call2 = JSON.parse(raw) as Call2Output;
  } catch {
    return NextResponse.json({ error: "Extraction failed. Please try again." }, { status: 502 });
  }

  // Normalize criterion IDs — guard against LLM inventing its own slugs
  call2.extracted_values = call2.extracted_values.map((ev) => ({
    ...ev,
    criterion_id: normalizeCriterionId(ev.criterion_id, canonicalIds)
  }));

  // Build engine input
  const engineProducts = products.map((p, i) => {
    const pricingModel = pricingModelFor(p.name, call2, criteria);
    return {
      id: `prod_${i}`,
      name: p.name,
      url: p.url ?? "",
      logoUrl: undefined,
      rawMetadata: pricingModel ? { pricing_model: pricingModel } : undefined
    };
  });

  const softIds = criteria.filter((c) => c.type === "soft").map((c) => c.id);
  const engineCriteria: Criterion[] = criteria.map((c) => ({
    ...c,
    // Only apply proposed weights to soft criteria; never touch hard criteria weights
    weight: c.type === "soft" ? (call2.proposed_weights[c.id] ?? c.weight) : null
  }));

  // Normalize soft weights to sum to 1 in case the LLM's proposal is off
  const softTotal = softIds.reduce((s, id) => {
    const c = engineCriteria.find((ec) => ec.id === id);
    return s + (c?.weight ?? 0);
  }, 0);
  const normalizedCriteria: Criterion[] = engineCriteria.map((c) =>
    c.type === "soft" && softTotal > 0
      ? { ...c, weight: (c.weight ?? 0) / softTotal }
      : c
  );

  const extractedValues: ExtractedValue[] = call2.extracted_values.flatMap((ev, i) => {
    const product = findEngineProduct(engineProducts, ev.product_name);
    if (!product) {
      return [];
    }

    return [{
      id: `ev_${i}`,
      productId: product.id,
      criterionId: ev.criterion_id,
      rawValue: ev.raw_value,
      sourceUrl: ev.source_url,
      sourceType: ev.source_type,
      confidence: ev.confidence
    }];
  });

  const droppedEvidenceCount = call2.extracted_values.length - extractedValues.length;
  if (droppedEvidenceCount > 0) {
    console.warn(
      `[comparison:${comparisonId}] Dropped ${droppedEvidenceCount} extracted value(s) with unknown product names.`
    );
  }

  const engineInput: DecisionEngineInput = {
    comparisonId,
    title: products.map((p) => p.name).join(" vs "),
    products: engineProducts,
    criteria: normalizedCriteria,
    extractedValues
  };

  const result = runDecisionEngine(engineInput);
  const robustness = computeRobustness(engineInput, normalizedCriteria, weightsFromCriteria(normalizedCriteria), {
    iterations: robustnessIterations()
  });

  // Call 3: verdict narration
  const rankedProducts = result.rankings.map((r) => ({
    name: engineProducts.find((p) => p.id === r.productId)?.name ?? r.productId,
    score: r.score,
    eliminated: r.eliminated
  }));

  // Skip Call 3 if every product was eliminated — no ranking to narrate
  const allEliminated = result.rankings.every((r) => r.eliminated);
  let verdict = "";

  if (allEliminated) {
    const reasons = result.eliminated
      .map((e) => `${e.productName} failed "${e.criterionName}"`)
      .join("; ");
    const requirementOwner = profile?.name ? `${profile.name}'s` : "the";
    verdict = `No vendor passed ${requirementOwner} mandatory requirements. ${reasons}. Consider expanding the shortlist or re-evaluating the hard criteria.`;
  } else {
    // Build a characteristic-level evidence table (real extracted values + where they
    // came from) so the verdict can reason about products, not scoring math.
    const productName = (productId: string) =>
      engineProducts.find((p) => p.id === productId)?.name ?? productId;
    const criterionName = (criterionId: string) =>
      normalizedCriteria.find((c) => c.id === criterionId)?.name ?? criterionId;
    const activeRanked = rankedProducts.filter((r) => !r.eliminated);
    const evidence = result.cells
      .filter((cell) => !cell.missing && cell.rawValue !== null)
      .map((cell) => ({
        product: productName(cell.productId),
        criterion: criterionName(cell.criterionId),
        raw_value: cell.rawValue,
        source_type: cell.sourceType,
        source_url: cell.sourceUrl
      }));

    try {
      verdict = await narrateCall([
        {
          role: "system",
          content: "You are a B2B procurement analyst. Explain decisions through concrete product characteristics, never internal scoring math."
        },
        {
          role: "user",
          content: call3Prompt(
            activeRanked[0]?.name ?? rankedProducts[0]?.name ?? "the recommended option",
            activeRanked[1]?.name ?? null,
            normalizedCriteria.map((c) => ({
              id: c.id,
              name: c.name,
              unit: c.unit,
              direction: c.direction
            })),
            evidence,
            result.eliminated.map((e) => ({ productName: e.productName, criterionName: e.criterionName })),
            profile
          )
        }
      ]);
    } catch {
      verdict = "Verdict generation failed. See scorecard for details.";
    }
  }

  const response: ClarifyResponse = {
    result,
    criteria: normalizedCriteria,
    products: engineProducts.map((p) => ({ id: p.id, name: p.name })),
    verdict,
    robustness,
    profile,
    engineInput
  };

  saveStoredComparison(comparisonId, {
    engineInput,
    criteria: normalizedCriteria,
    products: response.products,
    result,
    robustness,
    verdict,
    messages: []
  });

  return NextResponse.json(response);
}
