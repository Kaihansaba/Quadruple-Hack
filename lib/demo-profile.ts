import type { CompanyProfile } from "./prompts";

export const DEMO_PROFILE: CompanyProfile = {
  name: "Meridian Software",
  industry: "B2B SaaS",
  size: "180 employees",
  budget_ceiling: 60000,
  tech_stack: ["Slack", "HubSpot", "GitHub", "AWS"],
  compliance_reqs: [],
  preferred_suppliers: [],
  default_weights: {
    annual_cost: 0.3,
    ease_of_use: 0.25,
    integrations: 0.25,
    support: 0.2
  }
};
