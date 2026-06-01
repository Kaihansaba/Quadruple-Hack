import { describe, expect, it } from "vitest";
import { demoComparison } from "@/lib/fixtures/demo-comparison";
import { redistributeWeight, runDecisionEngine } from "./decision-engine";

describe("decision engine", () => {
  const hardGateFixture = (rawValue?: string | boolean) => ({
    comparisonId: "hard-gate-fixture",
    title: "Vendor A vs Vendor B",
    products: [
      { id: "vendor_a", name: "Vendor A", url: "" },
      { id: "vendor_b", name: "Vendor B", url: "" }
    ],
    criteria: [
      {
        id: "european_hq",
        name: "European headquarters",
        unit: "boolean",
        direction: "higher" as const,
        type: "hard" as const,
        weight: null
      },
      {
        id: "fit",
        name: "Fit",
        unit: "score_0_10",
        direction: "higher" as const,
        type: "soft" as const,
        weight: 1
      }
    ],
    extractedValues: [
      ...(rawValue === undefined
        ? []
        : [
            {
              id: "ev_hard",
              productId: "vendor_a",
              criterionId: "european_hq",
              rawValue,
              sourceUrl: "https://example.com/vendor-a",
              sourceType: "spec" as const,
              confidence: 0.95
            }
          ]),
      {
        id: "ev_soft_a",
        productId: "vendor_a",
        criterionId: "fit",
        rawValue: 8,
        sourceUrl: "https://example.com/vendor-a",
        sourceType: "spec" as const,
        confidence: 0.95
      },
      {
        id: "ev_soft_b",
        productId: "vendor_b",
        criterionId: "fit",
        rawValue: 7,
        sourceUrl: "https://example.com/vendor-b",
        sourceType: "spec" as const,
        confidence: 0.95
      }
    ]
  });

  it("passes hard criteria when the model returns a string true value", () => {
    const result = runDecisionEngine(hardGateFixture("true"));

    expect(result.eliminated).toEqual([]);
    expect(result.rankings.find((ranking) => ranking.productId === "vendor_a")).toEqual(
      expect.objectContaining({ eliminated: false })
    );
  });

  it("passes hard criteria when the model returns a boolean true value", () => {
    const result = runDecisionEngine(hardGateFixture(true));

    expect(result.eliminated).toEqual([]);
    expect(result.rankings.find((ranking) => ranking.productId === "vendor_a")).toEqual(
      expect.objectContaining({ eliminated: false })
    );
  });

  it("eliminates only on explicit hard-criterion false evidence", () => {
    const result = runDecisionEngine(hardGateFixture("false"));

    expect(result.eliminated).toContainEqual(
      expect.objectContaining({
        productId: "vendor_a",
        criterionId: "european_hq"
      })
    );
  });

  it("does not eliminate when hard-criterion evidence is missing", () => {
    const result = runDecisionEngine(hardGateFixture());

    expect(result.eliminated).toEqual([]);
    expect(result.cells.find((cell) => cell.productId === "vendor_a" && cell.criterionId === "european_hq")).toEqual(
      expect.objectContaining({
        missing: true,
        normalizedValue: null
      })
    );
  });

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
      // Equal weighting balances Nimbus's price/admin edge against LedgerFlow's
      // integration/support edge, landing the active pair within five points.
      criteria: demoComparison.criteria.map((criterion) =>
        criterion.type === "soft" ? { ...criterion, weight: 0.25 } : criterion
      )
    });

    expect(result.nearTie).toBe(true);
  });

  it("never forces a numeric criterion to a zero score (ratio-to-best)", () => {
    const result = runDecisionEngine(demoComparison);
    const priceCells = result.cells.filter((cell) => cell.criterionId === "crit_price");

    expect(priceCells).not.toHaveLength(0);
    for (const cell of priceCells) {
      expect(cell.normalizedValue).toBeGreaterThan(0);
    }
  });
});
