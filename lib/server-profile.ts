import { DEMO_PROFILE } from "./demo-profile";
import type { CompanyProfile } from "./prompts";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isWeightMap(value: unknown): value is Record<string, number> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

export function isCompanyProfile(value: unknown): value is CompanyProfile {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Partial<CompanyProfile>;

  return (
    typeof profile.name === "string" &&
    typeof profile.industry === "string" &&
    typeof profile.size === "string" &&
    (typeof profile.budget_ceiling === "number" || profile.budget_ceiling === null) &&
    isStringArray(profile.tech_stack) &&
    isStringArray(profile.compliance_reqs) &&
    isStringArray(profile.preferred_suppliers) &&
    isWeightMap(profile.default_weights)
  );
}

export async function loadCompanyProfile(candidate?: unknown): Promise<CompanyProfile> {
  if (isCompanyProfile(candidate)) {
    return candidate;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return DEMO_PROFILE;
  }

  try {
    const { getCompanyProfile } = await import("./supabase");
    const profile = await getCompanyProfile();
    return isCompanyProfile(profile) ? profile : DEMO_PROFILE;
  } catch {
    return DEMO_PROFILE;
  }
}
