import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

export async function getCompanyProfile() {
  const { data, error } = await supabase
    .from("company_profile")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
