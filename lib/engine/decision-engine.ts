import type {
  Criterion,
  DecisionEngineInput,
  DecisionEngineResult,
  Elimination,
  ExtractedValue,
  ReconciledCell,
  SensitivityResult,
  SourceType
} from "./types";

const SOURCE_WEIGHTS: Record<SourceType, number> = {
  spec: 1,
  expert_review: 0.9,
  user_review: 0.65,
  vendor_claim: 0.45
};

const DISAGREEMENT_THRESHOLD = 0.2;
const MISSING_CONFIDENCE = 0.2;

export function redistributeWeight(
  weights: Record<string, number>,
  changedCriterionId: string,
  nextWeight: number
): Record<string, number> {
  const clampedNext = clamp01(nextWeight);
  const otherIds = Object.keys(weights).filter((id) => id !== changedCriterionId);
  const otherTotal = otherIds.reduce((sum, id) => sum + weights[id], 0);
  const remaining = 1 - clampedNext;

  if (otherIds.length === 0) {
    return { [changedCriterionId]: 1 };
  }

  const redistributed: Record<string, number> = {
    [changedCriterionId]: clampedNext
  };

  for (const id of otherIds) {
    redistributed[id] =
      otherTotal === 0 ? remaining / otherIds.length : (weights[id] / otherTotal) * remaining;
  }

  return redistributed;
}

export function runDecisionEngine(input: DecisionEngineInput): DecisionEngineResult {
  const softCriteria = input.criteria.filter((criterion) => criterion.type === "soft");
  const hardCriteria = input.criteria.filter((criterion) => criterion.type === "hard");
  const cells = normalizeCells(reconcile(input), input.products.map((product) => product.id), softCriteria);
  const eliminated = applyDealbreakers(cells, hardCriteria, input);
  const eliminatedIds = new Set(eliminated.map((item) => item.productId));
  const contributions = scoreContributions(cells, softCriteria, eliminatedIds);
  const compositeScores = Object.fromEntries(
    input.products.map((product) => [
      product.id,
      eliminatedIds.has(product.id)
        ? 0
        : Object.values(contributions[product.id] ?? {}).reduce((sum, value) => sum + value, 0)
    ])
  );
  const rankings = input.products
    .map((product) => ({
      productId: product.id,
      productName: product.name,
      score: round(compositeScores[product.id] ?? 0),
      eliminated: eliminatedIds.has(product.id)
    }))
    .sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || b.score - a.score);
  const activeRankings = rankings.filter((ranking) => !ranking.eliminated);
  const nearTie =
    activeRankings.length > 1 && Math.abs(activeRankings[0].score - activeRankings[1].score) < 0.05;

  return {
    cells,
    rankings,
    compositeScores,
    contributions,
    eliminated,
    sensitivity: calculateSensitivity(input, cells, eliminatedIds),
    nearTie
  };
}

function reconcile(input: DecisionEngineInput): ReconciledCell[] {
  return input.products.flatMap((product) =>
    input.criteria.map((criterion) => {
      const values = input.extractedValues.filter(
        (value) => value.productId === product.id && value.criterionId === criterion.id
      );
      if (values.length === 0) {
        return emptyCell(product.id, criterion.id);
      }

      const numericValues = values
        .map((value) => ({ value, numeric: toNumber(value, criterion) }))
        .filter((item): item is { value: ExtractedValue; numeric: number } => item.numeric !== null);
      if (numericValues.length === 0) {
        return {
          ...emptyCell(product.id, criterion.id),
          rawValue: values[0].rawValue,
          sourceUrl: values[0].sourceUrl,
          sourceType: values[0].sourceType,
          confidence: values[0].confidence,
          missing: false
        };
      }

      const weighted = numericValues.map(({ value, numeric }) => {
        const credibility = SOURCE_WEIGHTS[value.sourceType] * value.confidence;
        return { value, numeric, credibility };
      });
      const totalWeight = weighted.reduce((sum, item) => sum + item.credibility, 0);
      const numericValue =
        totalWeight === 0
          ? average(weighted.map((item) => item.numeric))
          : weighted.reduce((sum, item) => sum + item.numeric * item.credibility, 0) / totalWeight;
      const strongest = weighted.reduce((best, item) =>
        item.credibility > best.credibility ? item : best
      );
      const spread = Math.max(...weighted.map((item) => item.numeric)) - Math.min(...weighted.map((item) => item.numeric));
      const baseline = Math.max(Math.abs(numericValue), 1);

      return {
        productId: product.id,
        criterionId: criterion.id,
        rawValue: strongest.value.rawValue,
        numericValue,
        normalizedValue: null,
        confidence: clamp01(totalWeight / values.length),
        sourceUrl: strongest.value.sourceUrl,
        sourceType: strongest.value.sourceType,
        sourcesDisagree: spread / baseline > DISAGREEMENT_THRESHOLD,
        imputed: false,
        missing: false
      };
    })
  );
}

