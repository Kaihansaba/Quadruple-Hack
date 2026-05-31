export type PricingModel = {
  type: "tiered" | "per_seat" | "flat" | "usage_based" | "unknown";
  currency: string;
  base_price: number | null;
  per_unit_price: number | null;
  unit: string | null;
  period: "month" | "year" | null;
  tiers: Array<{
    up_to_units: number | null;
    unit_price: number;
    flat_price: number | null;
    tier_name?: string;
  }> | null;
  minimum: number | null;
  notes: string | null;
  source_url: string | null;
  confidence: number;
};

export type TcoProduct = {
  id: string;
  name?: string;
  pricing_model?: PricingModel | null;
};

export type TcoUsage = {
  seats: number;
  growthRatePct: number;
  years: number;
  selectedTierByProduct?: Record<string, string>;
};

export type TcoProjection = {
  productId: string;
  tierUsed: string | null;
  currency: string;
  perYear: Array<{
    year: number;
    seats: number;
    annualCost: number;
    cumulativeCost: number;
  }>;
  totalCost: number | null;
  confidence: number;
  available: boolean;
  notes: string | null;
};

export type TcoInsight = {
  cheapestNow: string | null;
  cheapestOverHorizon: string | null;
  crossovers: Array<{ productA: string; productB: string; year: number }>;
  notes: string[];
};

export type TcoResult = {
  products: TcoProjection[];
  ranking: Array<{ productId: string; totalCost: number }>;
  insight: TcoInsight;
};

type ActivePrice = {
  tierUsed: string | null;
  currency: string;
  perUnitAnnual: number;
  flatAnnual: number;
  minimumAnnual: number | null;
  confidence: number;
  notes: string | null;
};

function normalizeAnnual(value: number, period: PricingModel["period"]) {
  return period === "month" ? value * 12 : value;
}

function isFreeTier(tier: NonNullable<PricingModel["tiers"]>[number]) {
  return (tier.unit_price ?? 0) === 0 && (tier.flat_price ?? 0) === 0;
}

function tierLabel(tier: NonNullable<PricingModel["tiers"]>[number]) {
  return tier.tier_name ?? `${tier.unit_price}/unit`;
}

function selectedTier(model: PricingModel, selectedName: string | undefined) {
  if (!selectedName || !model.tiers) return undefined;
  return model.tiers.find((tier) => tier.tier_name?.toLowerCase() === selectedName.toLowerCase());
}

function defaultPaidTier(model: PricingModel) {
  const paidTiers = (model.tiers ?? [])
    .filter((tier) => !isFreeTier(tier))
    .sort((a, b) => (a.unit_price + (a.flat_price ?? 0)) - (b.unit_price + (b.flat_price ?? 0)));
  return paidTiers[0];
}

function activePrice(product: TcoProduct, usage: TcoUsage): ActivePrice | null {
  const model = product.pricing_model;
  if (!model || model.type === "unknown") return null;

  const currency = model.currency || "unknown";
  const selected = selectedTier(model, usage.selectedTierByProduct?.[product.id]);
  const tier = selected ?? (model.type === "tiered" ? defaultPaidTier(model) : undefined);

  if (tier) {
    return {
      tierUsed: tierLabel(tier),
      currency,
      perUnitAnnual: normalizeAnnual(tier.unit_price, model.period),
      flatAnnual: normalizeAnnual(tier.flat_price ?? 0, model.period),
      minimumAnnual: model.minimum === null ? null : normalizeAnnual(model.minimum, model.period),
      confidence: model.confidence,
      notes: model.notes
    };
  }

  if ((model.type === "per_seat" || model.type === "usage_based") && model.per_unit_price !== null) {
    return {
      tierUsed: null,
      currency,
      perUnitAnnual: normalizeAnnual(model.per_unit_price, model.period),
      flatAnnual: normalizeAnnual(model.base_price ?? 0, model.period),
      minimumAnnual: model.minimum === null ? null : normalizeAnnual(model.minimum, model.period),
      confidence: model.confidence,
      notes: model.notes
    };
  }

  if (model.type === "flat" && model.base_price !== null) {
    return {
      tierUsed: null,
      currency,
      perUnitAnnual: 0,
      flatAnnual: normalizeAnnual(model.base_price, model.period),
      minimumAnnual: model.minimum === null ? null : normalizeAnnual(model.minimum, model.period),
      confidence: model.confidence,
      notes: model.notes
    };
  }

  return null;
}

