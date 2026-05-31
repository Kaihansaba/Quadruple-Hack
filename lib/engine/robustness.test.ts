import { describe, expect, it } from "vitest";
import { demoComparison } from "@/lib/fixtures/demo-comparison";
import { computeRobustness } from "./robustness";
import type { DecisionEngineInput } from "./types";

const baseWeights = Object.fromEntries(
  demoComparison.criteria
    .filter((criterion) => criterion.type === "soft")
    .map((criterion) => [criterion.id, criterion.weight ?? 0])
);

describe("computeRobustness", () => {
  it("returns win frequency near 1.0 for a clear winner", () => {
    const result = computeRobustness(demoComparison, demoComparison.criteria, baseWeights, {
      iterations: 500,
      band: 0.1,
      seed: 42
    });

    expect(result.baseWinner).toBe("prod_nimbus");
    expect(result.winFrequency.prod_nimbus).toBeGreaterThan(0.95);
  });

  it("returns split frequencies for a near-tie fixture", () => {
    const nearTie: DecisionEngineInput = {
      ...demoComparison,
      products: demoComparison.products.slice(0, 2),
      criteria: [
        {
          id: "crit_price",
          name: "Annual cost",
          unit: "usd_per_year",
          direction: "lower",
          type: "soft",
          weight: 0.5
        },
        {
          id: "crit_support",
          name: "Implementation support",
          unit: "score_0_10",
          direction: "higher",
          type: "soft",
          weight: 0.5
        }
      ],
      extractedValues: [
        {
          id: "tie_nimbus_price",
          productId: "prod_nimbus",
          criterionId: "crit_price",
          rawValue: 100,
          sourceUrl: "https://example.com/nimbus/price",
          sourceType: "spec",
          confidence: 1
        },
        {
          id: "tie_nimbus_support",
          productId: "prod_nimbus",
          criterionId: "crit_support",
          rawValue: 7,
          sourceUrl: "https://example.com/nimbus/support",
          sourceType: "expert_review",
          confidence: 1
        },
        {
          id: "tie_ledger_price",
          productId: "prod_ledgerflow",
          criterionId: "crit_price",
          rawValue: 125,
          sourceUrl: "https://example.com/ledgerflow/price",
          sourceType: "spec",
          confidence: 1
        },
        {
          id: "tie_ledger_support",
          productId: "prod_ledgerflow",
          criterionId: "crit_support",
          rawValue: 9,
          sourceUrl: "https://example.com/ledgerflow/support",
          sourceType: "expert_review",
          confidence: 1
        }
      ]
    };
    const nearTieWeights = { crit_price: 0.5, crit_support: 0.5 };

    const result = computeRobustness(nearTie, nearTie.criteria, nearTieWeights, {
      iterations: 1000,
      seed: 7,
      band: 0.6
    });

    expect(result.winFrequency.prod_nimbus).toBeGreaterThan(0.2);
    expect(result.winFrequency.prod_ledgerflow).toBeGreaterThan(0.2);
  });

  it("is reproducible with a fixed seed", () => {
    const first = computeRobustness(demoComparison, demoComparison.criteria, baseWeights, {
      iterations: 300,
      seed: 123
    });
    const second = computeRobustness(demoComparison, demoComparison.criteria, baseWeights, {
      iterations: 300,
      seed: 123
    });

    expect(second).toEqual(first);
  });

  it("samples perturbed weights that sum to 1", () => {
    const sampledTotals: number[] = [];

    computeRobustness(demoComparison, demoComparison.criteria, baseWeights, {
      iterations: 100,
      seed: 5,
      onWeightsSampled: (weights) => {
        sampledTotals.push(Object.values(weights).reduce((sum, weight) => sum + weight, 0));
      }
    });

    expect(sampledTotals).toHaveLength(100);
    for (const total of sampledTotals) {
      expect(total).toBeCloseTo(1, 10);
    }
  });
});
