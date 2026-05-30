import { describe, expect, it } from "vitest";
import { demoComparison } from "@/lib/fixtures/demo-comparison";
import { redistributeWeight, runDecisionEngine } from "./decision-engine";

describe("decision engine", () => {
  it("eliminates products that fail hard criteria before scoring", () => {
    const result = runDecisionEngine(demoComparison);

    expect(result.eliminated).toEqual([
      expect.objectContaining({
        productId: "prod_pipelane",
        criterionId: "crit_soc2"
      })
    ]);
    expect(result.rankings.at(-1)).toEqual(
      expect.objectContaining({
        productId: "prod_pipelane",
        eliminated: true,
        score: 0
      })
    );
  });

  it("scores deterministically with normalized soft criteria and contributions", () => {
    const first = runDecisionEngine(demoComparison);
    const second = runDecisionEngine(demoComparison);

    expect(first.compositeScores).toEqual(second.compositeScores);
    expect(first.rankings[0]).toEqual(
      expect.objectContaining({
        productId: "prod_nimbus",
        eliminated: false
      })
    );
    expect(first.contributions.prod_nimbus.crit_price).toBeGreaterThan(0);
    expect(first.contributions.prod_nimbus.crit_support).toBeLessThan(
      first.contributions.prod_ledgerflow.crit_support
    );
  });

  it("flips from the anonymous winner when the demo profile hard requirement applies", () => {
    const anonymousResult = runDecisionEngine({
      ...demoComparison,
      criteria: demoComparison.criteria.filter((criterion) => criterion.type !== "hard"),
      extractedValues: demoComparison.extractedValues.filter(
        (value) => value.criterionId !== "crit_soc2"
      )
    });
    const profileResult = runDecisionEngine(demoComparison);

    expect(anonymousResult.rankings[0]).toEqual(
      expect.objectContaining({
        productId: "prod_pipelane",
        eliminated: false
      })
    );
    expect(profileResult.rankings[0]).toEqual(
      expect.objectContaining({
        productId: "prod_nimbus",
        eliminated: false
      })
    );
    expect(profileResult.eliminated).toContainEqual(
      expect.objectContaining({
        productId: "prod_pipelane",
        criterionName: "SOC 2 Type II available"
      })
    );
  });

  it("flags source disagreement when reconciled values materially differ", () => {
    const result = runDecisionEngine({
      ...demoComparison,
      extractedValues: [
        ...demoComparison.extractedValues,
        {
          id: "ev_nimbus_price_conflict",
          productId: "prod_nimbus",
          criterionId: "crit_price",
          rawValue: 90000,
          sourceUrl: "https://example.com/conflicting-price",
          sourceType: "expert_review",
          confidence: 0.9
        }
      ]
    });

    expect(
      result.cells.find(
        (cell) => cell.productId === "prod_nimbus" && cell.criterionId === "crit_price"
      )?.sourcesDisagree
    ).toBe(true);
  });

  it("imputes missing data and marks it low confidence", () => {
    const result = runDecisionEngine({
      ...demoComparison,
      extractedValues: demoComparison.extractedValues.filter(
        (value) => !(value.productId === "prod_nimbus" && value.criterionId === "crit_admin")
      )
    });
    const cell = result.cells.find(
      (item) => item.productId === "prod_nimbus" && item.criterionId === "crit_admin"
    );

    expect(cell).toEqual(
      expect.objectContaining({
        imputed: true,
        missing: true,
        confidence: 0.2
      })
    );
    expect(cell?.normalizedValue).toBeGreaterThan(0);
  });

  it("redistributes remaining soft weights proportionally", () => {
    const weights = redistributeWeight(
      {
        price: 0.5,
        support: 0.3,
        admin: 0.2
      },
      "price",
      0.2
    );

    expect(weights.price).toBeCloseTo(0.2);
    expect(weights.support).toBeCloseTo(0.48);
    expect(weights.admin).toBeCloseTo(0.32);
    expect(Object.values(weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it("reports near ties when top two active products are within five points", () => {
    const result = runDecisionEngine({
      ...demoComparison,
      criteria: demoComparison.criteria.map((criterion) =>
        criterion.id === "crit_price"
          ? { ...criterion, weight: 0.05 }
          : criterion.id === "crit_support"
            ? { ...criterion, weight: 0.45 }
            : criterion
      )
    });

    expect(result.nearTie).toBe(true);
  });
});
