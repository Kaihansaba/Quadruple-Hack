import { describe, expect, it } from "vitest";
import { isCompanyProfile } from "./server-profile";
import {
  EMPTY_EDITABLE_PROFILE,
  editableFromProfile,
  hasProfileContent,
  profileDisplayName,
  profileFirstName,
  savedProfileFromEditable
} from "./profile-storage";

describe("profile storage normalization", () => {
  it("keeps a first-run no-profile state empty and inactive", () => {
    const profile = savedProfileFromEditable(EMPTY_EDITABLE_PROFILE);

    expect(profile).toMatchObject({
      name: "",
      industry: "",
      size: "",
      budget_ceiling: null,
      tech_stack: [],
      compliance_reqs: [],
      preferred_suppliers: [],
      default_weights: {}
    });
    expect(hasProfileContent(profile)).toBe(false);
    expect(profileDisplayName(profile)).toBe("");
    expect(profileFirstName(profile)).toBeNull();
  });

  it("supports partial saved profiles as valid company profiles", () => {
    const profile = savedProfileFromEditable({
      ...EMPTY_EDITABLE_PROFILE,
      contactName: "Alex Morgan",
      complianceReqs: ["SOC 2", "HIPAA"],
      defaultWeights: [
        { criterion: "security", percent: "60" },
        { criterion: "annual_cost", percent: "40" }
      ]
    });

    expect(isCompanyProfile(profile)).toBe(true);
    expect(hasProfileContent(profile)).toBe(true);
    expect(profileFirstName(profile)).toBe("Alex");
    expect(profile.compliance_reqs).toEqual(["SOC 2", "HIPAA"]);
    expect(profile.default_weights).toEqual({ security: 0.6, annual_cost: 0.4 });
  });

  it("does not treat the seeded sample as user-entered profile content", () => {
    const profile = savedProfileFromEditable({
      ...EMPTY_EDITABLE_PROFILE,
      companyName: "Meridian Software",
      contactName: "Kaihan Saba"
    });

    expect(profile.name).toBe("Meridian Software");
    expect(hasProfileContent(profile)).toBe(true);
  });

  it("round-trips seeded or saved values into editable fields", () => {
    const editable = editableFromProfile({
      name: "Northstar Health",
      contactName: "Alex Morgan",
      organization: "Healthcare",
      industry: "Healthcare",
      size: "240 employees",
      budget_ceiling: 75000,
      compliance_reqs: ["HIPAA"],
      tech_stack: ["Slack"],
      preferred_suppliers: ["AWS"],
      default_weights: { security: 0.6 }
    });

    expect(editable.companyName).toBe("Northstar Health");
    expect(editable.contactName).toBe("Alex Morgan");
    expect(editable.complianceReqs).toEqual(["HIPAA"]);
    expect(editable.defaultWeights).toEqual([{ criterion: "security", percent: "60" }]);
  });
});
