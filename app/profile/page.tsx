import { DEMO_PROFILE } from "@/lib/demo-profile";
import type { CompanyProfile } from "@/lib/prompts";
import { ProfileClient } from "./profile-client";

export type ProfileRecord = CompanyProfile & {
  contact_name?: string | null;
  person_name?: string | null;
  organization?: string | null;
  sector?: string | null;
};

async function loadProfile(): Promise<ProfileRecord> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return DEMO_PROFILE;
  }

  try {
    const { getCompanyProfile } = await import("@/lib/supabase");
    return (await getCompanyProfile()) as ProfileRecord;
  } catch {
    return DEMO_PROFILE;
  }
}

export default async function ProfilePage() {
  const profile = await loadProfile();
  return <ProfileClient initialProfile={profile} />;
}
