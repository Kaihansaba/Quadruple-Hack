import type { CompanyProfile } from "@/lib/prompts";
import { ProfileClient } from "./profile-client";

export type ProfileRecord = CompanyProfile & {
  contact_name?: string | null;
  person_name?: string | null;
  organization?: string | null;
  sector?: string | null;
};

async function loadProfile(): Promise<ProfileRecord | null> {
  return null;
}

export default async function ProfilePage() {
  const profile = await loadProfile();
  return <ProfileClient initialProfile={profile} />;
}
