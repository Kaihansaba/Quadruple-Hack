import { redistributeWeight, runDecisionEngine } from "./decision-engine";
import type {
  Criterion,
  DecisionEngineInput,
  ExtractedValue,
  Product,
  Ranking
} from "./types";

type RobustnessOptions = {
  iterations?: number;
  band?: number;
  seed?: number;
  extractedValues?: ExtractedValue[];
  comparisonId?: string;
  title?: string;
  onWeightsSampled?: (weights: Record<string, number>) => void;
};

type RobustnessResult = {
  winFrequency: Record<string, number>;
  worstCaseRank: Record<string, number>;
  baseWinner: string;
  flipThreshold: number | null;
};

export function computeRobustness(
  products: DecisionEngineInput | Product[],
  criteria: Criterion[],
  baseWeights: Record<string, number>,
  options: RobustnessOptions = {}
): RobustnessResult {
  const input = toEngineInput(products, criteria, baseWeights, options);
  const iterations = options.iterations ?? 2000;
  const band = options.band ?? 0.4;
  const random = createPrng(options.seed ?? 1);
  const productIds = input.products.map((product) => product.id);
  const wins = Object.fromEntries(productIds.map((id) => [id, 0]));
  const worstCaseRank = Object.fromEntries(productIds.map((id) => [id, 1]));
  const baseResult = scoreWithWeights(input, baseWeights);
  const baseWinner = firstActive(baseResult.rankings)?.productId ?? productIds[0];

  for (let i = 0; i < iterations; i += 1) {
    const weights = sampleWeights(baseWeights, criteria, band, random);
    options.onWeightsSampled?.(weights);
    const result = scoreWithWeights(input, weights);
    const winner = firstActive(result.rankings);
    if (winner) {
      wins[winner.productId] += 1;
    }
    for (const [index, ranking] of result.rankings.entries()) {
      worstCaseRank[ranking.productId] = Math.max(worstCaseRank[ranking.productId], index + 1);
    }
  }

  return {
    winFrequency: Object.fromEntries(
      productIds.map((id) => [id, iterations === 0 ? 0 : wins[id] / iterations])
    ),
    worstCaseRank,
    baseWinner,
    flipThreshold: findFlipThreshold(input, criteria, baseWeights, baseWinner)
  };
}

function toEngineInput(
  products: DecisionEngineInput | Product[],
  criteria: Criterion[],
  baseWeights: Record<string, number>,
  options: RobustnessOptions
): DecisionEngineInput {
  const sourceInput = Array.isArray(products) ? null : products;
  const productList = Array.isArray(products) ? products : products.products;
  return {
    comparisonId: sourceInput?.comparisonId ?? options.comparisonId ?? "robustness",
    title: sourceInput?.title ?? options.title ?? "Robustness analysis",
    products: productList,
    criteria: applyWeights(criteria, baseWeights),
    extractedValues: sourceInput?.extractedValues ?? options.extractedValues ?? []
  };
}

function scoreWithWeights(input: DecisionEngineInput, weights: Record<string, number>) {
  return runDecisionEngine({
    ...input,
    criteria: applyWeights(input.criteria, weights)
  });
}

function applyWeights(criteria: Criterion[], weights: Record<string, number>): Criterion[] {
  return criteria.map((criterion) => ({
    ...criterion,
    weight: criterion.type === "soft" ? weights[criterion.id] ?? criterion.weight ?? 0 : null
  }));
}

function sampleWeights(
  baseWeights: Record<string, number>,
  criteria: Criterion[],
  band: number,
  random: () => number
): Record<string, number> {
  const softIds = criteria.filter((criterion) => criterion.type === "soft").map((criterion) => criterion.id);
  const perturbed = Object.fromEntries(
    softIds.map((id) => {
      const factor = 1 - band + random() * band * 2;
      return [id, Math.max(0, (baseWeights[id] ?? 0) * factor)];
    })
  );
  const total = Object.values(perturbed).reduce((sum, weight) => sum + weight, 0);
  return Object.fromEntries(
    softIds.map((id) => [id, total === 0 ? 1 / softIds.length : perturbed[id] / total])
  );
}

function findFlipThreshold(
  input: DecisionEngineInput,
  criteria: Criterion[],
  baseWeights: Record<string, number>,
  baseWinner: string
): number | null {
  const baseContributions = scoreWithWeights(input, baseWeights).contributions[baseWinner] ?? {};
  const strongestCriteria = criteria
    .filter((criterion) => criterion.type === "soft")
    .sort((a, b) => (baseContributions[b.id] ?? 0) - (baseContributions[a.id] ?? 0));

  let best: number | null = null;
  for (const criterion of strongestCriteria) {
    const originalWeight = baseWeights[criterion.id] ?? criterion.weight ?? 0;
    if (originalWeight <= 0) {
      continue;
    }

    for (let fraction = 0.01; fraction <= 1; fraction += 0.01) {
      const nextWeight = originalWeight * (1 - fraction);
      const weights = redistributeWeight(baseWeights, criterion.id, nextWeight);
      const winner = firstActive(scoreWithWeights(input, weights).rankings)?.productId;
      if (winner && winner !== baseWinner) {
        best = best === null ? fraction : Math.min(best, fraction);
        break;
      }
    }
  }

  return best === null ? null : Math.round(best * 100) / 100;
}

function firstActive(rankings: Ranking[]): Ranking | undefined {
  return rankings.find((ranking) => !ranking.eliminated);
}

function createPrng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
