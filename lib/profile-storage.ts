import type { CompanyProfile } from "./prompts";
import { DEMO_PROFILE } from "./demo-profile";

export type EditableWeight = {
  criterion: string;
  percent: string;
};

export type EditableProfile = {
  companyName: string;
  organization: string;
  industry: string;
  size: string;
  contactName: string;
  budgetCeiling: string;
  complianceReqs: string[];
  techStack: string[];
  preferredSuppliers: string[];
  defaultWeights: EditableWeight[];
};

export type SavedProfile = CompanyProfile & {
  companyName?: string | null;
  contactName?: string | null;
  organization?: string | null;
  contact_name?: string | null;
  person_name?: string | null;
  sector?: string | null;
};

export const PROFILE_STORAGE_KEY = "verdict:profile-edits:v1";
export const PROFILE_STORAGE_EVENT = "verdict:profile-edits-updated";

export const EMPTY_EDITABLE_PROFILE: EditableProfile = {
  companyName: "",
  organization: "",
  industry: "",
  size: "",
  contactName: "",
  budgetCeiling: "",
  complianceReqs: [],
  techStack: [],
  preferredSuppliers: [],
  defaultWeights: []
};

function cleanList(input: unknown): string[] {
  return Array.isArray(input)
    ? input.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function weightRows(input: Record<string, number> | null | undefined): EditableWeight[] {
  return Object.entries(input ?? {}).map(([criterion, weight]) => ({
    criterion,
    percent: Number.isFinite(weight) ? String(Math.round(weight * 100)) : ""
  }));
}

export function editableFromProfile(profile: SavedProfile | null): EditableProfile {
  if (!profile) return EMPTY_EDITABLE_PROFILE;

  return {
    companyName: profile.name ?? profile.companyName ?? "",
    organization: profile.organization ?? profile.sector ?? profile.name ?? "",
    industry: profile.industry ?? "",
    size: profile.size ?? "",
    contactName: profile.contactName ?? profile.contact_name ?? profile.person_name ?? "",
    budgetCeiling: profile.budget_ceiling == null ? "" : String(profile.budget_ceiling),
    complianceReqs: cleanList(profile.compliance_reqs),
    techStack: cleanList(profile.tech_stack),
    preferredSuppliers: cleanList(profile.preferred_suppliers),
    defaultWeights: weightRows(profile.default_weights)
  };
}

export function savedProfileFromEditable(profile: EditableProfile): SavedProfile {
  const budget = Number(profile.budgetCeiling);
  const defaultWeights = Object.fromEntries(
    profile.defaultWeights
      .map((row) => [row.criterion.trim(), Number(row.percent) / 100] as const)
      .filter(([criterion, weight]) => criterion && Number.isFinite(weight))
  );
  const contactName = profile.contactName.trim();
  const companyName = profile.companyName.trim();
  const organization = profile.organization.trim();

  return {
    name: companyName,
    companyName,
    contactName,
    contact_name: contactName,
    person_name: contactName,
    organization,
    sector: organization,
    industry: profile.industry.trim(),
    size: profile.size.trim(),
    budget_ceiling: Number.isFinite(budget) && profile.budgetCeiling.trim() ? budget : null,
    compliance_reqs: cleanList(profile.complianceReqs),
    tech_stack: cleanList(profile.techStack),
    preferred_suppliers: cleanList(profile.preferredSuppliers),
    default_weights: defaultWeights
  };
}

export function hasProfileContent(profile: SavedProfile): boolean {
  return Boolean(
    profile.name.trim() ||
      profile.industry.trim() ||
      profile.size.trim() ||
      profile.budget_ceiling != null ||
      profile.tech_stack.length ||
      profile.compliance_reqs.length ||
      profile.preferred_suppliers.length ||
      Object.keys(profile.default_weights).length ||
      profile.contactName?.trim() ||
      profile.organization?.trim()
  );
}

function isSeededSampleProfile(profile: SavedProfile): boolean {
  return (
    profile.name.trim() === DEMO_PROFILE.name &&
    (profile.contactName?.trim() === "Kaihan Saba" ||
      profile.contact_name?.trim() === "Kaihan Saba" ||
      profile.person_name?.trim() === "Kaihan Saba" ||
      !profile.contactName?.trim())
  );
}

export function readSavedProfile(): SavedProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedProfile>;
    const profile = savedProfileFromEditable(editableFromProfile(parsed as SavedProfile));
    if (isSeededSampleProfile(profile)) return null;
    return hasProfileContent(profile) ? profile : null;
  } catch {
    return null;
  }
}

export function writeSavedProfile(profile: SavedProfile) {
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event(PROFILE_STORAGE_EVENT));
}

export function profileDisplayName(profile: SavedProfile | null) {
  return profile?.contactName?.trim() || profile?.contact_name?.trim() || profile?.name.trim() || "";
}

export function profileFirstName(profile: SavedProfile | null) {
  return profileDisplayName(profile).split(/\s+/)[0] || null;
}
