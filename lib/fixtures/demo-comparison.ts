import type { DecisionEngineInput } from "@/lib/engine/types";

export const demoComparison: DecisionEngineInput = {
  comparisonId: "cmp_demo_crm",
  title: "CRM platform for regulated mid-market sales team",
  products: [
    {
      id: "prod_nimbus",
      name: "Nimbus CRM",
      url: "https://example.com/nimbus",
      logoUrl: "https://example.com/nimbus.ico"
    },
    {
      id: "prod_ledgerflow",
      name: "LedgerFlow Sales Cloud",
      url: "https://example.com/ledgerflow",
      logoUrl: "https://example.com/ledgerflow.ico"
    },
    {
      id: "prod_pipelane",
      name: "Pipelane",
      url: "https://example.com/pipelane",
      logoUrl: "https://example.com/pipelane.ico"
    }
  ],
  criteria: [
    {
      id: "crit_price",
      name: "Annual cost",
      unit: "usd_per_year",
      direction: "lower",
      type: "soft",
      weight: 0.3
    },
    {
      id: "crit_integration",
      name: "Fit with existing stack",
      unit: "score_0_10",
      direction: "higher",
      type: "soft",
      weight: 0.25
    },
    {
      id: "crit_admin",
      name: "Admin usability",
      unit: "score_0_10",
      direction: "higher",
      type: "soft",
      weight: 0.2
    },
    {
      id: "crit_support",
      name: "Implementation support",
      unit: "score_0_10",
      direction: "higher",
      type: "soft",
      weight: 0.25
    },
    {
      id: "crit_soc2",
      name: "SOC 2 Type II available",
      unit: "boolean",
      direction: "higher",
      type: "hard",
      weight: null
    }
  ],
  extractedValues: [
    {
      id: "ev_nimbus_price_spec",
      productId: "prod_nimbus",
      criterionId: "crit_price",
      rawValue: 48000,
      sourceUrl: "https://example.com/nimbus/pricing",
      sourceType: "spec",
      confidence: 0.92
    },
    {
      id: "ev_nimbus_price_review",
      productId: "prod_nimbus",
      criterionId: "crit_price",
      rawValue: 52000,
      sourceUrl: "https://example.com/reviews/nimbus-pricing",
      sourceType: "user_review",
      confidence: 0.7
    },
    {
      id: "ev_ledger_price_spec",
      productId: "prod_ledgerflow",
      criterionId: "crit_price",
      rawValue: 68000,
      sourceUrl: "https://example.com/ledgerflow/pricing",
      sourceType: "spec",
      confidence: 0.95
    },
    {
      id: "ev_pipelane_price_spec",
      productId: "prod_pipelane",
      criterionId: "crit_price",
      rawValue: 39000,
      sourceUrl: "https://example.com/pipelane/pricing",
      sourceType: "vendor_claim",
      confidence: 0.75
    },
    {
      id: "ev_nimbus_integration_expert",
      productId: "prod_nimbus",
      criterionId: "crit_integration",
      rawValue: 8.4,
      sourceUrl: "https://example.com/expert/nimbus-integrations",
      sourceType: "expert_review",
      confidence: 0.88
    },
    {
      id: "ev_ledger_integration_expert",
      productId: "prod_ledgerflow",
      criterionId: "crit_integration",
      rawValue: 9.4,
      sourceUrl: "https://example.com/expert/ledgerflow-integrations",
      sourceType: "expert_review",
      confidence: 0.9
    },
    {
      id: "ev_pipelane_integration_vendor",
      productId: "prod_pipelane",
      criterionId: "crit_integration",
      rawValue: 6.8,
      sourceUrl: "https://example.com/pipelane/integrations",
      sourceType: "vendor_claim",
      confidence: 0.72
    },
    {
      id: "ev_nimbus_admin_user",
      productId: "prod_nimbus",
      criterionId: "crit_admin",
      rawValue: 8.1,
      sourceUrl: "https://example.com/reviews/nimbus-admin",
      sourceType: "user_review",
      confidence: 0.82
    },
    {
      id: "ev_ledger_admin_user",
      productId: "prod_ledgerflow",
      criterionId: "crit_admin",
      rawValue: 7.8,
      sourceUrl: "https://example.com/reviews/ledgerflow-admin",
      sourceType: "user_review",
      confidence: 0.8
    },
    {
      id: "ev_pipelane_admin_user",
      productId: "prod_pipelane",
      criterionId: "crit_admin",
      rawValue: 8.9,
      sourceUrl: "https://example.com/reviews/pipelane-admin",
      sourceType: "user_review",
      confidence: 0.78
    },
    {
      id: "ev_nimbus_support_expert",
      productId: "prod_nimbus",
      criterionId: "crit_support",
      rawValue: 8.2,
      sourceUrl: "https://example.com/expert/nimbus-support",
      sourceType: "expert_review",
      confidence: 0.87
    },
    {
      id: "ev_ledger_support_expert",
      productId: "prod_ledgerflow",
      criterionId: "crit_support",
      rawValue: 9.5,
      sourceUrl: "https://example.com/expert/ledgerflow-support",
      sourceType: "expert_review",
      confidence: 0.9
    },
    {
      id: "ev_pipelane_support_user",
      productId: "prod_pipelane",
      criterionId: "crit_support",
      rawValue: 6.7,
      sourceUrl: "https://example.com/reviews/pipelane-support",
      sourceType: "user_review",
      confidence: 0.74
    },
    {
      id: "ev_nimbus_soc2_spec",
      productId: "prod_nimbus",
      criterionId: "crit_soc2",
      rawValue: true,
      normalizedValue: 1,
      sourceUrl: "https://example.com/nimbus/security",
      sourceType: "spec",
      confidence: 0.96
    },
    {
      id: "ev_ledger_soc2_spec",
      productId: "prod_ledgerflow",
      criterionId: "crit_soc2",
      rawValue: true,
      normalizedValue: 1,
      sourceUrl: "https://example.com/ledgerflow/security",
      sourceType: "spec",
      confidence: 0.98
    },
    {
      id: "ev_pipelane_soc2_vendor",
      productId: "prod_pipelane",
      criterionId: "crit_soc2",
      rawValue: false,
      normalizedValue: 0,
      sourceUrl: "https://example.com/pipelane/security",
      sourceType: "vendor_claim",
      confidence: 0.85
    }
  ]
};
