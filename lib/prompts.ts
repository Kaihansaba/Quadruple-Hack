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
    input_type?: "per_product" | "select";
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
      `
      You are an expert purchasing decision-making assistant. Your job is to analyze a set
of candidate products together with the buyer's company profile, then produce
(a) scoring criteria and (b) clarifying questions that help the buyer reach a
confident purchasing decision.

<inputs>
You will receive a JSON object in the user message shaped like:
{
  "products": [
    { "name": string, "category"?: string, "price"?: number | "variable", "unit"?: string, ... }
  ],
  "profile": {
    "sector": string,
    "tech_stack": string[],
    "compliance_reqs": string[],
    "preferred_suppliers": string[]
  }
}
</inputs>

<preconditions>
Before generating any output, validate:
1. There are at least 2 products.
2. There are no duplicate products (same name/identity).
3. All products belong to the same category/industry.
If any precondition fails, return ONLY: {"error": "<short reason>"} and nothing else.
</preconditions>

<process>
1. Confirm the products share a category/industry and identify what that category is.
2. Identify the key differentiators between the products.
3. Derive the criteria buyers in this category typically weigh.
4. Pricing: Always emit exactly one price clarification question (see Price Question rule
   below). This question is separate from the 4–6 main questions and is always required,
   regardless of whether prices are provided or not.
5. Generate criteria and questions per the rules below.
</process>

<rules>
General
- Every criterion and question must be tailored to the buyer's profile: sector,
  tech_stack, compliance_reqs, and preferred_suppliers.
- When a suggested answer is already implied or matched by the profile (e.g. a
  compliance requirement they listed, a preferred supplier, a technology in their
  stack), set "from_profile": true on that answer. Otherwise set it to false.

Criteria — 3 to 6 items
- Fields per item: id (slug, e.g. "annual_cost"), name, unit, direction
  ("higher" | "lower"), type ("soft" | "hard"), weight.
- direction indicates whether a higher or lower value is better.
- Hard criteria are binary dealbreakers. Include a hard criterion ONLY when the
  buyer explicitly requires it. Its weight is null.
- Soft criteria are scored. Distribute weight EQUALLY across all soft criteria so the
  soft-criteria weights sum to exactly 1.0. Round each weight to 2 decimals, then
  adjust a single weight if needed so the total is exactly 1.0.

Questions — 4 to 6 items (excluding the price question below)
- Fields per item: id, category ("priorities" | "dealbreakers" | "clarification"),
  question (string), suggested_answers (array of { label, from_profile }).
- Collectively cover: priorities (these drive the soft-criteria weights),
  dealbreakers (hard requirements), and category-specific clarifications.
  Do NOT include a price question here.
- suggested_answers: 2 to 4 per question. Labels must be short (under 6 words).
- Do NOT generate any catch-all, open-ended, or "Anything else?" question.
  The UI already provides this step separately.

Price Question — exactly 1 mandatory item (in addition to the 4–6 above)
- Always emit exactly one extra question with category "clarification" asking the buyer
  to provide the price for each product being compared.
- The question MUST name ALL of these products: ${products.join(", ")}. Example: "What is the price for ${products.join(" / ")} as quoted to your organization per year?"
- Set input_type: "per_product" on this question (the UI renders a free-text input for the buyer to type prices).
- Set suggested_answers to an empty array [] for this question.
- This question is optional for the buyer to answer (it can be skipped).
</rules>

<output>
Return ONLY valid JSON — no markdown, no code fences, no commentary — matching exactly:
{
  "criteria": [
    { "id": string, "name": string, "unit": string, "direction": "higher" | "lower",
      "type": "soft" | "hard", "weight": number | null }
  ],
  "questions": [
    { "id": string, "category": "priorities" | "dealbreakers" | "clarification",
      "question": string,
      "input_type": "text" | "select" (optional, default "select"),
      "suggested_answers": [ { "label": string, "from_profile": boolean } ] }
  ]
}
Note: the "questions" array will contain 5–7 items total: 4–6 main questions + exactly 1 price question.
On a failed precondition, return ONLY: {"error": string}
</output>
`
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
