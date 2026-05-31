export type CriterionDirection = "higher" | "lower";
export type CriterionType = "soft" | "hard";
export type SourceType = "spec" | "expert_review" | "user_review" | "vendor_claim" | "uploaded_document";

export type Product = {
  id: string;
  name: string;
  url: string;
  logoUrl?: string;
  rawMetadata?: Record<string, unknown>;
};

export type Criterion = {
  id: string;
  name: string;
  unit: string;
  direction: CriterionDirection;
  type: CriterionType;
  weight: number | null;
};

export type ExtractedValue = {
  id: string;
  productId: string;
  criterionId: string;
  rawValue: string | number | boolean;
  normalizedValue?: number;
  sourceUrl: string;
  sourceType: SourceType;
  confidence: number;
};

export type DecisionEngineInput = {
  comparisonId: string;
  title: string;
  products: Product[];
  criteria: Criterion[];
  extractedValues: ExtractedValue[];
};

export type ReconciledCell = {
  productId: string;
  criterionId: string;
  rawValue: string | number | boolean | null;
  numericValue: number | null;
  normalizedValue: number | null;
  confidence: number;
  sourceUrl: string | null;
  sourceType: SourceType | null;
  sourcesDisagree: boolean;
  imputed: boolean;
  missing: boolean;
};

export type Ranking = {
  productId: string;
  productName: string;
  score: number;
  eliminated: boolean;
};

export type Elimination = {
  productId: string;
  productName: string;
  criterionId: string;
  criterionName: string;
  reason: string;
};

export type SensitivityResult = {
  criterionId: string;
  criterionName: string;
  currentWeight: number;
  tippingWeight: number;
  overtakingProductId: string;
  overtakingProductName: string;
} | null;

export type DecisionEngineResult = {
  cells: ReconciledCell[];
  rankings: Ranking[];
  compositeScores: Record<string, number>;
  contributions: Record<string, Record<string, number>>;
  eliminated: Elimination[];
  sensitivity: SensitivityResult;
  nearTie: boolean;
};
