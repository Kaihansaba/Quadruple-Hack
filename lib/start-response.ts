import type { Call1Output } from "./prompts";
import type { Comparability, DocumentPage, StartProduct, StartResult } from "./api-types";

export type StartDocument = {
  productName: string;
  text: string;
  perPage?: DocumentPage[];
};

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function normalizeComparability(
  comparability: Call1Output["comparability"] | undefined,
  products: string[]
): Comparability {
  if (!comparability) {
    return {
      verdict: "comparable",
      category: null,
      reason: `${products.join(" and ")} appear to share a comparison frame.`
    };
  }

  const verdict = comparability.verdict;
  if (verdict === "comparable" || verdict === "comparable_with_note" || verdict === "incomparable") {
    return {
      verdict,
      category: comparability.category ?? null,
      reason: comparability.reason || "Comparison frame assessed.",
      incomparable_products: comparability.incomparable_products
    };
  }

  return {
    verdict: "comparable",
    category: null,
    reason: `${products.join(" and ")} appear to share a comparison frame.`
  };
}

function attachDocuments(products: string[], documents: StartDocument[]): StartProduct[] {
  return products.map((name) => {
    const document = documents.find((doc) => normalizeName(doc.productName) === normalizeName(name));

    if (!document?.text?.trim()) {
      return { name, url: null };
    }

    return {
      name,
      url: null,
      documentText: document.text,
      perPage: document.perPage ?? []
    };
  });
}

export function buildStartResponse({
  comparisonId,
  products,
  parsed,
  documents = []
}: {
  comparisonId: string;
  products: string[];
  parsed: Call1Output;
  documents?: StartDocument[];
}): StartResult {
  const comparability = normalizeComparability(parsed.comparability, products);

  if (comparability.verdict === "incomparable") {
    return {
      status: "incomparable",
      comparability
    };
  }

  return {
    comparisonId,
    products: attachDocuments(products, documents),
    criteria: parsed.criteria,
    questions: parsed.questions,
    comparability
  };
}

export function formatIncomparableMessage(reason: string) {
  return `These don't look comparable: ${reason} Try comparing items in the same category.`;
}
