import { NextRequest, NextResponse } from "next/server";
import { webExtractCall, narrateCall } from "@/lib/openrouter";
import { call2Prompt, call3Prompt, type Call1Output, type Call2Output } from "@/lib/prompts";
import { DEMO_PROFILE } from "@/lib/demo-profile";
import { sanitizeCall1OutputForProfile } from "@/lib/criteria-sanitizer";
import { runDecisionEngine } from "@/lib/engine/decision-engine";
import { computeRobustness } from "@/lib/engine/robustness";
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await params;

  const body: ClarifyBody & {
    products: StartProduct[];
    criteria: Call1Output["criteria"];
  } = await req.json();

  const { products, answers } = body;
  const documents = productDocuments(products);
  const profile = DEMO_PROFILE;
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
  const engineProducts = products.map((p, i) => ({
    id: `prod_${i}`,
    name: p.name,
    url: p.url ?? "",
    logoUrl: undefined
  }));

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

  const extractedValues: ExtractedValue[] = call2.extracted_values.map((ev, i) => {
    const product = engineProducts.find((p) => p.name === ev.product_name);
    return {
      id: `ev_${i}`,
      productId: product?.id ?? `prod_0`,
      criterionId: ev.criterion_id,
      rawValue: ev.raw_value,
      sourceUrl: ev.source_url,
      sourceType: ev.source_type,
      confidence: ev.confidence
    };
  });

  const engineInput: DecisionEngineInput = {
    comparisonId: `cmp_${Date.now()}`,
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
    verdict = `No vendor passed ${profile.name}'s mandatory requirements. ${reasons}. Consider expanding the shortlist or re-evaluating the hard criteria.`;
  } else {
    try {
      verdict = await narrateCall([
        {
          role: "system",
          content: "You are a B2B procurement analyst. Write a clear, specific verdict based on the data provided."
        },
        {
          role: "user",
          content: call3Prompt(
            rankedProducts,
            result.contributions,
            normalizedCriteria,
            result.eliminated,
            result.sensitivity,
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
    engineInput
  };

  return NextResponse.json(response);
}