function normalizeCells(
  cells: ReconciledCell[],
  productIds: string[],
  softCriteria: Criterion[]
): ReconciledCell[] {
  const normalized = [...cells];

  for (const criterion of softCriteria) {
    const criterionCells = normalized.filter((cell) => cell.criterionId === criterion.id);
    const known = criterionCells.filter((cell) => cell.numericValue !== null);
    const rawScores = new Map<string, number>();

    if (criterion.unit === "score_0_10") {
      for (const cell of known) {
        rawScores.set(cell.productId, clamp01((cell.numericValue ?? 0) / 10));
      }
    } else {
      const values = known.map((cell) => cell.numericValue as number);
      const min = Math.min(...values);
      const max = Math.max(...values);
      for (const cell of known) {
        const value = cell.numericValue as number;
        const normalizedValue = max === min ? 1 : (value - min) / (max - min);
        rawScores.set(
          cell.productId,
          criterion.direction === "lower" ? 1 - normalizedValue : normalizedValue
        );
      }
    }

    const imputedValue = rawScores.size > 0 ? average([...rawScores.values()]) : 0.5;
    for (const productId of productIds) {
      const index = normalized.findIndex(
        (cell) => cell.productId === productId && cell.criterionId === criterion.id
      );
      const score = rawScores.get(productId);
      normalized[index] = {
        ...normalized[index],
        normalizedValue: score ?? imputedValue,
        confidence: score === undefined ? MISSING_CONFIDENCE : normalized[index].confidence,
        imputed: score === undefined,
        missing: score === undefined ? true : normalized[index].missing
      };
    }
  }

  for (const cell of normalized) {
    if (cell.normalizedValue === null && cell.numericValue !== null) {
      cell.normalizedValue = clamp01(cell.numericValue);
    }
  }

  return normalized;
}

function applyDealbreakers(
  cells: ReconciledCell[],
  hardCriteria: Criterion[],
  input: DecisionEngineInput
): Elimination[] {
  return input.products.flatMap((product) =>
    hardCriteria.flatMap((criterion) => {
      const cell = cells.find(
        (item) => item.productId === product.id && item.criterionId === criterion.id
      );
      const passes = (cell?.normalizedValue ?? 0) >= 1;
      return passes
        ? []
        : [
            {
              productId: product.id,
              productName: product.name,
              criterionId: criterion.id,
              criterionName: criterion.name,
              reason: `${product.name} does not satisfy ${criterion.name}.`
            }
          ];
    })
  );
}

function scoreContributions(
  cells: ReconciledCell[],
  softCriteria: Criterion[],
  eliminatedIds: Set<string>
): Record<string, Record<string, number>> {
  const contributions: Record<string, Record<string, number>> = {};
  const weights = normalizeWeights(Object.fromEntries(softCriteria.map((item) => [item.id, item.weight ?? 0])));

  for (const cell of cells) {
    if (eliminatedIds.has(cell.productId) || !weights[cell.criterionId]) {
      continue;
    }
    contributions[cell.productId] ??= {};
    contributions[cell.productId][cell.criterionId] = round(
      weights[cell.criterionId] * (cell.normalizedValue ?? 0)
    );
  }

  return contributions;
}

function calculateSensitivity(
  input: DecisionEngineInput,
  cells: ReconciledCell[],
  eliminatedIds: Set<string>
): SensitivityResult {
  const softCriteria = input.criteria.filter((criterion) => criterion.type === "soft");
  const currentWeights = normalizeWeights(
    Object.fromEntries(softCriteria.map((criterion) => [criterion.id, criterion.weight ?? 0]))
  );
  const current = rankWithWeights(input, cells, eliminatedIds, currentWeights);
  const winner = current[0];
  if (!winner || current.length < 2) {
    return null;
  }

  for (const criterion of softCriteria) {
    for (let weight = currentWeights[criterion.id] + 0.01; weight <= 1; weight += 0.01) {
      const nextWeights = redistributeWeight(currentWeights, criterion.id, weight);
      const next = rankWithWeights(input, cells, eliminatedIds, nextWeights);
      if (next[0] && next[0].productId !== winner.productId) {
        return {
          criterionId: criterion.id,
          criterionName: criterion.name,
          currentWeight: round(currentWeights[criterion.id]),
          tippingWeight: round(weight),
          overtakingProductId: next[0].productId,
          overtakingProductName: next[0].productName
        };
      }
    }
  }

  return null;
}

function rankWithWeights(
  input: DecisionEngineInput,
  cells: ReconciledCell[],
  eliminatedIds: Set<string>,
  weights: Record<string, number>
) {
  return input.products
    .filter((product) => !eliminatedIds.has(product.id))
    .map((product) => {
      const score = cells
        .filter((cell) => cell.productId === product.id && weights[cell.criterionId])
        .reduce((sum, cell) => sum + weights[cell.criterionId] * (cell.normalizedValue ?? 0), 0);
      return { productId: product.id, productName: product.name, score };
    })
    .sort((a, b) => b.score - a.score);
}

function normalizeWeights(weights: Record<string, number>): Record<string, number> {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (total === 0) {
    const ids = Object.keys(weights);
    return Object.fromEntries(ids.map((id) => [id, 1 / ids.length]));
  }
  return Object.fromEntries(Object.entries(weights).map(([id, weight]) => [id, weight / total]));
}

function toNumber(value: ExtractedValue, criterion: Criterion): number | null {
  if (value.normalizedValue !== undefined && criterion.type === "hard") {
    return value.normalizedValue;
  }
  if (typeof value.rawValue === "number") {
    return value.rawValue;
  }
  if (typeof value.rawValue === "boolean") {
    return value.rawValue ? 1 : 0;
  }
  const parsed = Number.parseFloat(value.rawValue.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyCell(productId: string, criterionId: string): ReconciledCell {
  return {
    productId,
    criterionId,
    rawValue: null,
    numericValue: null,
    normalizedValue: null,
    confidence: MISSING_CONFIDENCE,
    sourceUrl: null,
    sourceType: null,
    sourcesDisagree: false,
    imputed: true,
    missing: true
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
