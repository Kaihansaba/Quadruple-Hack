export type CompanyProfile = {
  name: string;
  industry: string;
  size: string;
  budget_ceiling: number | null;
  tech_stack: string[];
  compliance_reqs: string[];
  preferred_suppliers: string[];
  default_weights: Record<string, number>;
};

export type Call1Output = {
  criteria: Array<{
    id: string;
    name: string;
    unit: string;
    direction: "higher" | "lower";
    type: "soft" | "hard";
    weight: number | null;
  }>;
  questions: Array<{
    id: string;
    category: "priorities" | "dealbreakers" | "clarification";
    question: string;
    suggested_answers: Array<{ label: string; from_profile: boolean }>;
  }>;
};

export type Call2Output = {
  extracted_values: Array<{
    product_name: string;
    criterion_id: string;
    raw_value: string;
    source_url: string;
    source_type: "spec" | "expert_review" | "user_review" | "vendor_claim";
    confidence: number;
  }>;
  proposed_weights: Record<string, number>;
};

export function call1Prompt(products: string[], profile: CompanyProfile): string {
  return JSON.stringify({
    task: "Generate a unified criteria set and clarifying questions for this B2B product comparison.",
    products,
    company_profile: {
      name: profile.name,
      industry: profile.industry,
      size: profile.size,
      budget_ceiling: profile.budget_ceiling,
      tech_stack: profile.tech_stack,
      compliance_reqs: profile.compliance_reqs,
      preferred_suppliers: profile.preferred_suppliers,
      default_weights: profile.default_weights
    },
    instructions: [
      "Return JSON with keys: criteria (array), questions (array).",
      "criteria: 3-6 items. Each has id (slug), name, unit, direction (higher|lower), type (soft|hard), weight (0-1 float for soft, null for hard). Weights for soft criteria must sum to 1.",
      "Default to soft criteria. Only create hard criteria for explicit must-have requirements from company_profile.compliance_reqs.",
      "If company_profile.compliance_reqs is empty, do not create or ask about HIPAA, SOC 2, GDPR, ISO, PCI, certifications, audits, attestations, regulatory compliance, or other compliance gates.",
      "Hard criteria are binary dealbreakers only when the buyer explicitly requires them. Soft criteria are scored.",
      "questions: 4-8 items covering priorities (drives weights), dealbreakers (hard requirements), and category-specific clarifications.",
      "Each question has id, category (priorities|dealbreakers|clarification), question (string), suggested_answers (array of {label, from_profile}).",
      "Mark from_profile:true for answers pre-matched by the company profile.",
      "suggested_answers: 2-4 per question. Keep labels short (under 6 words).",
      "criterion units: usd_per_year, score_0_10, boolean, percent, count, etc.",
      "DO NOT ask about products themselves — questions must be about buyer needs."
    ]
  });
}

export function call2Prompt(
  products: string[],
  criteria: Call1Output["criteria"],
  answers: Array<{ question: string; answer: string }>,
  profile: CompanyProfile
): string {
  return JSON.stringify({
    task: "Search the web for evidence about each product, then extract values for every criterion.",
    products,
    criteria: criteria.map((c) => ({ id: c.id, name: c.name, unit: c.unit, direction: c.direction, type: c.type })),
    buyer_answers: answers,
    company_profile: {
      name: profile.name,
      industry: profile.industry,
      compliance_reqs: profile.compliance_reqs,
      tech_stack: profile.tech_stack,
      budget_ceiling: profile.budget_ceiling,
      default_weights: profile.default_weights
    },
    valid_criterion_ids: criteria.map((c) => c.id),
    instructions: [
      "Search the web for each product and extract its value for every criterion listed.",
      "Return JSON with keys: extracted_values (array), proposed_weights (object).",
      `CRITICAL: criterion_id in extracted_values MUST be copied EXACTLY from valid_criterion_ids. Do NOT invent or rename criterion IDs. Valid IDs are: ${criteria.map((c) => c.id).join(", ")}.`,
      "extracted_values: one entry per (product, criterion) pair. Fields: product_name (exact match to products list), criterion_id (exact match to valid_criterion_ids), raw_value (string), source_url, source_type (spec|expert_review|user_review|vendor_claim), confidence (0-1).",
      "For score_0_10 criteria, assign a score 0-10 based on evidence. For boolean criteria, raw_value must be 'true' or 'false'.",
      "For hard criteria, use raw_value 'false' only when evidence clearly says the product fails the requirement. If evidence is unavailable or ambiguous, omit that entry rather than guessing false.",
      "proposed_weights: maps each soft criterion_id to a float; must sum to 1.0. Hard criteria (type=hard) must NOT appear in proposed_weights.",
      "If a product has no evidence for a criterion, omit that entry (it will be imputed).",
      "Use real URLs from your web search as source_url."
    ]
  });
}

export function call3Prompt(
  products: Array<{ name: string; score: number; eliminated: boolean }>,
  contributions: Record<string, Record<string, number>>,
  criteria: Array<{ id: string; name: string; weight: number | null }>,
  eliminated: Array<{ productName: string; criterionName: string; reason: string }>,
  sensitivity: { criterionName: string; tippingWeight: number; overtakingProductName: string } | null,
  profile: CompanyProfile
): string {
  const winner = products.find((p) => !p.eliminated);
  return JSON.stringify({
    task: "Write a concise, defensible verdict explaining the recommendation.",
    winner: winner?.name ?? "none",
    ranked_products: products,
    contributions,
    criteria: criteria.map((c) => ({ id: c.id, name: c.name, weight: c.weight })),
    eliminated,
    sensitivity,
    company_name: profile.name,
    instructions: [
      "Write 2-3 paragraphs in plain English. No markdown headers.",
      "First paragraph: name the winner and the top 2-3 reasons (tied to criterion contributions).",
      "Second paragraph: why eliminated products were cut, or why runner-up lost.",
      "Third paragraph (if sensitivity exists): what would have to change to flip the result.",
      "Reference the company name naturally. Be specific — cite numbers where available.",
      "Return plain text, not JSON."
    ]
  });
}
