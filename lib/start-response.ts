import type { Call1Output } from "./prompts";
import type { CompanyProfile } from "./prompts";
import type { Comparability, DocumentPage, StartProduct, StartResult } from "./api-types";

export type StartDocument = {
  productName?: string;
  filename?: string;
  text: string;
  perPage?: DocumentPage[];
};

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function documentName(document: StartDocument, index: number) {
  return document.filename?.trim() || document.productName?.trim() || `uploaded-document-${index + 1}`;
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
    const document = documents.find((doc) => doc.productName && normalizeName(doc.productName) === normalizeName(name));

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

function attachDocumentsForDetectedProducts(
  products: string[],
  documents: StartDocument[],
  detectedProducts: Call1Output["detected_products"] | undefined
): StartProduct[] {
  return products.map((name) => {
    const detected = detectedProducts?.find((product) => normalizeName(product.name) === normalizeName(name));
    const document = documents.find((doc, index) => {
      if (doc.productName && normalizeName(doc.productName) === normalizeName(name)) return true;
      if (detected?.source_doc && normalizeName(documentName(doc, index)) === normalizeName(detected.source_doc)) return true;
      return false;
    });

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
  documents = [],
  profile
}: {
  comparisonId: string;
  products: string[];
  parsed: Call1Output;
  documents?: StartDocument[];
  profile?: CompanyProfile;
}): StartResult {
  const comparability = normalizeComparability(parsed.comparability, products);

  if (comparability.verdict === "incomparable") {
    return {
      status: "incomparable",
      comparability,
      ...(profile ? { profile } : {}),
      ...(parsed.detected_products ? { detected_products: parsed.detected_products } : {})
    };
  }

  return {
    comparisonId,
    products: parsed.detected_products
      ? attachDocumentsForDetectedProducts(products, documents, parsed.detected_products)
      : attachDocuments(products, documents),
    ...(parsed.detected_products ? { detected_products: parsed.detected_products } : {}),
    criteria: parsed.criteria,
    questions: parsed.questions,
    comparability,
    ...(profile ? { profile } : {})
  };
}

export function formatIncomparableMessage(reason: string) {
  return `These don't look comparable: ${reason} Try comparing items in the same category.`;
}
