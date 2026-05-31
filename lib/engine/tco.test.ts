import { describe, expect, it } from "vitest";
import { computeTco, type PricingModel, type TcoProduct } from "./tco";

const hubspot: PricingModel = {
  type: "tiered",
  currency: "USD",
  base_price: 0,
  per_unit_price: null,
  unit: "seat",
  period: "month",
  tiers: [
    { up_to_units: null, unit_price: 0, flat_price: 0, tier_name: "Free" },
    { up_to_units: null, unit_price: 15, flat_price: 0, tier_name: "Starter" },
    { up_to_units: null, unit_price: 90, flat_price: 0, tier_name: "Professional" },
    { up_to_units: null, unit_price: 150, flat_price: 0, tier_name: "Enterprise" }
  ],
  minimum: null,
  notes:
    "Free CRM core available with unlimited users. Paid tiers (Sales Hub) start at $15/seat/month for Starter, $90/seat/month for Professional, $150/seat/month for Enterprise. Pricing shown is for annual billing.",
  source_url: "https://www.hubspot.com/pricing/crm",
  confidence: 0.9
};

const pipedrive: PricingModel = {
  type: "per_seat",
  currency: "USD",
  base_price: 0,
  per_unit_price: 14,
  unit: "seat",
  period: "month",
  tiers: [
    { up_to_units: null, unit_price: 14, flat_price: 0, tier_name: "Essential" },
    { up_to_units: null, unit_price: 34, flat_price: 0, tier_name: "Advanced" },
    { up_to_units: null, unit_price: 49, flat_price: 0, tier_name: "Professional" },
    { up_to_units: null, unit_price: 64, flat_price: 0, tier_name: "Power" },
    { up_to_units: null, unit_price: 99, flat_price: 0, tier_name: "Enterprise" }
  ],
  minimum: null,
  notes:
    "Per-seat pricing starting at $14/seat/month (Essential) when billed annually. Advanced $34, Professional $49, Power $64, Enterprise $99 per seat/month.",
  source_url: "https://www.pipedrive.com/en/pricing",
  confidence: 0.95
};

const zoho: PricingModel = {
  type: "per_seat",
  currency: "USD",
  base_price: 0,
  per_unit_price: 14,
  unit: "user",
  period: "month",
  tiers: [
    { up_to_units: null, unit_price: 0, flat_price: 0, tier_name: "Free (3 users)" },
    { up_to_units: null, unit_price: 14, flat_price: 0, tier_name: "Standard" },
    { up_to_units: null, unit_price: 23, flat_price: 0, tier_name: "Professional" },
    { up_to_units: null, unit_price: 40, flat_price: 0, tier_name: "Enterprise" },
    { up_to_units: null, unit_price: 52, flat_price: 0, tier_name: "Ultimate" }
  ],
  minimum: null,
  notes:
    "Free edition for up to 3 users. Paid tiers billed annually: Standard $14/user/month, Professional $23/user/month, Enterprise $40/user/month, Ultimate $52/user/month.",
  source_url: "https://www.zoho.com/crm/zohocrm-pricing.html",
  confidence: 0.95
};

const products: TcoProduct[] = [
  { id: "hubspot", name: "HubSpot CRM", pricing_model: hubspot },
  { id: "pipedrive", name: "Pipedrive", pricing_model: pipedrive },
  { id: "zoho", name: "Zoho CRM", pricing_model: zoho }
];

describe("computeTco", () => {
  it("projects finite multi-year costs with growing seats for real CRM pricing models", () => {
    const result = computeTco(products, { seats: 40, growthRatePct: 20, years: 3 });

    for (const projection of result.products) {
      expect(projection.available).toBe(true);
      expect(projection.perYear.map((year) => year.seats)).toEqual([40, 48, 58]);
      expect(projection.totalCost).toEqual(expect.any(Number));
      expect(Number.isFinite(projection.totalCost)).toBe(true);
    }

    expect(result.products.find((product) => product.productId === "hubspot")?.tierUsed).toBe("Starter");
    expect(result.ranking[0].totalCost).toBeGreaterThan(0);
  });

  it("honors selected tiers and shows HubSpot Professional as the most expensive option", () => {
    const result = computeTco(products, {
      seats: 40,
      growthRatePct: 20,
      years: 3,
      selectedTierByProduct: {
        hubspot: "Professional",
        zoho: "Standard"
      }
    });

    const hubspotProjection = result.products.find((product) => product.productId === "hubspot");
    const mostExpensive = result.ranking.at(-1);

    expect(hubspotProjection?.tierUsed).toBe("Professional");
    expect(mostExpensive?.productId).toBe("hubspot");
    expect(hubspotProjection?.totalCost).toBe(157680);
  });

  it("marks unknown pricing unavailable instead of fabricating cost", () => {
    const result = computeTco(
      [
        {
          id: "unknown",
          name: "Unknown CRM",
          pricing_model: {
            type: "unknown",
            currency: "unknown",
            base_price: null,
            per_unit_price: null,
            unit: null,
            period: null,
            tiers: null,
            minimum: null,
            notes: "Contact sales only.",
            source_url: null,
            confidence: 0.2
          }
        }
      ],
      { seats: 40, growthRatePct: 20, years: 3 }
    );

    expect(result.products[0]).toMatchObject({
      available: false,
      totalCost: null,
      confidence: 0.2,
      notes: "Contact sales only."
    });
  });
});