function seatsForYear(usage: TcoUsage, year: number) {
  return Math.round(usage.seats * (1 + usage.growthRatePct / 100) ** (year - 1));
}

function unavailableProjection(product: TcoProduct): TcoProjection {
  const model = product.pricing_model;
  return {
    productId: product.id,
    tierUsed: null,
    currency: model?.currency ?? "unknown",
    perYear: [],
    totalCost: null,
    confidence: model?.confidence ?? 0,
    available: false,
    notes: model?.notes ?? "Pricing is not determinable from the provided pricing model."
  };
}

function projectProduct(product: TcoProduct, usage: TcoUsage): TcoProjection {
  const price = activePrice(product, usage);
  if (!price) return unavailableProjection(product);

  let cumulativeCost = 0;
  const perYear = Array.from({ length: usage.years }, (_, index) => {
    const year = index + 1;
    const seats = seatsForYear(usage, year);
    const subtotal = seats * price.perUnitAnnual + price.flatAnnual;
    const annualCost = price.minimumAnnual === null ? subtotal : Math.max(subtotal, price.minimumAnnual);
    cumulativeCost += annualCost;
    return { year, seats, annualCost, cumulativeCost };
  });

  return {
    productId: product.id,
    tierUsed: price.tierUsed,
    currency: price.currency,
    perYear,
    totalCost: cumulativeCost,
    confidence: price.confidence,
    available: true,
    notes: price.notes
  };
}

function cheapestByYear(products: TcoProjection[], year: number) {
  return products
    .filter((product) => product.available)
    .map((product) => ({
      productId: product.productId,
      cumulativeCost: product.perYear[year - 1]?.cumulativeCost
    }))
    .filter((item): item is { productId: string; cumulativeCost: number } => Number.isFinite(item.cumulativeCost))
    .sort((a, b) => a.cumulativeCost - b.cumulativeCost)[0]?.productId ?? null;
}

function detectCrossovers(products: TcoProjection[], years: number) {
  const available = products.filter((product) => product.available);
  const crossovers: Array<{ productA: string; productB: string; year: number }> = [];

  for (let i = 0; i < available.length; i += 1) {
    for (let j = i + 1; j < available.length; j += 1) {
      const a = available[i];
      const b = available[j];
      let previous: number | null = null;

      for (let year = 1; year <= years; year += 1) {
        const aCost = a.perYear[year - 1]?.cumulativeCost;
        const bCost = b.perYear[year - 1]?.cumulativeCost;
        if (!Number.isFinite(aCost) || !Number.isFinite(bCost)) continue;

        const ordering = Math.sign(aCost - bCost);
        if (ordering === 0) continue;
        if (previous !== null && ordering !== previous) {
          crossovers.push({ productA: a.productId, productB: b.productId, year });
          break;
        }
        previous = ordering;
      }
    }
  }

  return crossovers;
}

export function computeTco(products: TcoProduct[], usage: TcoUsage): TcoResult {
  const projections = products.map((product) => projectProduct(product, usage));
  const ranking = projections
    .filter((product): product is TcoProjection & { totalCost: number } => product.available && product.totalCost !== null)
    .map((product) => ({ productId: product.productId, totalCost: product.totalCost }))
    .sort((a, b) => a.totalCost - b.totalCost);

  const currencies = [...new Set(projections.filter((product) => product.available).map((product) => product.currency))];
  const notes = currencies.length > 1 ? [`Currency mismatch: ${currencies.join(", ")}. Costs were not converted.`] : [];
  const crossovers = detectCrossovers(projections, usage.years);

  return {
    products: projections,
    ranking,
    insight: {
      cheapestNow: cheapestByYear(projections, 1),
      cheapestOverHorizon: ranking[0]?.productId ?? null,
      crossovers,
      notes: crossovers.length === 0 ? [...notes, "No cumulative-cost crossover detected."] : notes
    }
  };
}
