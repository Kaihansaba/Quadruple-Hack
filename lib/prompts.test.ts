import { describe, expect, it } from "vitest";
import { call2Prompt, type Call1Output, type CompanyProfile } from "./prompts";

const profile: CompanyProfile = {
  name: "Meridian Software",
  industry: "B2B SaaS",
  size: "120 employees",
  budget_ceiling: 100000,
  tech_stack: ["Salesforce"],
  compliance_reqs: [],
  preferred_suppliers: [],
  default_weights: {}
};

const criteria: Call1Output["criteria"] = [
  {
    id: "annual_cost",
    name: "Annual cost",
    unit: "USD/year",
    direction: "lower",
    type: "soft",
    weight: 1
  }
];

describe("call2Prompt", () => {
  it("requests structured pricing models without changing existing extraction keys", () => {
    const prompt = JSON.parse(call2Prompt(["Nimbus CRM", "LedgerFlow"], criteria, [], profile));
    const instructions = prompt.instructions.join("\n");

    expect(instructions).toContain("extracted_values");
    expect(instructions).toContain("proposed_weights");
    expect(instructions).toContain("pricing_models");
    expect(instructions).toContain('"per_seat"');
    expect(instructions).toContain('"unknown"');
    expect(instructions).toContain("Do NOT invent or estimate missing pricing numbers");
    expect(instructions).toContain("one entry per product");
  });
});
